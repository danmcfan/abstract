import { GRID_HEIGHT, GRID_WIDTH, overlaps, snap, type Rect } from "./grid";
import { evaluate, inputCount, nodeSize, outputCount, type Label, type Node, type NodeID, type NodeType } from "./node";

// The board: nodes, the wires between them, and the signals on both. Every
// command leaves the circuit settled, so readers never see stale signals.
// Invariants: wires run output pin -> input pin, an input pin takes at most
// one wire, wires never form a loop, and every wire's nodes exist.

export type EdgeID = number;

export interface Edge {
  id: EdgeID;
  from: NodeID;
  fromIndex: number;
  to: NodeID;
  toIndex: number;
  isHigh: boolean;
}

export interface Game {
  nodes: Map<NodeID, Node>;
  edges: Map<EdgeID, Edge>;
  nextNodeID: NodeID;
  nextEdgeID: EdgeID;
}

// A connection point on a node. Input pins sit on the left edge, the output
// pin on the right edge.
export interface Pin {
  node: NodeID;
  side: "in" | "out";
  index: number;
}

export function newGame(): Game {
  return { nodes: new Map(), edges: new Map(), nextNodeID: 0, nextEdgeID: 0 };
}

// Commands

// Adds a node at the free spot nearest center, searching outward ring by
// ring. Returns null when the board has no room.
export function placeNode(game: Game, type: NodeType, center: { x: number; y: number }, label: Label = "NONE"): Node | null {
  const rect = freeRect(game, type, center);
  if (!rect) return null;
  const node: Node = { id: game.nextNodeID++, type, label, rect, isHigh: false };
  game.nodes.set(node.id, node);
  settle(game);
  return node;
}

// Moves a node to the snapped position nearest (x, y), unless that would
// overlap another node. Returns whether the node moved.
export function moveNode(game: Game, id: NodeID, x: number, y: number): boolean {
  const node = game.nodes.get(id);
  if (!node) return false;
  const rect = snap({ ...node.rect, x, y });
  if (collides(game, rect, id)) return false;
  node.rect = rect;
  return true;
}

// Removes a node and every wire touching it.
export function removeNode(game: Game, id: NodeID): void {
  if (!game.nodes.delete(id)) return;
  for (const edge of game.edges.values()) {
    if (edge.from === id || edge.to === id) game.edges.delete(edge.id);
  }
  settle(game);
}

// Wires an output pin to an input pin, in either order. An input pin takes
// one wire, so an existing wire into it is replaced. Refuses wires that
// would form a loop. Returns the new edge, or null if refused.
export function wire(game: Game, a: Pin, b: Pin): Edge | null {
  const [from, to] = a.side === "out" ? [a, b] : [b, a];
  if (from.side !== "out" || to.side !== "in" || from.node === to.node) return null;
  if (!game.nodes.has(from.node) || !game.nodes.has(to.node)) return null;
  if (reaches(game, to.node, from.node)) return null;

  const old = edgeInto(game, to.node, to.index);
  if (old) game.edges.delete(old.id);
  const edge: Edge = { id: game.nextEdgeID++, from: from.node, fromIndex: from.index, to: to.node, toIndex: to.index, isHigh: false };
  game.edges.set(edge.id, edge);
  settle(game);
  return edge;
}

// Removes the wire into an input pin, if any.
export function unwire(game: Game, pin: Pin): void {
  const edge = edgeInto(game, pin.node, pin.index);
  if (!edge) return;
  game.edges.delete(edge.id);
  settle(game);
}

// Sets an INPUT terminal's value. Other node types ignore it.
export function setInput(game: Game, id: NodeID, value: boolean): void {
  const node = game.nodes.get(id);
  if (node?.type !== "INPUT") return;
  node.isHigh = value;
  settle(game);
}

// Reads

export function edgeInto(game: Game, node: NodeID, index: number): Edge | undefined {
  for (const edge of game.edges.values()) {
    if (edge.to === node && edge.toIndex === index) return edge;
  }
  return undefined;
}

export function pinPosition(node: Node, side: Pin["side"], index: number): { x: number; y: number } {
  const { x, y, width, height } = node.rect;
  if (side === "out") return { x: x + width, y: y + height / 2 };
  const count = inputCount(node.type);
  if (count === 1) return { x, y: y + height / 2 };
  return { x, y: y + 1 + (index * (height - 2)) / (count - 1) };
}

export function pins(node: Node): Pin[] {
  const result: Pin[] = [];
  for (let i = 0; i < inputCount(node.type); i++) result.push({ node: node.id, side: "in", index: i });
  for (let i = 0; i < outputCount(node.type); i++) result.push({ node: node.id, side: "out", index: i });
  return result;
}

// Returns the pin nearest (x, y) within radius cells.
export function pinAt(game: Game, x: number, y: number, radius = 1): Pin | null {
  let best: Pin | null = null;
  let bestDistance = radius;
  for (const node of game.nodes.values()) {
    for (const pin of pins(node)) {
      const p = pinPosition(node, pin.side, pin.index);
      const distance = Math.hypot(p.x - x, p.y - y);
      if (distance < bestDistance) {
        best = pin;
        bestDistance = distance;
      }
    }
  }
  return best;
}

// Internals

function freeRect(game: Game, type: NodeType, center: { x: number; y: number }): Rect | null {
  const { width, height } = nodeSize(type);
  for (let ring = 0; ring < GRID_WIDTH + GRID_HEIGHT; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const rect = snap({ x: center.x - width / 2 + dx, y: center.y - height / 2 + dy, width, height });
        if (!collides(game, rect)) return rect;
      }
    }
  }
  return null;
}

function collides(game: Game, rect: Rect, except?: NodeID): boolean {
  for (const other of game.nodes.values()) {
    if (other.id !== except && overlaps(rect, other.rect)) return true;
  }
  return false;
}

// Whether signals flow from start to target along wires.
function reaches(game: Game, start: NodeID, target: NodeID): boolean {
  const seen = new Set<NodeID>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of game.edges.values()) {
      if (edge.from === id) stack.push(edge.to);
    }
  }
  return false;
}

// Recomputes every node and wire from the INPUT terminals. Unwired input pins
// read low. The circuit has no loops, so one pass in dependency order settles it.
function settle(game: Game): void {
  const into = new Map<NodeID, Edge[]>();
  for (const edge of game.edges.values()) into.set(edge.to, [...(into.get(edge.to) ?? []), edge]);
  const done = new Set<NodeID>();
  const visit = (node: Node): void => {
    if (done.has(node.id)) return;
    done.add(node.id);
    if (node.type === "INPUT") return;
    const inputs = Array<boolean>(inputCount(node.type)).fill(false);
    for (const edge of into.get(node.id) ?? []) {
      const from = game.nodes.get(edge.from)!;
      visit(from);
      edge.isHigh = from.isHigh;
      inputs[edge.toIndex] = from.isHigh;
    }
    node.isHigh = evaluate(node.type, inputs);
  };
  for (const node of game.nodes.values()) visit(node);
}
