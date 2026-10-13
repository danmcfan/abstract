import { moveNode, pinAt, removeNode, setInput, switchAt, unwire, wire, type Game, type Pin } from "./circuit";
import { contains } from "./grid";
import type { NodeID } from "./node";
import { silent, type Sound } from "./sound";

// Board gestures: pointer input, already in board coordinates, turned into
// circuit commands. Every edit goes through edit() so the caller can observe
// it; nothing is editable while locked. Flipping a switch, drawing a wire
// and connecting it play their sound cues.

export interface Point {
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
  sound?: Sound;
}

export function nodeAt(game: Game, x: number, y: number): NodeID | null {
  for (const node of game.nodes.values()) if (contains(node.rect, x, y)) return node.id;
  return null;
}

export function createGestures(host: GestureHost): Gestures {
  let hoveredPin: Pin | null = null;
  let hoveredNode: NodeID | null = null;
  let preview: { from: Pin; to: Point } | null = null;
  let drag: { id: NodeID; offsetX: number; offsetY: number; moved: boolean } | null = null;
  const sound = host.sound ?? silent;

  const hover = (p: Point) => {
    hoveredPin = pinAt(host.game(), p.x, p.y);
    hoveredNode = hoveredPin ? null : nodeAt(host.game(), p.x, p.y);
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
      if (node) drag = { id: node.id, offsetX: p.x - node.rect.x, offsetY: p.y - node.rect.y, moved: false };
    },

    move(p) {
      hover(p);
      // The pencil scratches only while the pointer moves.
      if (preview && (preview.to.x !== p.x || preview.to.y !== p.y)) {
        preview = { ...preview, to: p };
        if (!host.locked()) sound.play("pencil");
      }
      if (drag && !host.locked()) {
        const d = drag;
        host.edit((g) => {
          if (moveNode(g, d.id, p.x - d.offsetX, p.y - d.offsetY)) d.moved = true;
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
      // bit under the pointer on a bus input.
      if (d && !d.moved) {
        host.edit((g) => {
          const node = g.nodes.get(d.id);
          if (node?.type !== "INPUT") return;
          const bit = node.width === 1 ? 0 : switchAt(node, p.x, p.y);
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
      if (pin?.side === "in") return host.edit((g) => unwire(g, pin));
      const node = host.game().nodes.get(nodeAt(host.game(), p.x, p.y) ?? -1);
      if (node && node.type !== "INPUT" && node.type !== "OUTPUT") host.edit((g) => removeNode(g, node.id));
    },
  };
}
