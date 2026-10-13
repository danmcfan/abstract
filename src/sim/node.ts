import type { Rect } from "./grid";

export type NodeType =
  "INPUT" | "OUTPUT" | "SPLIT" | "JOIN" | "NOT" | "OR" | "NOR" | "AND" | "NAND" | "XOR" | "XNOR" | "MUX" | "DEMUX";

// A terminal's or a pin's short name, such as A, SEL, SUM or OUT. Each level
// names its own; gates and other unnamed nodes have "".
export type Label = string;

export type NodeID = number;

// The signals on a pin or wire as one number. A single signal is 0 or 1; on a
// bus of width N, bit i of the number is signal i.
export type Value = number;

// The widest bus a pin can carry.
export const MAX_WIDTH = 8;

// Pure gate facts. Boards of nodes live in circuit.ts.

export interface Node {
  id: NodeID;
  type: NodeType;
  label: Label;
  rect: Rect;
  // How many signals a terminal carries, or a split's or join's bus side. 1
  // for every other node: a part's pin widths come from its spec.
  width: number;
  // Whether the node shows as on: a switch with any bit flipped on, a lamp
  // with any bit lit, or a gate with any output on.
  isHigh: boolean;
  // The value on each output pin, in pin order. An INPUT's is its switches.
  signals: Value[];
}

// What a part computes, as its level says (ADR 6): its pin names in order,
// and one output value per output pin.
export interface Spec {
  inputs: Label[];
  outputs: Label[];
  // The width of each bus pin, by name. A pin that isn't listed carries one
  // signal.
  widths?: Partial<Record<Label, number>>;
  target: (inputs: Value[]) => Value[];
}

// Parts defined by their levels. A type with no spec falls back to the
// built-in gates below, which match their levels. The output widths are kept
// alongside, since a test run evaluates parts hundreds of thousands of times.
const specs = new Map<NodeType, { spec: Spec; outputWidths: number[] }>();

export function definePart(type: NodeType, spec: Spec): void {
  specs.set(type, { spec, outputWidths: spec.outputs.map((label) => spec.widths?.[label] ?? 1) });
}

export function partSpec(type: NodeType): Spec | undefined {
  return specs.get(type)?.spec;
}

export function mask(value: Value, width: number): Value {
  return value & ((1 << width) - 1);
}

const TERMINAL_SIZE = { width: 4, height: 4 };
const GATE_SIZE = { width: 5, height: 4 };
const INVERTED_GATE_SIZE = { width: 6, height: 4 };

// A bus terminal is a row of switches or lamps, one cell each, starting one
// cell in from its left edge, with its value written in the three cells after
// them.
const BUS_TERMINAL_MARGIN = 5;

// The left edge of the cell holding a bus terminal's switch or lamp for a
// bit, within the node. The high bit comes first, as numbers are written.
export function bitCell(width: number, bit: number): number {
  return 1 + (width - 1 - bit);
}

export function nodeSize(type: NodeType, width = 1): { width: number; height: number } {
  switch (type) {
    case "INPUT":
    case "OUTPUT":
      return width > 1 ? { width: width + BUS_TERMINAL_MARGIN, height: 4 } : TERMINAL_SIZE;
    case "SPLIT":
    case "JOIN":
      // A bar with one single-signal pin every two cells.
      return { width: 3, height: 2 * width };
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

export function inputCount(type: NodeType, width = 1): number {
  const part = specs.get(type);
  if (part) return part.spec.inputs.length;
  switch (type) {
    case "INPUT":
      return 0;
    case "OUTPUT":
    case "NOT":
    case "SPLIT":
      return 1;
    case "JOIN":
      return width;
    default:
      return 2;
  }
}

export function outputCount(type: NodeType, width = 1): number {
  const part = specs.get(type);
  if (part) return part.spec.outputs.length;
  if (type === "SPLIT") return width;
  return type === "OUTPUT" ? 0 : 1;
}

// How many signals a pin carries. A wire only connects pins of the same
// width.
export function pinWidth(type: NodeType, side: "in" | "out", index: number, width = 1): number {
  const part = specs.get(type);
  if (part) {
    const { spec } = part;
    return spec.widths?.[(side === "in" ? spec.inputs : spec.outputs)[index] ?? ""] ?? 1;
  }
  switch (type) {
    case "INPUT":
    case "OUTPUT":
      return width;
    case "SPLIT":
      return side === "in" ? width : 1;
    case "JOIN":
      return side === "out" ? width : 1;
    default:
      return 1;
  }
}

// Which bit of the bus a split's output pin, or a join's input pin, carries.
// The high bit is at the top, as it's first in a written number.
export function bitOf(width: number, index: number): number {
  return width - 1 - index;
}

// How far down from a node's top edge a pin sits. A side's pins are two
// cells apart, centred on the edge, so they land on grid points.
export function pinOffset(type: NodeType, side: "in" | "out", index: number, width = 1): number {
  const count = side === "in" ? inputCount(type, width) : outputCount(type, width);
  return nodeSize(type, width).height / 2 - (count - 1) + 2 * index;
}

// One value per output pin. Terminals have no logic of their own: the board
// sets an INPUT's signals and lights an OUTPUT from its wire.
export function evaluate(type: NodeType, inputs: Value[], width = 1): Value[] {
  const part = specs.get(type);
  if (part) {
    const values = part.spec.target(inputs);
    for (let i = 0; i < values.length; i++) values[i] = mask(values[i]!, part.outputWidths[i] ?? 1);
    return values;
  }
  switch (type) {
    case "INPUT":
    case "OUTPUT":
      return [];
    case "SPLIT": {
      const bits: Value[] = [];
      for (let i = 0; i < width; i++) bits.push(((inputs[0] ?? 0) >> bitOf(width, i)) & 1);
      return bits;
    }
    case "JOIN":
      return [inputs.reduce((value, bit, i) => value | ((bit & 1) << bitOf(width, i)), 0)];
    default:
      return [gate(type, inputs[0] ?? 0, inputs[1] ?? 0)];
  }
}

function gate(type: NodeType, a: Value, b: Value): Value {
  switch (type) {
    case "NOT":
      return 1 - a;
    case "OR":
      return a | b;
    case "NOR":
      return 1 - (a | b);
    case "AND":
      return a & b;
    case "NAND":
      return 1 - (a & b);
    case "XOR":
      return a ^ b;
    case "XNOR":
      return 1 - (a ^ b);
    default:
      return 0;
  }
}
