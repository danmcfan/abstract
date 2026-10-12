import type { Rect } from "./grid";

export type NodeType = "INPUT" | "OUTPUT" | "NOT" | "OR" | "NOR" | "AND" | "NAND" | "XOR" | "XNOR" | "MUX";

// A terminal's or a pin's short name, such as A, SEL, SUM or OUT. Each level
// names its own; gates and other unnamed nodes have "".
export type Label = string;

export type NodeID = number;

// Pure gate facts. Boards of nodes live in circuit.ts.

export interface Node {
  id: NodeID;
  type: NodeType;
  label: Label;
  rect: Rect;
  // Whether the node shows as on: a switch that's flipped on, a lit lamp, or
  // a gate with any output on.
  isHigh: boolean;
  // The signal on each output pin, in pin order.
  signals: boolean[];
}

// What a part computes, as its level says (ADR 6): its pin names in order,
// and one output per output pin.
export interface Spec {
  inputs: Label[];
  outputs: Label[];
  target: (inputs: boolean[]) => boolean[];
}

// Parts defined by their levels. A type with no spec falls back to the
// built-in gates below, which match their levels.
const specs = new Map<NodeType, Spec>();

export function definePart(type: NodeType, spec: Spec): void {
  specs.set(type, spec);
}

export function partSpec(type: NodeType): Spec | undefined {
  return specs.get(type);
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
    default:
      // A part with no symbol is a box, tall enough to keep its pins two
      // cells apart.
      return { width: 6, height: Math.max(4, 2 * Math.max(inputCount(type), outputCount(type))) };
  }
}

export function inputCount(type: NodeType): number {
  const spec = specs.get(type);
  if (spec) return spec.inputs.length;
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
  const spec = specs.get(type);
  if (spec) return spec.outputs.length;
  return type === "OUTPUT" ? 0 : 1;
}

// How far down from a node's top edge a pin sits. A side's pins are two
// cells apart, centred on the edge, so they land on grid points.
export function pinOffset(type: NodeType, side: "in" | "out", index: number): number {
  const count = side === "in" ? inputCount(type) : outputCount(type);
  return nodeSize(type).height / 2 - (count - 1) + 2 * index;
}

// One value per output pin. Terminals have no logic of their own: the board
// sets an INPUT's signal and lights an OUTPUT from its wire.
export function evaluate(type: NodeType, inputs: boolean[]): boolean[] {
  const spec = specs.get(type);
  if (spec) return spec.target(inputs);
  if (type === "INPUT" || type === "OUTPUT") return [];
  return [gate(type, inputs[0] ?? false, inputs[1] ?? false)];
}

function gate(type: NodeType, a: boolean, b: boolean): boolean {
  switch (type) {
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
    default:
      return false;
  }
}
