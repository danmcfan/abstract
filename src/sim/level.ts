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
  // Bumped when the level changes enough that a player who solved it must
  // solve it again, such as a new truth table or terminals. Missing means 1.
  revision?: number;
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
  // Bus widths the level's Wiring has besides its terminals' ones, for a
  // part in the bin with a bus pin the terminals don't match.
  buses?: number[];
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
  { number: 4, name: "ALU", floor: "the calculation shop", parts: "Add, subtract, and, or, xor, not" },
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
    gate: "MUX4",
    goal: "OUT is the input SEL numbers: A at 0, B at 1, C at 2 and D at 3.",
    layer: 4,
    inputs: ["A", "B", "C", "D", "SEL"],
    outputs: ["OUT"],
    widths: { SEL: 2 },
    target: ([a = 0, b = 0, c = 0, d = 0, sel = 0]) => [[a, b, c, d][sel] ?? 0],
    cases: [
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 1],
      [0, 0, 1, 0, 2],
      [0, 0, 0, 1, 3],
      [1, 1, 1, 0, 3],
    ],
    // SEL's ones place picks within each pair, and its top signal picks
    // the pair.
    solution: {
      nodes: [
        { name: "sel", type: "SPLIT", x: 12, y: 36, width: 2 },
        { name: "ab", type: "MUX", x: 22, y: 8 },
        { name: "cd", type: "MUX", x: 22, y: 24 },
        { name: "pick", type: "MUX", x: 33, y: 16 },
      ],
      wires: [
        ["SEL", "sel"],
        ["A", "ab:0"],
        ["B", "ab:1"],
        ["sel:1", "ab:2"],
        ["C", "cd:0"],
        ["D", "cd:1"],
        ["sel:1", "cd:2"],
        ["ab", "pick:0"],
        ["cd", "pick:1"],
        ["sel:0", "pick:2"],
        ["pick", "OUT"],
      ],
    },
  },
  {
    gate: "ADD/SUB",
    goal: "Add A, B and CIN. When SUB is on, add A, NOT B and CIN instead.",
    layer: 4,
    inputs: ["A", "B", "CIN", "SUB"],
    outputs: ["OUT", "COUT"],
    target: ([a = 0, b = 0, cin = 0, sub = 0]) => operate(sub, a, b, cin, 1),
    // Flip B with an XOR on SUB, then a full adder.
    solution: {
      nodes: [
        { name: "flip", type: "XOR", x: 16, y: 20 },
        { name: "adder", type: "FULL ADDER", x: 27, y: 14 },
      ],
      wires: [
        ["B", "flip:0"],
        ["SUB", "flip:1"],
        ["A", "adder:0"],
        ["flip", "adder:1"],
        ["CIN", "adder:2"],
        ["adder", "OUT"],
        ["adder:1", "COUT"],
      ],
    },
  },
  {
    gate: "LOGIC UNIT",
    goal: "Do SEL's job to A and B: 0 and, 1 or, 2 xor, 3 not A.",
    layer: 4,
    inputs: ["A", "B", "SEL"],
    outputs: ["OUT"],
    widths: { SEL: 2 },
    target: ([a = 0, b = 0, sel = 0]) => operate(sel + 4, a, b, 0, 1).slice(0, 1),
    // Every job side by side, and a MUX4 on SEL picks one.
    solution: {
      nodes: [
        { name: "and", type: "AND", x: 18, y: 6 },
        { name: "or", type: "OR", x: 18, y: 14 },
        { name: "xor", type: "XOR", x: 18, y: 22 },
        { name: "notA", type: "NOT", x: 18, y: 30 },
        { name: "pick", type: "MUX4", x: 30, y: 16 },
      ],
      wires: [
        ["A", "and:0"],
        ["B", "and:1"],
        ["A", "or:0"],
        ["B", "or:1"],
        ["A", "xor:0"],
        ["B", "xor:1"],
        ["A", "notA"],
        ["and", "pick:0"],
        ["or", "pick:1"],
        ["xor", "pick:2"],
        ["notA", "pick:3"],
        ["SEL", "pick:4"],
        ["pick", "OUT"],
      ],
    },
  },
  {
    gate: "ALU SLICE",
    revision: 2,
    goal: "Do OP to A and B: 0 add, 1 subtract, 4 and, 5 or, 6 xor, 7 not A. OP 2 and 3 give nothing.",
    layer: 4,
    inputs: ["A", "B", "CIN", "OP"],
    outputs: ["OUT", "COUT"],
    widths: { OP: 3 },
    // A join for the logic unit's SEL.
    buses: [2],
    target: ([a = 0, b = 0, cin = 0, op = 0]) => operate(op, a, b, cin, 1),
    cases: [
      [1, 1, 0, 0],
      [1, 0, 1, 0],
      [0, 1, 1, 1],
      [1, 1, 1, 1],
      [1, 1, 1, 2],
      [1, 0, 1, 3],
      [1, 1, 0, 4],
      [1, 0, 0, 5],
      [1, 1, 1, 6],
      [0, 1, 0, 7],
    ],
    // ADD/SUB and the logic unit side by side, with OP's ones place on SUB
    // and its low two signals on SEL. OP's top signal picks between them.
    // Arithmetic is on only while the top two signals are off, so OP 2 and 3
    // give nothing, and COUT is the carry only then.
    solution: {
      nodes: [
        { name: "op", type: "SPLIT", x: 10, y: 34, width: 3 },
        { name: "sel", type: "JOIN", x: 17, y: 26, width: 2 },
        { name: "addsub", type: "ADD/SUB", x: 22, y: 6 },
        { name: "logic", type: "LOGIC UNIT", x: 25, y: 20 },
        { name: "either", type: "OR", x: 17, y: 38 },
        { name: "arith", type: "NOT", x: 25, y: 38 },
        { name: "sum", type: "AND", x: 32, y: 8 },
        { name: "carry", type: "AND", x: 38, y: 32 },
        { name: "result", type: "MUX", x: 38, y: 14 },
      ],
      wires: [
        ["OP", "op"],
        ["A", "addsub:0"],
        ["B", "addsub:1"],
        ["CIN", "addsub:2"],
        ["op:2", "addsub:3"],
        ["op:1", "sel:0"],
        ["op:2", "sel:1"],
        ["A", "logic:0"],
        ["B", "logic:1"],
        ["sel", "logic:2"],
        ["op:0", "either:0"],
        ["op:1", "either:1"],
        ["either", "arith"],
        ["addsub", "sum:0"],
        ["arith", "sum:1"],
        ["sum", "result:0"],
        ["logic", "result:1"],
        ["op:0", "result:2"],
        ["addsub:1", "carry:0"],
        ["arith", "carry:1"],
        ["result", "OUT"],
        ["carry", "COUT"],
      ],
    },
  },
  {
    gate: "2-BIT ALU",
    revision: 2,
    goal: "OUT is OP's operation on A and B, as on the slice.",
    layer: 4,
    inputs: ["A", "B", "OP"],
    outputs: ["OUT"],
    widths: { A: 2, B: 2, OP: 3, OUT: 2 },
    target: aluTarget(2),
    cases: [
      [1, 2, 0],
      [3, 1, 0],
      [3, 1, 1],
      [1, 2, 1],
      [3, 3, 2],
      [3, 3, 3],
      [3, 2, 4],
      [1, 2, 5],
      [3, 1, 6],
      [1, 0, 7],
    ],
    // The 8-bit ALU is the same chain of slices four times as long.
    gives: {
      gate: "ALU",
      inputs: ["A", "B", "OP"],
      outputs: ["OUT"],
      widths: { A: 8, B: 8, OP: 3, OUT: 8 },
      target: aluTarget(8),
    },
    // Two slices in a chain, the ones place at the bottom, the low COUT into
    // the high CIN. The bottom CIN is OP's ones place: on for subtract, off
    // for add.
    solution: {
      nodes: [
        { name: "splitA", type: "SPLIT", x: 12, y: 8, width: 2 },
        { name: "splitB", type: "SPLIT", x: 12, y: 20, width: 2 },
        { name: "op", type: "SPLIT", x: 12, y: 34, width: 3 },
        { name: "join", type: "JOIN", x: 34, y: 19, width: 2 },
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
        ["join", "OUT"],
      ],
    },
  },
];

// An ALU on buses width signals wide. Subtract is add with B flipped and a
// carry in, which wraps 1 - 2 round to 3 at 2 bits, or 3 - 5 to 254 at 8.
function aluTarget(width: number): Combinational["target"] {
  return ([a = 0, b = 0, op = 0]) => operate(op, a, b, op === 1 ? 1 : 0, width).slice(0, 1);
}

// The ALU's operations on buses width signals wide, by OP (ADR 9): the result
// and the carry out. Only add and subtract carry; OP 2 and 3 give nothing.
function operate(op: Value, a: Value, b: Value, cin: Value, width: number): Value[] {
  const all = 2 ** width - 1;
  const sum = (x: Value): Value[] => [x & all, x > all ? 1 : 0];
  const results: Value[][] = [
    sum(a + b + cin),
    sum(a + (~b & all) + cin),
    [0, 0],
    [0, 0],
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
// The revision of each level the player has solved, by the gate it builds.
// Keyed by gate, not position, so it still means the same levels after one
// is added, taken out or moved.
export type Solved = Partial<Record<NodeType, number>>;

export const revisionOf = (level: Level): number => level.revision ?? 1;

// How many levels from the first are solved, at their current revision.
// Progress goes one level at a time, so a level added or changed before
// ones already solved must be solved first; then the count jumps past them.
export function solvedCount(solved: Solved, levels = LEVELS): number {
  const gap = levels.findIndex((level) => solved[level.gate] !== revisionOf(level));
  return gap === -1 ? levels.length : gap;
}

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
  const terminals = [...level.inputs, ...level.outputs].map((label) => terminalWidth(level, label));
  const widths = [...new Set([...terminals, ...(level.buses ?? [])])];
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
