import type { Size } from "./grid";
import { bitOf, mask, type Label, type NodeType, type Value } from "./node";

// What a node kind is, all in one place: its pins and their widths, its
// size, what it computes, what the player can do with it, and how it's
// drawn. Terminals, splits and joins are the same on every level; parts come
// from the levels that build them (ADR 6), through a registry made from
// those levels. Width is how many signals a terminal, split or join carries;
// other kinds ignore it.
export interface NodeKind {
  type: NodeType;
  inputCount: (width: number) => number;
  outputCount: (width: number) => number;
  // How many signals a pin carries. A wire only connects pins of the same
  // width.
  pinWidth: (side: "in" | "out", index: number, width: number) => number;
  size: (width: number) => Size;
  // One value per output pin. Terminals have no logic of their own: the
  // board sets an input's signals and lights an output from its wire.
  evaluate: (inputs: Value[], width: number) => Value[];
  // One end of the level's truth table: an input the board sets, or an
  // output it reads.
  terminal?: "input" | "output";
  // Whether a click flips its switches.
  clickable: boolean;
  // Whether the player can take it off the board. The level places its own
  // terminals.
  removable: boolean;
  look: Look;
}

// What the board needs to draw a kind.
export type Look =
  | { shape: "switch" | "lamp" }
  // A bar with its bus on one side and a single-signal pin for each bit on
  // the other.
  | { shape: "bundle"; bus: "in" | "out" }
  // A gate's schematic symbol. Inverted gates add a bubble, and exclusive
  // ones an extra back line.
  | { shape: "symbol"; symbol: "not" | "and" | "or"; inverted: boolean; exclusive: boolean }
  // A part with no symbol: a box with its pin names inside, flaring out
  // towards its outputs by flare cells when the signal fans out.
  | { shape: "box"; inputs: Label[]; outputs: Label[]; flare: number };

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

// The parts a board can hold, by name.
export type Parts = ReadonlyMap<NodeType, NodeKind>;

const TERMINAL_SIZE = { width: 4, height: 4 };
const GATE_SIZE = { width: 5, height: 4 };
const INVERTED_GATE_SIZE = { width: 6, height: 4 };

// A bus terminal is a row of switches or lamps, one cell each, starting one
// cell in from its left edge, with its value written in the three cells after
// them.
const BUS_TERMINAL_MARGIN = 5;

const terminalSize = (width: number): Size =>
  width > 1 ? { width: width + BUS_TERMINAL_MARGIN, height: 4 } : TERMINAL_SIZE;

// A bar with one single-signal pin every two cells.
const bundleSize = (width: number): Size => ({ width: 3, height: 2 * width });

const SUPPLIED: readonly NodeKind[] = [
  {
    type: "INPUT",
    inputCount: () => 0,
    outputCount: () => 1,
    pinWidth: (_side, _index, width) => width,
    size: terminalSize,
    evaluate: () => [],
    terminal: "input",
    clickable: true,
    removable: false,
    look: { shape: "switch" },
  },
  {
    type: "OUTPUT",
    inputCount: () => 1,
    outputCount: () => 0,
    pinWidth: (_side, _index, width) => width,
    size: terminalSize,
    evaluate: () => [],
    terminal: "output",
    clickable: false,
    removable: false,
    look: { shape: "lamp" },
  },
  {
    type: "SPLIT",
    inputCount: () => 1,
    outputCount: (width) => width,
    pinWidth: (side, _index, width) => (side === "in" ? width : 1),
    size: bundleSize,
    evaluate: ([bus = 0], width) => Array.from({ length: width }, (_, i) => (bus >> bitOf(width, i)) & 1),
    clickable: false,
    removable: true,
    look: { shape: "bundle", bus: "in" },
  },
  {
    type: "JOIN",
    inputCount: (width) => width,
    outputCount: () => 1,
    pinWidth: (side, _index, width) => (side === "out" ? width : 1),
    size: bundleSize,
    evaluate: (bits, width) => [bits.reduce((value, bit, i) => value | ((bit & 1) << bitOf(width, i)), 0)],
    clickable: false,
    removable: true,
    look: { shape: "bundle", bus: "out" },
  },
];

// Terminals and the wiring a level supplies: never parts (ADR 5).
const SUPPLIED_KINDS = new Map(SUPPLIED.map((kind) => [kind.type, kind]));

// The parts drawn as schematic symbols rather than boxes.
const SYMBOLS: Partial<Record<NodeType, Extract<Look, { shape: "symbol" }>>> = {
  NOT: { shape: "symbol", symbol: "not", inverted: true, exclusive: false },
  AND: { shape: "symbol", symbol: "and", inverted: false, exclusive: false },
  NAND: { shape: "symbol", symbol: "and", inverted: true, exclusive: false },
  OR: { shape: "symbol", symbol: "or", inverted: false, exclusive: false },
  NOR: { shape: "symbol", symbol: "or", inverted: true, exclusive: false },
  XOR: { shape: "symbol", symbol: "or", inverted: false, exclusive: true },
  XNOR: { shape: "symbol", symbol: "or", inverted: true, exclusive: true },
};

// DEMUX's box flares out towards its outputs, the way the signal fans out.
const FLARES: Partial<Record<NodeType, number>> = { DEMUX: 0.3 };

// A part computes its level's spec, each output masked to its pin's width.
function partKind(type: NodeType, spec: Spec): NodeKind {
  const widthOf = (label: Label | undefined): number => (label === undefined ? 1 : (spec.widths?.[label] ?? 1));
  // Kept alongside, since a test run evaluates parts hundreds of thousands
  // of times.
  const outputWidths = spec.outputs.map(widthOf);
  const symbol = SYMBOLS[type];
  // A part with no symbol is a box, tall enough to keep its pins two cells
  // apart.
  let size: Size = { width: 6, height: Math.max(4, 2 * Math.max(spec.inputs.length, spec.outputs.length)) };
  if (symbol) size = symbol.inverted ? INVERTED_GATE_SIZE : GATE_SIZE;
  return {
    type,
    inputCount: () => spec.inputs.length,
    outputCount: () => spec.outputs.length,
    pinWidth: (side, index) => widthOf((side === "in" ? spec.inputs : spec.outputs)[index]),
    size: () => size,
    evaluate: (inputs) => {
      const values = spec.target(inputs);
      for (let i = 0; i < values.length; i++) values[i] = mask(values[i] ?? 0, outputWidths[i] ?? 1);
      return values;
    },
    clickable: false,
    removable: true,
    look: symbol ?? { shape: "box", inputs: spec.inputs, outputs: spec.outputs, flare: FLARES[type] ?? 0 },
  };
}

// The registry of parts, one for each level's gate.
export function partsFrom(levels: readonly (Spec & { gate: NodeType })[]): Parts {
  return new Map(levels.map((level) => [level.gate, partKind(level.gate, level)]));
}

// Every kind a board with these parts can hold.
export function kinds(parts: Parts): NodeKind[] {
  return [...SUPPLIED, ...parts.values()];
}

export function hasKind(parts: Parts, type: NodeType): boolean {
  return SUPPLIED_KINDS.has(type) || parts.has(type);
}

export function kindOf(parts: Parts, type: NodeType): NodeKind {
  const kind = SUPPLIED_KINDS.get(type) ?? parts.get(type);
  if (kind === undefined) throw new Error(`No node kind ${type}`);
  return kind;
}

// How far down from a node's top edge a pin sits. A side's pins are two
// cells apart, centred on the edge, so they land on grid points.
export function pinOffset(kind: NodeKind, side: "in" | "out", index: number, width = 1): number {
  const count = side === "in" ? kind.inputCount(width) : kind.outputCount(width);
  return kind.size(width).height / 2 - (count - 1) + 2 * index;
}
