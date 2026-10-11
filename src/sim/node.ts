import { GRID_HEIGHT, GRID_WIDTH, overlaps, snap, type Rect } from "./grid";

export type NodeType = "INPUT" | "OUTPUT" | "NOT" | "OR" | "NOR" | "AND" | "NAND" | "XOR" | "XNOR";

export type Label = "NONE" | "ALPHA" | "BETA";

export type NodeID = number;
export type EdgeID = number;

export interface Node {
  id: NodeID;
  type: NodeType;
  label: Label;
  rect: Rect;
  isHigh: boolean;
  edges: EdgeID[];
}

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

const TERMINAL_SIZE = { width: 4, height: 4 };
const GATE_SIZE = { width: 5, height: 4 };
const INVERTED_GATE_SIZE = { width: 6, height: 4 };

export function newGame(): Game {
  return { nodes: new Map(), edges: new Map(), nextNodeID: 0, nextEdgeID: 0 };
}

export function addNode(game: Game, type: NodeType, center: { x: number; y: number }, label: Label = "NONE"): Node {
  const { width, height } = nodeSize(type);
  const node: Node = {
    id: game.nextNodeID++,
    type,
    label,
    rect: snap({ x: center.x - width / 2, y: center.y - height / 2, width, height }),
    isHigh: false,
    edges: [],
  };
  game.nodes.set(node.id, node);
  return node;
}

export function deleteNode(game: Game, id: NodeID): void {
  const node = game.nodes.get(id);
  if (!node) return;
  for (const edgeID of node.edges) {
    const edge = game.edges.get(edgeID);
    if (!edge) continue;
    const other = game.nodes.get(edge.from === id ? edge.to : edge.from);
    if (other) other.edges = other.edges.filter((e) => e !== edgeID);
    game.edges.delete(edgeID);
  }
  game.nodes.delete(id);
}

// Adds a node at the free spot nearest center, searching outward ring by
// ring. Returns null when the board has no room.
export function placeNode(game: Game, type: NodeType, center: { x: number; y: number }): Node | null {
  const { width, height } = nodeSize(type);
  for (let ring = 0; ring < GRID_WIDTH + GRID_HEIGHT; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const rect = snap({ x: center.x - width / 2 + dx, y: center.y - height / 2 + dy, width, height });
        if ([...game.nodes.values()].some((other) => overlaps(rect, other.rect))) continue;
        const node = addNode(game, type, center);
        node.rect = rect;
        return node;
      }
    }
  }
  return null;
}

// Moves a node to the snapped position nearest (x, y), unless that would
// overlap another node. Returns whether the node moved.
export function moveNode(game: Game, id: NodeID, x: number, y: number): boolean {
  const node = game.nodes.get(id);
  if (!node) return false;
  const rect = snap({ ...node.rect, x, y });
  for (const other of game.nodes.values()) {
    if (other.id !== id && overlaps(rect, other.rect)) return false;
  }
  node.rect = rect;
  return true;
}

export function nodeSize(type: NodeType): { width: number; height: number } {
  switch (type) {
    case "INPUT":
    case "OUTPUT":
      return TERMINAL_SIZE;
    case "OR":
    case "AND":
    case "XOR":
      return GATE_SIZE;
    case "NOT":
    case "NOR":
    case "NAND":
    case "XNOR":
      return INVERTED_GATE_SIZE;
  }
}

export function inputCount(type: NodeType): number {
  switch (type) {
    case "INPUT":
      return 0;
    case "OUTPUT":
    case "NOT":
      return 1;
    default:
      return 2;
  }
}

export function outputCount(type: NodeType): number {
  return type === "OUTPUT" ? 0 : 1;
}

export function evaluate(type: NodeType, a: boolean, b: boolean): boolean {
  switch (type) {
    case "INPUT":
    case "OUTPUT":
      return a;
    case "NOT":
      return !a;
    case "OR":
      return a || b;
    case "NOR":
      return !(a || b);
    case "AND":
      return a && b;
    case "NAND":
      return !(a && b);
    case "XOR":
      return a !== b;
    case "XNOR":
      return a === b;
  }
}
