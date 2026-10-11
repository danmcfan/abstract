import type { Rect } from "./grid";

export type NodeType = "INPUT" | "OUTPUT" | "NOT" | "OR" | "NOR" | "AND" | "NAND" | "XOR" | "XNOR";

export type Label = "NONE" | "ALPHA" | "BETA";

export type NodeID = number;

// Pure gate facts. Boards of nodes live in circuit.ts.

export interface Node {
  id: NodeID;
  type: NodeType;
  label: Label;
  rect: Rect;
  isHigh: boolean;
}

const TERMINAL_SIZE = { width: 4, height: 4 };
const GATE_SIZE = { width: 5, height: 4 };
const INVERTED_GATE_SIZE = { width: 6, height: 4 };

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
