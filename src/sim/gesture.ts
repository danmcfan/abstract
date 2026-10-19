import {
  canWire,
  edgeInto,
  moveNode,
  nodeKind,
  pinAt,
  pinPosition,
  removeNode,
  setInput,
  switchAt,
  unwire,
  wire,
  type EdgeID,
  type Game,
  type Pin,
} from "./circuit";
import { contains } from "./grid";
import type { NodeID } from "./node";
import { silent, type Sound } from "./sound";

// Board gestures: pointer input, already in board coordinates, turned into
// circuit commands. Pressing a wired input pin lifts its wire off: dropping
// it on another pin moves it there, and dropping it on empty board removes
// it. Every edit goes through edit() so the caller can observe
// it; nothing is editable while locked. Flipping a switch, drawing a wire
// and connecting it play their sound cues.

// A press only becomes a drag once the pointer has moved this far on screen;
// anything less is a click, however large the board is drawn.
const DRAG_DEAD_ZONE_PX = 5;

// Whether a press has moved far enough on screen, in pixels, to be a drag.
export const pastDeadZone = (dx: number, dy: number): boolean => Math.hypot(dx, dy) >= DRAG_DEAD_ZONE_PX;
// The radius of a drawn pin dot, in cells: over a switch, a pin takes the
// press only on its dot rather than across its usual cell-wide reach.
const PIN_DOT = 0.26;
// How far a pin reaches, in cells: a cell over a part's body, so the body
// still takes a press, and further out over open board or while drawing a
// wire, so a pin is easy to hit.
const PIN_REACH = 1;
const PIN_REACH_OPEN = 1.5;

interface Point {
  x: number;
  y: number;
}

export interface Gestures {
  // A pin under the pointer wins over the node under it.
  readonly hoveredPin: Pin | null;
  readonly hoveredNode: NodeID | null;
  // The wire being drawn, from a pin to the pointer. Over a pin it could
  // join, the end snaps to that pin; over one it can't, valid is false.
  readonly preview: Preview | null;
  // The node held down, whether or not it has moved yet.
  readonly pressedNode: NodeID | null;
  // Whether a node is being dragged.
  readonly dragging: boolean;
  down(point: Point, button: number): void;
  move(point: Point): void;
  up(point: Point): void;
  contextMenu(point: Point): void;
}

interface Preview {
  from: Pin;
  to: Point;
  target: Pin | null;
  valid: boolean;
  // The wire lifted off its input pin to be moved, hidden while it's drawn.
  lifted: EdgeID | null;
}

export interface GestureHost {
  game(): Game;
  edit(change: (game: Game) => void): void;
  locked(): boolean;
  // Screen pixels per board cell, for the drag dead zone.
  pixelsPerCell(): number;
  sound?: Sound;
}

const samePin = (a: Pin, b: Pin): boolean => a.node === b.node && a.side === b.side && a.index === b.index;

function nodeAt(game: Game, x: number, y: number): NodeID | null {
  for (const node of game.nodes.values()) if (contains(node.rect, x, y)) return node.id;
  return null;
}

export function createGestures(host: GestureHost): Gestures {
  let hoveredPin: Pin | null = null;
  let hoveredNode: NodeID | null = null;
  let preview: Preview | null = null;
  // started: the pointer has left the dead zone, so this press is a drag.
  let drag: { id: NodeID; start: Point; offsetX: number; offsetY: number; started: boolean } | null = null;
  const sound = host.sound ?? silent;

  // An input's output pin sits beside its switch, and a neighbour's pin may
  // reach over it too; inside a switch's body the switch wins everywhere but
  // on a pin's dot.
  const hover = (p: Point): void => {
    const game = host.game();
    const under = game.nodes.get(nodeAt(game, p.x, p.y) ?? -1);
    const onSwitch = under !== undefined && nodeKind(game, under).clickable;
    let reach = under && !preview ? PIN_REACH : PIN_REACH_OPEN;
    if (onSwitch) reach = PIN_DOT;
    hoveredPin = pinAt(game, p.x, p.y, reach);
    hoveredNode = hoveredPin ? null : (under?.id ?? null);
  };
  // Points the preview at p, snapping to the pin under it if the wire could
  // join it. The pin a lifted wire came off counts as joinable, to put it back.
  const aim = (from: Pin, lifted: EdgeID | null, p: Point): Preview => {
    const game = host.game();
    const target = hoveredPin && !samePin(hoveredPin, from) ? hoveredPin : null;
    const valid = target === null || canWire(game, from, target);
    const node = target && valid ? game.nodes.get(target.node) : undefined;
    const to = target && node ? pinPosition(game, node, target.side, target.index) : p;
    return { from, to, target, valid, lifted };
  };
  // Whether the pointer has left a press's dead zone, making it a drag.
  const leftDeadZone = (start: Point, p: Point): boolean =>
    pastDeadZone((p.x - start.x) * host.pixelsPerCell(), (p.y - start.y) * host.pixelsPerCell());

  // Ends a drawn wire. A lifted wire dropped on an empty spot is removed,
  // and on a pin it can't join it stays where it was.
  const drop = (drawn: Preview): void => {
    const { from, target, valid, lifted } = drawn;
    const edge = lifted === null ? undefined : host.game().edges.get(lifted);
    if (target === null || !valid) {
      if (edge && target === null)
        host.edit((g) => {
          unwire(g, { node: edge.to, side: "in", index: edge.toIndex });
        });
      return;
    }
    if (edge && edge.to === target.node && edge.toIndex === target.index && target.side === "in") return;
    host.edit((g) => {
      if (edge) unwire(g, { node: edge.to, side: "in", index: edge.toIndex });
      if (wire(g, from, target)) sound.play("connect");
    });
  };

  return {
    get hoveredPin() {
      return hoveredPin;
    },
    get hoveredNode() {
      return hoveredNode;
    },
    get preview() {
      return preview;
    },
    get pressedNode() {
      return drag?.id ?? null;
    },
    get dragging() {
      return drag !== null;
    },

    down(p, button) {
      hover(p);
      if (button !== 0 || host.locked()) return;
      if (hoveredPin) {
        const game = host.game();
        const edge = hoveredPin.side === "in" ? edgeInto(game, hoveredPin.node, hoveredPin.index) : undefined;
        preview = edge
          ? aim({ node: edge.from, side: "out", index: edge.fromIndex }, edge.id, p)
          : aim(hoveredPin, null, p);
        return;
      }
      const node = host.game().nodes.get(hoveredNode ?? -1);
      if (node)
        drag = {
          id: node.id,
          start: p,
          offsetX: p.x - node.rect.x,
          offsetY: p.y - node.rect.y,
          started: false,
        };
    },

    move(p) {
      hover(p);
      // The pencil scratches only while the pointer moves.
      if (preview) {
        const next = aim(preview.from, preview.lifted, p);
        if ((next.to.x !== preview.to.x || next.to.y !== preview.to.y) && !host.locked()) sound.play("pencil");
        preview = next;
      }
      if (drag !== null && !drag.started) drag.started = leftDeadZone(drag.start, p);
      if (drag !== null && drag.started && !host.locked()) {
        const d = drag;
        host.edit((g) => {
          moveNode(g, d.id, p.x - d.offsetX, p.y - d.offsetY);
        });
      }
    },

    up(p) {
      hover(p);
      const drawn = preview && aim(preview.from, preview.lifted, p);
      const d = drag;
      preview = null;
      drag = null;
      if (host.locked()) return;
      if (drawn) drop(drawn);
      // A click flips a switch: a single-signal input's one switch, or the
      // bit pressed on a bus input.
      if (d && !d.started && !leftDeadZone(d.start, p)) {
        host.edit((g) => {
          const node = g.nodes.get(d.id);
          if (!node || !nodeKind(g, node).clickable) return;
          const bit = node.width === 1 ? 0 : switchAt(g, node, d.start.x, d.start.y);
          if (bit === null) return;
          setInput(g, node.id, (node.signals[0] ?? 0) ^ (1 << bit));
          sound.play("switch");
        });
      }
    },

    contextMenu(p) {
      hover(p);
      if (host.locked()) return;
      const pin = hoveredPin;
      if (pin?.side === "in") {
        host.edit((g) => {
          unwire(g, pin);
        });
        return;
      }
      const game = host.game();
      const node = game.nodes.get(nodeAt(game, p.x, p.y) ?? -1);
      if (node && nodeKind(game, node).removable)
        host.edit((g) => {
          removeNode(g, node.id);
        });
    },
  };
}
