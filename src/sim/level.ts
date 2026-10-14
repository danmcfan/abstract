import { newGame, nodeKind, placeNode, setInputs, simulate, terminalNamed, wire, type Game, type Pin } from "./circuit";
import { DEFAULT_GRID, type Size } from "./grid";
import { partsFrom, type Combinational, type Memory, type Parts, type Pins, type Spec } from "./kind";
import { mask, type Label, type Node, type NodeID, type NodeType, type Value } from "./node";

// A level asks the player to build one gate out of the gates they have
// already built. Solving it adds that gate to the parts bin for later levels.
// A prebuilt level comes already wired: the player only tests it, to see
// what the gate does. The level names its terminals, and its target gives
// one value per output, in order; the part it adds to the bin computes the
// same (ADR 6), with bus pins as wide as the level's bus terminals. A
// memory level gives a rule for its part's state instead of a target, and
// is tested by a timing table.
export type Level = TruthTableLevel | (LevelInfo & Pins & MemoryLevel);

// A level of combinational parts, tested by a truth table.
export type TruthTableLevel = LevelInfo & Pins & TruthLevel;

interface TruthLevel extends Combinational {
  steps?: never;
}

interface MemoryLevel {
  memory: Memory;
  target?: never;
  // The timing table, played in order from a board whose memory parts are
  // all at 0.
  steps: Row[];
}

interface LevelInfo {
  gate: NodeType;
  goal: string;
  // The number of the layer the level belongs to.
  layer: number;
  prebuilt?: boolean;
  // The rows the level panel shows, as input values, when the whole truth
  // table is too long to read. The test run checks the rest out of sight.
  cases?: Value[][];
  // A board larger than the usual one, for wide parts. The view scales to
  // fit it.
  grid?: Size;
  // The part solving the level adds to the bin, when it isn't the gate the
  // level builds: a narrow bus level can hand over the full-width part.
  gives?: Part;
  // The board the level means the player to build. Every level but a
  // prebuilt one has one, so a test can solve it and the playthrough can
  // play it.
  solution?: Solution;
}

type Part = Spec & { gate: NodeType };

// An intended solution, as a player builds it: nodes dropped on board
// cells, then wires. A wire runs from an output pin to an input pin. Each
// end names a terminal by its label, or a node the solution places by its
// name, with ":n" for its nth pin on that side; a bare name is pin 0. A
// split or join gives its bus width.
interface Solution {
  nodes: { name: string; type: NodeType; x: number; y: number; width?: number }[];
  wires: [from: string, to: string][];
}

// The stack the player climbs, bottom to top. Each layer is built from the
// ones below it and happens on its own floor of the factory. Every layer is
// listed, with its part names, before any of its levels exist.
export interface Layer {
  number: number;
  name: string;
  floor: string;
  parts: string;
}

export const LAYERS: Layer[] = [
  { number: 1, name: "NAND", floor: "the gate foundry", parts: "The one schematic Bitbox remembers" },
  { number: 2, name: "Basic gates", floor: "the logic line", parts: "NOT, AND, OR, XOR, MUX, DEMUX" },
  { number: 3, name: "Arithmetic", floor: "adder assembly", parts: "Half adder, full adder, 2-bit adder" },
  { number: 4, name: "ALU", floor: "the calculation shop", parts: "Add, subtract, and, or, xor, not; a zero test" },
  { number: 5, name: "Memory", floor: "the filing vault", parts: "Latch, flip-flop, register, register file, RAM" },
  {
    number: 6,
    name: "Control",
    floor: "the clock tower",
    parts: "Constants, program counter, decoder, sequencer, clock speed",
  },
  { number: 7, name: "Assembly", floor: "the typing pool", parts: "Name and number your own instruction set" },
  { number: 8, name: "CPU", floor: "the control room", parts: "Fetch, decode, execute, in your instruction set" },
  { number: 9, name: "The door program", floor: "the exit hall", parts: "Write it, run it, walk out" },
];

export const LEVELS: Level[] = [
  {
    gate: "NAND",
    goal: "Output is on unless A and B are both on.",
    inputs: ["A", "B"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0]) => [1 - (a & b)],
    layer: 1,
    prebuilt: true,
  },
  {
    gate: "NOT",
    goal: "Output is on when A is off.",
    layer: 2,
    inputs: ["A"],
    outputs: ["OUT"],
    target: ([a = 0]) => [1 - a],
    // A NAND with both inputs tied together.
    solution: {
      nodes: [{ name: "nand", type: "NAND", x: 22, y: 20 }],
      wires: [
        ["A", "nand:0"],
        ["A", "nand:1"],
        ["nand", "OUT"],
      ],
    },
  },
  {
    gate: "AND",
    goal: "Output is on when A and B are both on.",
    layer: 2,
    inputs: ["A", "B"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0]) => [a & b],
    // A NAND, then a NOT.
    solution: {
      nodes: [
        { name: "nand", type: "NAND", x: 16, y: 21 },
        { name: "not", type: "NOT", x: 28, y: 21 },
      ],
      wires: [
        ["A", "nand:0"],
        ["B", "nand:1"],
        ["nand", "not"],
        ["not", "OUT"],
      ],
    },
  },
  {
    gate: "OR",
    goal: "Output is on when A or B is on.",
    layer: 2,
    inputs: ["A", "B"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0]) => [a | b],
    // NOT A NAND NOT B.
    solution: {
      nodes: [
        { name: "notA", type: "NOT", x: 15, y: 13 },
        { name: "notB", type: "NOT", x: 15, y: 30 },
        { name: "nand", type: "NAND", x: 28, y: 21 },
      ],
      wires: [
        ["A", "notA"],
        ["B", "notB"],
        ["notA", "nand:0"],
        ["notB", "nand:1"],
        ["nand", "OUT"],
      ],
    },
  },
  {
    gate: "XOR",
    goal: "Output is on when exactly one of A and B is on.",
    layer: 2,
    inputs: ["A", "B"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0]) => [a ^ b],
    // Four NANDs: NAND A and B, NAND that with each input, then NAND the two
    // results.
    solution: {
      nodes: [
        { name: "first", type: "NAND", x: 12, y: 21 },
        { name: "left", type: "NAND", x: 22, y: 13 },
        { name: "right", type: "NAND", x: 22, y: 29 },
        { name: "last", type: "NAND", x: 32, y: 21 },
      ],
      wires: [
        ["A", "first:0"],
        ["B", "first:1"],
        ["A", "left:0"],
        ["first", "left:1"],
        ["first", "right:0"],
        ["B", "right:1"],
        ["left", "last:0"],
        ["right", "last:1"],
        ["last", "OUT"],
      ],
    },
  },
  {
    gate: "MUX",
    goal: "Output is A when SEL is off, and B when SEL is on.",
    layer: 2,
    inputs: ["A", "B", "SEL"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0, sel = 0]) => [sel ? b : a],
    // (A AND NOT SEL) OR (B AND SEL).
    solution: {
      nodes: [
        { name: "not", type: "NOT", x: 12, y: 28 },
        { name: "andA", type: "AND", x: 20, y: 10 },
        { name: "andB", type: "AND", x: 20, y: 24 },
        { name: "or", type: "OR", x: 30, y: 17 },
      ],
      wires: [
        ["SEL", "not"],
        ["A", "andA:0"],
        ["not", "andA:1"],
        ["B", "andB:0"],
        ["SEL", "andB:1"],
        ["andA", "or:0"],
        ["andB", "or:1"],
        ["or", "OUT"],
      ],
    },
  },
  {
    gate: "DEMUX",
    goal: "D goes to Y0 when SEL is off, and to Y1 when SEL is on.",
    layer: 2,
    inputs: ["D", "SEL"],
    outputs: ["Y0", "Y1"],
    target: ([d = 0, sel = 0]) => [d & (1 - sel), d & sel],
    // Y0 is D AND NOT SEL, and Y1 is D AND SEL.
    solution: {
      nodes: [
        { name: "not", type: "NOT", x: 14, y: 21 },
        { name: "and0", type: "AND", x: 26, y: 12 },
        { name: "and1", type: "AND", x: 26, y: 28 },
      ],
      wires: [
        ["SEL", "not"],
        ["D", "and0:0"],
        ["not", "and0:1"],
        ["D", "and1:0"],
        ["SEL", "and1:1"],
        ["and0", "Y0"],
        ["and1", "Y1"],
      ],
    },
  },
  {
    gate: "HALF ADDER",
    goal: "SUM is on when exactly one of A and B is on. COUT is on when both are.",
    layer: 3,
    inputs: ["A", "B"],
    outputs: ["SUM", "COUT"],
    target: ([a = 0, b = 0]) => [a ^ b, a & b],
    // SUM is A XOR B, and COUT is A AND B.
    solution: {
      nodes: [
        { name: "xor", type: "XOR", x: 22, y: 12 },
        { name: "and", type: "AND", x: 22, y: 28 },
      ],
      wires: [
        ["A", "xor:0"],
        ["B", "xor:1"],
        ["A", "and:0"],
        ["B", "and:1"],
        ["xor", "SUM"],
        ["and", "COUT"],
      ],
    },
  },
  {
    gate: "FULL ADDER",
    goal: "Add A, B and CIN. SUM is the ones place of the total, and COUT the twos place.",
    layer: 3,
    inputs: ["A", "B", "CIN"],
    outputs: ["SUM", "COUT"],
    target: ([a = 0, b = 0, cin = 0]) => [a ^ b ^ cin, (a & b) | (cin & (a ^ b))],
    // Two half adders, with their carries ORed.
    solution: {
      nodes: [
        { name: "first", type: "HALF ADDER", x: 14, y: 14 },
        { name: "second", type: "HALF ADDER", x: 26, y: 20 },
        { name: "or", type: "OR", x: 34, y: 30 },
      ],
      wires: [
        ["A", "first:0"],
        ["B", "first:1"],
        ["first", "second:0"],
        ["CIN", "second:1"],
        ["second", "SUM"],
        ["first:1", "or:0"],
        ["second:1", "or:1"],
        ["or", "COUT"],
      ],
    },
  },
  {
    gate: "2-BIT ADDER",
    goal: "Add A, B and CIN. SUM is the total, up to 3, and COUT is on when it goes past.",
    layer: 3,
    inputs: ["A", "B", "CIN"],
    outputs: ["SUM", "COUT"],
    widths: { A: 2, B: 2, SUM: 2 },
    target: ([a = 0, b = 0, cin = 0]) => [(a + b + cin) % 4, a + b + cin >= 4 ? 1 : 0],
    cases: [
      [0, 0, 0],
      [1, 1, 0],
      [2, 1, 0],
      [3, 1, 0],
      [3, 3, 1],
    ],
    // Building 8 bits is the same ripple carry four times over, so Bitbox
    // hands over the 8-bit adder once the player has built 2.
    gives: {
      gate: "8-BIT ADDER",
      inputs: ["A", "B", "CIN"],
      outputs: ["SUM", "COUT"],
      widths: { A: 8, B: 8, SUM: 8 },
      target: ([a = 0, b = 0, cin = 0]) => [(a + b + cin) % 256, a + b + cin >= 256 ? 1 : 0],
    },
    // A ripple carry: split A and B, stack two full adders with the ones place
    // at the bottom by CIN, chain the low COUT into the high CIN, and join the
    // SUMs.
    solution: {
      nodes: [
        { name: "splitA", type: "SPLIT", x: 12, y: 9, width: 2 },
        { name: "splitB", type: "SPLIT", x: 12, y: 31, width: 2 },
        { name: "join", type: "JOIN", x: 34, y: 16, width: 2 },
        { name: "ones", type: "FULL ADDER", x: 22, y: 28 },
        { name: "twos", type: "FULL ADDER", x: 22, y: 14 },
      ],
      wires: [
        ["A", "splitA"],
        ["B", "splitB"],
        ["splitA:1", "ones:0"],
        ["splitB:1", "ones:1"],
        ["CIN", "ones:2"],
        ["ones", "join:1"],
        ["splitA:0", "twos:0"],
        ["splitB:0", "twos:1"],
        ["ones:1", "twos:2"],
        ["twos", "join:0"],
        ["join", "SUM"],
        ["twos:1", "COUT"],
      ],
    },
  },
  {
    gate: "2-BIT MUX",
    goal: "OUT is both signals of A when SEL is off, and both of B when SEL is on.",
    layer: 4,
    inputs: ["A", "B", "SEL"],
    outputs: ["OUT"],
    widths: { A: 2, B: 2, OUT: 2 },
    target: ([a = 0, b = 0, sel = 0]) => [sel ? b : a],
    cases: [
      [1, 2, 0],
      [1, 2, 1],
      [3, 0, 0],
      [3, 0, 1],
    ],
    // Like the adder: once the player has built 2 signals, 8 is the same
    // MUX six more times, so Bitbox hands over MUX8.
    gives: {
      gate: "MUX8",
      inputs: ["A", "B", "SEL"],
      outputs: ["OUT"],
      widths: { A: 8, B: 8, OUT: 8 },
      target: ([a = 0, b = 0, sel = 0]) => [sel ? b : a],
    },
    // A MUX per signal, with SEL on both, joined in order.
    solution: {
      nodes: [
        { name: "splitA", type: "SPLIT", x: 12, y: 9, width: 2 },
        { name: "splitB", type: "SPLIT", x: 12, y: 31, width: 2 },
        { name: "join", type: "JOIN", x: 34, y: 20, width: 2 },
        { name: "mux0", type: "MUX", x: 23, y: 14 },
        { name: "mux1", type: "MUX", x: 23, y: 28 },
      ],
      wires: [
        ["A", "splitA"],
        ["B", "splitB"],
        ["splitA:0", "mux0:0"],
        ["splitB:0", "mux0:1"],
        ["SEL", "mux0:2"],
        ["mux0", "join:0"],
        ["splitA:1", "mux1:0"],
        ["splitB:1", "mux1:1"],
        ["SEL", "mux1:2"],
        ["mux1", "join:1"],
        ["join", "OUT"],
      ],
    },
  },
  {
    gate: "ZERO TEST",
    goal: "ZERO is on only when every signal of A is off.",
    layer: 4,
    inputs: ["A"],
    outputs: ["ZERO"],
    widths: { A: 8 },
    target: ([a = 0]) => [a === 0 ? 1 : 0],
    grid: { width: 60, height: 45 },
    cases: [[0], [1], [16], [128], [255]],
    // OR A's signals together in pairs, down to one wire that's on when A
    // isn't zero, and NOT it.
    solution: {
      nodes: [
        { name: "split", type: "SPLIT", x: 17, y: 22, width: 8 },
        { name: "or0", type: "OR", x: 26, y: 10 },
        { name: "or1", type: "OR", x: 26, y: 18 },
        { name: "or2", type: "OR", x: 26, y: 26 },
        { name: "or3", type: "OR", x: 26, y: 34 },
        { name: "or4", type: "OR", x: 35, y: 14 },
        { name: "or5", type: "OR", x: 35, y: 30 },
        { name: "or6", type: "OR", x: 43, y: 22 },
        { name: "not", type: "NOT", x: 51, y: 22 },
      ],
      wires: [
        ["A", "split"],
        ["split:0", "or0:0"],
        ["split:1", "or0:1"],
        ["split:2", "or1:0"],
        ["split:3", "or1:1"],
        ["split:4", "or2:0"],
        ["split:5", "or2:1"],
        ["split:6", "or3:0"],
        ["split:7", "or3:1"],
        ["or0", "or4:0"],
        ["or1", "or4:1"],
        ["or2", "or5:0"],
        ["or3", "or5:1"],
        ["or4", "or6:0"],
        ["or5", "or6:1"],
        ["or6", "not"],
        ["not", "ZERO"],
      ],
    },
  },
  {
    gate: "ALU SLICE",
    goal: "Do OP to A and B: 0 add, 1 subtract, 2 and, 3 or, 4 xor, 5 not A. OP 6 and 7 give nothing.",
    layer: 4,
    inputs: ["A", "B", "CIN", "OP"],
    outputs: ["OUT", "COUT"],
    widths: { OP: 3 },
    target: ([a = 0, b = 0, cin = 0, op = 0]) => operate(op, a, b, cin, 1),
    grid: { width: 60, height: 60 },
    cases: [
      [1, 1, 0, 0],
      [1, 0, 1, 0],
      [0, 1, 1, 1],
      [1, 1, 1, 1],
      [1, 1, 0, 2],
      [1, 0, 0, 3],
      [1, 1, 0, 4],
      [0, 1, 0, 5],
      [1, 1, 1, 6],
      [1, 1, 1, 7],
    ],
    // Work out every job side by side, and MUX on OP to pick one. The full
    // adder adds A to B XOR OP's ones place, so OP 1 subtracts, and COUT is
    // the carry only while OP's top two signals are off.
    solution: {
      nodes: [
        { name: "op", type: "SPLIT", x: 14, y: 50, width: 3 },
        { name: "flip", type: "XOR", x: 14, y: 26 },
        { name: "adder", type: "FULL ADDER", x: 23, y: 12 },
        { name: "and", type: "AND", x: 23, y: 25 },
        { name: "or", type: "OR", x: 23, y: 31 },
        { name: "xor", type: "XOR", x: 23, y: 37 },
        { name: "notA", type: "NOT", x: 23, y: 43 },
        { name: "pick23", type: "MUX", x: 32, y: 28 },
        { name: "pick45", type: "MUX", x: 32, y: 40 },
        { name: "notMid", type: "NOT", x: 32, y: 48 },
        { name: "any", type: "OR", x: 32, y: 54 },
        { name: "low", type: "MUX", x: 41, y: 16 },
        { name: "high", type: "AND", x: 41, y: 42 },
        { name: "none", type: "NOT", x: 41, y: 54 },
        { name: "result", type: "MUX", x: 50, y: 18 },
        { name: "carry", type: "AND", x: 50, y: 38 },
      ],
      wires: [
        ["OP", "op"],
        ["B", "flip:0"],
        ["op:2", "flip:1"],
        ["A", "adder:0"],
        ["flip", "adder:1"],
        ["CIN", "adder:2"],
        ["A", "and:0"],
        ["B", "and:1"],
        ["A", "or:0"],
        ["B", "or:1"],
        ["A", "xor:0"],
        ["B", "xor:1"],
        ["A", "notA"],
        ["and", "pick23:0"],
        ["or", "pick23:1"],
        ["op:2", "pick23:2"],
        ["xor", "pick45:0"],
        ["notA", "pick45:1"],
        ["op:2", "pick45:2"],
        ["op:1", "notMid"],
        ["op:1", "any:0"],
        ["op:0", "any:1"],
        ["adder", "low:0"],
        ["pick23", "low:1"],
        ["op:1", "low:2"],
        ["pick45", "high:0"],
        ["notMid", "high:1"],
        ["any", "none"],
        ["low", "result:0"],
        ["high", "result:1"],
        ["op:0", "result:2"],
        ["adder:1", "carry:0"],
        ["none", "carry:1"],
        ["result", "OUT"],
        ["carry", "COUT"],
      ],
    },
  },
  {
    gate: "2-BIT ALU",
    goal: "OUT is OP's operation on A and B, as on the slice. ZERO is on when A is 0, whatever OP is.",
    layer: 4,
    inputs: ["A", "B", "OP"],
    outputs: ["OUT", "ZERO"],
    widths: { A: 2, B: 2, OP: 3, OUT: 2 },
    target: aluTarget(2),
    cases: [
      [1, 2, 0],
      [3, 1, 0],
      [3, 1, 1],
      [1, 2, 1],
      [3, 2, 2],
      [1, 2, 3],
      [3, 1, 4],
      [1, 0, 5],
      [0, 2, 0],
      [3, 3, 6],
      [3, 3, 7],
    ],
    // The 8-bit ALU is the same chain of slices four times as long.
    gives: {
      gate: "ALU",
      inputs: ["A", "B", "OP"],
      outputs: ["OUT", "ZERO"],
      widths: { A: 8, B: 8, OP: 3, OUT: 8 },
      target: aluTarget(8),
    },
    // Two slices in a chain, the ones place at the bottom, the low COUT into
    // the high CIN. The bottom CIN is OP's ones place: on for subtract, off
    // for add. ZERO ORs A's two signals and NOTs them, up by A.
    solution: {
      nodes: [
        { name: "splitA", type: "SPLIT", x: 12, y: 8, width: 2 },
        { name: "splitB", type: "SPLIT", x: 12, y: 20, width: 2 },
        { name: "op", type: "SPLIT", x: 12, y: 34, width: 3 },
        { name: "join", type: "JOIN", x: 34, y: 19, width: 2 },
        { name: "any", type: "OR", x: 23, y: 3 },
        { name: "none", type: "NOT", x: 32, y: 3 },
        { name: "ones", type: "ALU SLICE", x: 23, y: 26 },
        { name: "twos", type: "ALU SLICE", x: 23, y: 12 },
      ],
      wires: [
        ["A", "splitA"],
        ["B", "splitB"],
        ["OP", "op"],
        ["splitA:1", "ones:0"],
        ["splitB:1", "ones:1"],
        ["op:2", "ones:2"],
        ["OP", "ones:3"],
        ["ones", "join:1"],
        ["splitA:0", "twos:0"],
        ["splitB:0", "twos:1"],
        ["ones:1", "twos:2"],
        ["OP", "twos:3"],
        ["twos", "join:0"],
        ["splitA:0", "any:0"],
        ["splitA:1", "any:1"],
        ["any", "none"],
        ["join", "OUT"],
        ["none", "ZERO"],
      ],
    },
  },
];

// An ALU on buses width signals wide. Subtract is add with B flipped and a
// carry in, which wraps 1 - 2 round to 3 at 2 bits, or 3 - 5 to 254 at 8.
function aluTarget(width: number): Combinational["target"] {
  return ([a = 0, b = 0, op = 0]) => [operate(op, a, b, op === 1 ? 1 : 0, width)[0] ?? 0, a === 0 ? 1 : 0];
}

// The ALU's operations on buses width signals wide, by OP: the result and the carry
// out. Only add and subtract carry; OP 6 and 7 are unused and give nothing.
function operate(op: Value, a: Value, b: Value, cin: Value, width: number): Value[] {
  const all = 2 ** width - 1;
  const sum = (x: Value): Value[] => [x & all, x > all ? 1 : 0];
  const results: Value[][] = [
    sum(a + b + cin),
    sum(a + (~b & all) + cin),
    [a & b, 0],
    [a | b, 0],
    [a ^ b, 0],
    [~a & all, 0],
  ];
  return results[op] ?? [0, 0];
}

// The part a solved level adds to the bin: the gate it builds, unless it
// gives another.
export function partGiven(level: Level): Part {
  return level.gives ?? level;
}

// The parts the game's boards can hold: each level's gate, computing what
// its level asks for, and each part a level gives instead. A level's own
// gate stays a kind, so its board can still be loaded and tested.
export const PARTS: Parts = partsFrom([...LEVELS, ...LEVELS.flatMap((level) => level.gives ?? [])]);

// Every solved level adds its part; the first level hands you NAND.
export function partsBin(levelIndex: number, levels = LEVELS): NodeType[] {
  return levels.slice(0, levelIndex).map((level) => partGiven(level).gate);
}

// The levels that can be played: every solved level plus the next one.
export function playableCount(solved: number, levels = LEVELS): number {
  return Math.min(solved + 1, levels.length);
}

// The indexes of a layer's levels, in order.
export function layerLevels(layer: number, levels = LEVELS): number[] {
  return levels.flatMap((level, i) => (level.layer === layer ? [i] : []));
}

export type LayerState = "built" | "in progress" | "locked";

// A layer is built once every level in it is solved, in progress once its
// first level can be played, and locked otherwise, including while it has
// no levels in the game.
export function layerState(layer: number, solved: number, levels = LEVELS): LayerState {
  const indexes = layerLevels(layer, levels);
  if (indexes.length === 0) return "locked";
  if (indexes.every((i) => i < solved)) return "built";
  const [first = Infinity] = indexes;
  return first < playableCount(solved, levels) ? "in progress" : "locked";
}

export function layerOf(levelIndex: number, levels = LEVELS): Layer {
  const number = levelAt(levelIndex, levels).layer;
  const layer = LAYERS.find((l) => l.number === number);
  if (layer === undefined) throw new Error(`No layer ${number}`);
  return layer;
}

export function levelAt(levelIndex: number, levels = LEVELS): Level {
  const level = levels[levelIndex];
  if (level === undefined) throw new Error(`No level ${levelIndex}`);
  return level;
}

// The layer a level leads up to: the next layer, if the level is the last
// of its own and the next layer has a level in the game yet.
export function floorAbove(levelIndex: number, levels = LEVELS): Layer | null {
  const here = levelAt(levelIndex, levels).layer;
  const next = levels[levelIndex + 1];
  return next !== undefined && next.layer !== here ? layerOf(levelIndex + 1, levels) : null;
}

// How many signals a level's terminal carries.
export function terminalWidth(level: Level, label: Label): number {
  return level.widths?.[label] ?? 1;
}

// The parts bin's Wiring section: a split and a join for each bus width the
// level's terminals use, widest first. Levels without buses have none. They
// aren't parts, so the level supplies them (ADR 5).
export function wiring(level: Level): { type: NodeType; width: number }[] {
  const widths = [...new Set([...level.inputs, ...level.outputs].map((label) => terminalWidth(level, label)))];
  const buses = widths.filter((width) => width > 1);
  buses.sort((a, b) => b - a);
  return buses.flatMap((width) => [
    { type: "SPLIT" as const, width },
    { type: "JOIN" as const, width },
  ]);
}

// A fresh board with the level's input terminals down the left edge, its
// output terminals down the right, and the gate wired between them if it's
// prebuilt. The board can hold the given parts.
export function loadLevel(level: Level, parts = PARTS): Game {
  const grid = level.grid ?? DEFAULT_GRID;
  const game = newGame(parts, grid);
  const column = (x: number, i: number, count: number): { x: number; y: number } => ({
    x,
    y: (grid.height * (i + 1)) / (count + 1),
  });
  const place = (type: NodeType, labels: Label[], x: number): Node[] =>
    labels.map((label, i) =>
      placed(placeNode(game, type, column(x, i, labels.length), label, terminalWidth(level, label))),
    );
  const inputs = place("INPUT", level.inputs, 4);
  const outputs = place("OUTPUT", level.outputs, grid.width - 4);
  if (level.prebuilt === true) {
    const gate = placed(placeNode(game, level.gate, { x: grid.width / 2, y: grid.height / 2 }));
    for (const [i, input] of inputs.entries()) {
      wire(game, { node: input.id, side: "out", index: 0 }, { node: gate.id, side: "in", index: i });
    }
    for (const [i, output] of outputs.entries()) {
      wire(game, { node: gate.id, side: "out", index: i }, { node: output.id, side: "in", index: 0 });
    }
  }
  return game;
}

// The pins a level's solution wires together, once its nodes are on the
// board as the given nodes, in the solution's order.
export function solutionWires(game: Game, level: Level, ids: NodeID[]): { from: Pin; to: Pin }[] {
  const nodes = level.solution?.nodes ?? [];
  const pin = (end: string, side: Pin["side"]): Pin => {
    const [name = "", index = "0"] = end.split(":");
    const own = nodes.findIndex((n) => n.name === name);
    const node = own >= 0 ? ids[own] : terminalNamed(game, side === "out" ? "input" : "output", name)?.id;
    if (node === undefined) throw new Error(`${level.gate}'s solution has no ${end}`);
    return { node, side, index: Number(index) };
  };
  return (level.solution?.wires ?? []).map(([from, to]) => ({ from: pin(from, "out"), to: pin(to, "in") }));
}

// Builds a level's solution onto its board.
export function buildSolution(game: Game, level: Level): void {
  const ids = (level.solution?.nodes ?? []).map(
    (node) => placed(placeNode(game, node.type, node, "", node.width ?? 1)).id,
  );
  for (const { from, to } of solutionWires(game, level, ids)) {
    if (wire(game, from, to) === null)
      throw new Error(`${level.gate}'s solution can't wire ${from.node} to ${to.node}`);
  }
}

// A fresh board always has room for a level's own parts.
function placed(node: Node | null): Node {
  if (node === null) throw new Error("No room on the board for a level's part");
  return node;
}

// A row of a truth table, or a step of a timing table.
export interface Row {
  // One value per input, in the level's order.
  inputs: Value[];
  // One value per output, in the level's order.
  expected: Value[];
  // Whether a step ticks the clock once its inputs are set. The outputs
  // are read after the tick.
  tick?: boolean;
}

// The input terminal a level with a clock has.
export const CLOCK: Label = "CLK";

export function hasClock(level: Level): boolean {
  return level.inputs.includes(CLOCK);
}

// The level's clock switch on the board, if the level has one.
export function clockOf(game: Game, level: Level): NodeID | undefined {
  if (!hasClock(level)) return undefined;
  return [...game.nodes.values()].find((node) => node.type === "INPUT" && node.label === CLOCK)?.id;
}

export interface CheckedRow extends Row {
  // What the board's output terminals gave.
  actual: Value[];
}

function expectedFor(level: TruthTableLevel, inputs: Value[]): Value[] {
  return level.target(inputs).map((value, i) => {
    const label = level.outputs[i];
    return mask(value, label === undefined ? 1 : terminalWidth(level, label));
  });
}

// How many rows the whole truth table has: one for every combination of
// every input signal.
export function rowCount(level: Level): number {
  return 2 ** level.inputs.reduce((bits, label) => bits + terminalWidth(level, label), 0);
}

// The nth row of the whole truth table, counting up in binary with A as the
// high bits.
function rowAt(level: TruthTableLevel, n: number): Row {
  const inputs: Value[] = [];
  let rest = n;
  for (let i = level.inputs.length - 1; i >= 0; i--) {
    const label = level.inputs[i];
    if (label === undefined) continue;
    const width = terminalWidth(level, label);
    inputs.unshift(rest % 2 ** width);
    rest = Math.floor(rest / 2 ** width);
  }
  return { inputs, expected: expectedFor(level, inputs) };
}

// Where a row of input values comes in the whole truth table: rowAt's
// inverse.
function rowNumber(level: Level, inputs: Value[]): number {
  return level.inputs.reduce((n, label, i) => n * 2 ** terminalWidth(level, label) + (inputs[i] ?? 0), 0);
}

// The rows the level panel shows: the timing table on a memory level, or
// else the truth table.
export function testTable(level: Level): Row[] {
  return level.steps ?? truthTable(level);
}

// The rows of the truth table the level panel shows: the level's cases if it
// has them, or else every combination of inputs. A memory level has none.
export function truthTable(level: Level): Row[] {
  if (level.steps !== undefined) return [];
  if (level.cases !== undefined) return level.cases.map((inputs) => ({ inputs, expected: expectedFor(level, inputs) }));
  return Array.from({ length: rowCount(level) }, (_, n) => rowAt(level, n));
}

// Sets the input terminals to the given values, in the level's label order,
// settling the circuit.
export function applyInputs(game: Game, level: Level, values: Value[]): void {
  const settings = new Map<NodeID, Value>();
  for (const node of game.nodes.values()) {
    const i = level.inputs.indexOf(node.label);
    const value = values[i];
    if (nodeKind(game, node).terminal === "input" && value !== undefined) settings.set(node.id, value);
  }
  setInputs(game, settings);
}

// A row passes only if every output matches.
export function matches(actual: Value[], expected: Value[]): boolean {
  return actual.length === expected.length && actual.every((value, i) => value === expected[i]);
}

// Checking the rows out of sight one by one is fast up to about this many
// rows. Past it (an ALU-sized level), a test run checks the same seeded
// sample of rows every time instead, so it stays quick.
const FULL_CHECK_LIMIT = 1 << 18;
const SAMPLE_SIZE = 1 << 16;
const SAMPLE_SEED = 0x5eed;
// Failing rows found out of sight that the table adds, so it stays short.
const MAX_HIDDEN_FAILURES = 3;

export interface CheckResult {
  // The rows the level panel shows, checked.
  rows: CheckedRow[];
  // How many rows were checked out of sight, and the first few that failed.
  hidden: { checked: number; failed: CheckedRow[] };
  // Gate types on the board that this level's parts bin doesn't offer.
  forbidden: NodeType[];
  // Whether the board failed to settle on some row, whatever its outputs.
  unstable: boolean;
  passed: boolean;
}

// Runs the truth table or timing table on a copy of the board's signals,
// leaving the board and its input switches alone: the shown rows, then, if the level only shows a
// few cases, every other row out of sight. The run starts where restart
// would leave the board, so every memory part starts at 0.
export function checkLevel(board: Game, levelIndex: number, levels = LEVELS): CheckResult {
  const level = levelAt(levelIndex, levels);
  const allowed = new Set<NodeType>([...partsBin(levelIndex, levels), ...wiring(level).map((w) => w.type)]);
  if (level.prebuilt === true) allowed.add(level.gate);
  const gates = [...board.nodes.values()].filter((node) => nodeKind(board, node).terminal === undefined);
  const forbidden = [...new Set(gates.map((node) => node.type))].filter((type) => !allowed.has(type));

  const terminal =
    (side: "input" | "output") =>
    (label: Label): NodeID =>
      [...board.nodes.values()].find((node) => nodeKind(board, node).terminal === side && node.label === label)?.id ??
      -1;
  const simulated = simulate(board, level.inputs.map(terminal("input")), level.outputs.map(terminal("output")));
  const settled = { always: true };
  const run = (values: Value[]): Value[] => {
    const { outputs, stable } = simulated(values);
    if (!stable) settled.always = false;
    return outputs;
  };
  let rows: CheckedRow[];
  let hidden: CheckResult["hidden"] = { checked: 0, failed: [] };
  if (level.steps === undefined) {
    rows = truthTable(level).map((row): CheckedRow => Object.assign(row, { actual: run(row.inputs) }));
    // An unstable board has already failed, and settling it again on every
    // row out of sight would take a long time.
    if (level.cases !== undefined) hidden = checkHidden(level, level.cases, run, () => !settled.always);
  } else {
    rows = level.steps.map((step): CheckedRow => Object.assign({ actual: playStep(level, step, run) }, step));
  }
  const unstable = !settled.always;

  const passed =
    forbidden.length === 0 &&
    !unstable &&
    hidden.failed.length === 0 &&
    rows.every((row) => matches(row.actual, row.expected));
  return { rows, hidden, forbidden, unstable, passed };
}

// Sets a step's inputs and, if it ticks, turns the clock on and off, giving
// the outputs at the end.
function playStep(level: Level, step: Row, run: (values: Value[]) => Value[]): Value[] {
  const actual = run(step.inputs);
  const clock = level.inputs.indexOf(CLOCK);
  if (step.tick !== true || clock < 0) return actual;
  run(Object.assign([...step.inputs], { [clock]: 1 }));
  return run(Object.assign([...step.inputs], { [clock]: 0 }));
}

function checkHidden(
  level: TruthTableLevel,
  cases: Value[][],
  run: (values: Value[]) => Value[],
  unstable: () => boolean,
): CheckResult["hidden"] {
  const shown = new Set(cases.map((inputs) => rowNumber(level, inputs)));
  const count = rowCount(level);
  const failed: CheckedRow[] = [];
  let checked = 0;
  const check = (n: number): void => {
    if (shown.has(n)) return;
    const row = rowAt(level, n);
    checked++;
    const actual = run(row.inputs);
    if (!matches(actual, row.expected)) failed.push({ ...row, actual });
  };
  const going = (): boolean => failed.length < MAX_HIDDEN_FAILURES && !unstable();
  if (count <= FULL_CHECK_LIMIT) {
    for (let n = 0; n < count && going(); n++) check(n);
  } else {
    const random = seeded(SAMPLE_SEED);
    for (let i = 0; i < SAMPLE_SIZE && going(); i++) check(Math.floor(random() * count));
  }
  return { checked, failed };
}

// A small seeded random number generator (mulberry32), so a sampled check
// picks the same rows on every run.
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
