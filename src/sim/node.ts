import type { Rect } from "./grid";

// The name of a node's kind: a terminal, a split or join, or a part, which
// takes its level's name. The kinds a board knows are in kind.ts.
export type NodeType = string;

// A terminal's or a pin's short name, such as A, SEL, SUM or OUT. Each level
// names its own; gates and other unnamed nodes have "".
export type Label = string;

export type NodeID = number;

// The signals on a pin or wire as one number. A single signal is 0 or 1; on a
// bus of width N, bit i of the number is signal i.
export type Value = number;

// A memory part's state: as many values as its level's rule keeps, such as
// one per register. Missing values are 0, so an empty state is all off.
export type State = readonly Value[];

// The widest bus a pin can carry.
export const MAX_WIDTH = 8;

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
  // A memory part's state, which its level's rule reads and changes. Empty
  // for every other node, and for every node when a board loads or a test
  // run starts.
  state: State;
}

export function mask(value: Value, width: number): Value {
  return value & ((1 << width) - 1);
}

// The left edge of the cell holding a bus terminal's switch or lamp for a
// bit, within the node. The high bit comes first, as numbers are written.
export function bitCell(width: number, bit: number): number {
  return 1 + (width - 1 - bit);
}

// Which bit of the bus a split's output pin, or a join's input pin, carries.
// The high bit is at the top, as it's first in a written number.
export function bitOf(width: number, index: number): number {
  return width - 1 - index;
}
