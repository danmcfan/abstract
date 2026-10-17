import {
  moveNode,
  nodeKind,
  pinAt,
  removeNode,
  setInput,
  switchAt,
  unwire,
  wire,
  type Game,
  type Pin,
} from "./circuit";
import { contains } from "./grid";
import type { NodeID } from "./node";
import { silent, type Sound } from "./sound";

// Board gestures: pointer input, already in board coordinates, turned into
// circuit commands. Every edit goes through edit() so the caller can observe
// it; nothing is editable while locked. Flipping a switch, drawing a wire
// and connecting it play their sound cues.

// A press only becomes a drag once the pointer has moved this far on screen;
// anything less is a click, however large the board is drawn.
const DRAG_DEAD_ZONE_PX = 5;
// The radius of a drawn pin dot, in cells: over a switch, a pin takes the
// press only on its dot rather than across its usual cell-wide reach.
const PIN_DOT = 0.26;

interface Point {
  x: number;
  y: number;
}

export interface Gestures {
  // A pin under the pointer wins over the node under it.
  readonly hoveredPin: Pin | null;
  readonly hoveredNode: NodeID | null;
  // The wire being drawn, from a pin to the pointer.
  readonly preview: { from: Pin; to: Point } | null;
  // Whether a node is being dragged.
  readonly dragging: boolean;
  down(point: Point, button: number): void;
  move(point: Point): void;
  up(point: Point): void;
  contextMenu(point: Point): void;
}

export interface GestureHost {
  game(): Game;
  edit(change: (game: Game) => void): void;
  locked(): boolean;
  // Screen pixels per board cell, for the drag dead zone.
  pixelsPerCell(): number;
  sound?: Sound;
}

function nodeAt(game: Game, x: number, y: number): NodeID | null {
  for (const node of game.nodes.values()) if (contains(node.rect, x, y)) return node.id;
  return null;
}

export function createGestures(host: GestureHost): Gestures {
  let hoveredPin: Pin | null = null;
  let hoveredNode: NodeID | null = null;
  let preview: { from: Pin; to: Point } | null = null;
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
    hoveredPin = pinAt(game, p.x, p.y, onSwitch ? PIN_DOT : 1);
    hoveredNode = hoveredPin ? null : (under?.id ?? null);
  };
  // Whether the pointer has left a press's dead zone, making it a drag.
  const leftDeadZone = (start: Point, p: Point): boolean =>
    Math.hypot(p.x - start.x, p.y - start.y) * host.pixelsPerCell() >= DRAG_DEAD_ZONE_PX;

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
    get dragging() {
      return drag !== null;
    },

    down(p, button) {
      hover(p);
      if (button !== 0 || host.locked()) return;
      if (hoveredPin) {
        preview = { from: hoveredPin, to: p };
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
      if (preview && (preview.to.x !== p.x || preview.to.y !== p.y)) {
        preview = { ...preview, to: p };
        if (!host.locked()) sound.play("pencil");
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
      const from = preview?.from;
      const to = hoveredPin;
      const d = drag;
      preview = null;
      drag = null;
      if (host.locked()) return;
      if (from && to) {
        host.edit((g) => {
          if (wire(g, from, to)) sound.play("connect");
        });
      }
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
