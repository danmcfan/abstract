import {
  loadContents,
  newGame,
  nodeKind,
  placeNode,
  programMemoryOf,
  setInputs,
  simulate,
  terminalNamed,
  wire,
  type Game,
  type Pin,
} from "./circuit";
import {
  assemble,
  control,
  cpu,
  describeInstruction,
  DOOR,
  encode,
  executeUnit,
  finish,
  KEYPAD,
  play,
  type Instruction,
  type Machine,
} from "./cpu";
import { DEFAULT_GRID, type Size } from "./grid";
import { BITBOX_INSTRUCTION_SET, INSTRUCTIONS, rowOf, type InstructionSet } from "./instruction";
import { partsFrom, PROGRAM_MEMORY, type Combinational, type Memory, type Parts, type Pins, type Spec } from "./kind";
import { mask, type Label, type Node, type NodeID, type NodeType, type State, type Value } from "./node";

// A level asks the player to build one gate out of the gates they have
// already built. Solving it adds that gate to the parts bin for later levels.
// A prebuilt level comes already wired: the player only tests it, to see
// what the gate does. The level names its terminals, and its target gives
// one value per output, in order; the part it adds to the bin computes the
// same (ADR 6), with bus pins as wide as the level's bus terminals. A
// memory level gives a rule for its part's state instead of a target, and
// is tested by a timing table. A program level is a memory level with
// program memory on its board, tested by running test programs. An
// instruction set level isn't a circuit: the player fills in a table
// instead.
export const INSTRUCTION_SET_ID = "INSTRUCTION SET";
const DOOR_PROGRAM_ID = "DOOR PROGRAM";

export type Level = CircuitLevel | InstructionSetLevel | DoorProgramLevel;

export type CircuitLevel = TruthTableLevel | (CircuitInfo & Pins & MemoryLevel) | ProgramLevel;

// The CPU's level: it runs test programs from program memory.
export type ProgramLevel = CircuitInfo & Pins & ProgramTests;

// A level of combinational parts, tested by a truth table.
export type TruthTableLevel = CircuitInfo & Pins & TruthLevel;

// The level where the player names and numbers the CPU's instructions. It
// is solved as soon as the table is good, and adds no part to the bin.
interface InstructionSetLevel extends LevelInfo {
  kind: "instruction set";
  // Saves and story flags know the level by this, as they know a circuit
  // level by its gate.
  id: string;
}

// The last level, where the player writes the door program and runs it on
// the CPU's spec. It is solved once the door opens, which ends the game.
interface DoorProgramLevel extends LevelInfo {
  kind: "door program";
  id: string;
}

interface TruthLevel extends Combinational {
  steps?: never;
  programs?: never;
}

interface MemoryLevel {
  memory: Memory;
  target?: never;
  // The timing table, played in order from a board whose memory parts are
  // all at 0.
  steps: Row[];
  programs?: never;
}

interface ProgramTests {
  memory: Memory;
  target?: never;
  steps?: never;
  // Each runs from a board whose memory parts are all at 0, with its
  // program in program memory, until HALT or the tick limit.
  programs: TestProgram[];
  // The cell the level puts program memory in.
  programMemory: { x: number; y: number };
  // An instruction written out in the instruction set the level reads.
  describe: (i: Value, n: Value) => string;
}

// A short program the CPU must run, written in instructions and assembled
// with the player's instruction set: the values its device gives, in turn,
// and the values it must send with out before it halts.
interface TestProgram {
  name: string;
  program: Instruction[];
  device: Value[];
  outs: Value[];
  // The program memory words, in the instruction set the level reads.
  words: Value[];
}

interface LevelInfo {
  // Bumped when the level changes enough that a player who solved it must
  // solve it again, such as a new truth table or terminals. Missing means 1.
  revision?: number;
  goal: string;
  // The number of the layer the level belongs to.
  layer: number;
}

interface CircuitInfo extends LevelInfo {
  kind?: never;
  gate: NodeType;
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
  // The level as it reads an instruction set, for a level whose part
  // depends on it (ADR 7). The level in LEVELS reads Bitbox's.
  reads?: (set: InstructionSet) => CircuitLevel;
}

type Part = Spec & { gate: NodeType };

// An intended solution, as a player builds it: nodes dropped on board
// cells, then wires. A wire runs from an output pin to an input pin. Each
// end names a terminal by its label, a node the solution places by its
// name, or a node the level supplies by its type, with ":n" for its nth pin
// on that side; a bare name is pin 0. A
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
    parts: "Constants, program counter, decoder, zero test, sequencer, clock speed",
  },
  { number: 7, name: "Assembly", floor: "the typing pool", parts: "Name and number your own instruction set" },
  { number: 8, name: "CPU", floor: "the control room", parts: "Fetch, decode, execute, in your instruction set" },
  { number: 9, name: "The door program", floor: "the exit hall", parts: "Write it, run it, walk out" },
];

// Memory that takes in values when its clock turns on, from the input at
// clock. Its state is the clock it last saw, then the values it keeps; take
// gives the values to keep after a tick.
function onTick(take: (inputs: Value[], kept: State) => Value[], clock = 0): Memory["next"] {
  return (inputs, [seen = 0, ...kept]) => {
    const clk = inputs[clock] ?? 0;
    return [clk, ...(clk && !seen ? take(inputs, kept) : kept)];
  };
}

// A register file's read side: A and B show the registers ASEL and BSEL pick.
const registerFile = (n: number): Memory =>
  places(n, ([, ...registers], [, , , , asel = 0, bsel = 0]) => [registers[asel] ?? 0, registers[bsel] ?? 0]);

// A bit or register: CLK, LOAD and D in, Q out. On a tick Q takes D if
// LOAD is on.
const register: Memory = {
  next: onTick(([, load = 0, d = 0], [q = 0]) => [load ? d : q]),
  outputs: ([, q = 0]) => [q],
};

// A register file or RAM: CLK, WRITE, an address and DIN in, then whatever
// picks the places shown. On a tick with WRITE on, the place at the address
// takes DIN; the rest keep their values.
function places(count: number, outputs: Memory["outputs"]): Memory {
  return {
    next: onTick(([, write = 0, address = 0, din = 0], kept) =>
      Array.from({ length: count }, (_, i) => (write && i === address ? din : (kept[i] ?? 0))),
    ),
    outputs,
  };
}

// The control unit's 16 instruction lines, as its intended board splits
// the decoder's LO and HI: the instruction with opcode n is on pin 7 - n of
// one or the other. The board is wired for Bitbox's opcodes.
const line = (n: number): string => `${n < 8 ? "lo" : "hi"}:${7 - (n % 8)}`;
const lineOf = (id: (typeof INSTRUCTIONS)[number]["id"]): string => line(rowOf(BITBOX_INSTRUCTION_SET, id).opcode ?? 0);
// The opcode no instruction has in Bitbox's set.
const SPARE = 15;

// Wires each line into its own pin of a join, from the top.
const into = (join: string, lines: string[]): [string, string][] =>
  lines.map((from, pin): [string, string] => [from, `${join}:${pin}`]);

// The execute unit's timing table, written as instructions: every
// instruction once, with jump if zero both ways. Each step ticks, then
// reads the outputs.
const EXECUTE_STEPS: (Instruction & { din?: Value })[] = [
  { op: "set", r: 1, n: 5 },
  { op: "set", r: 2, n: 3 },
  { op: "add", r: 1, s: 2 },
  { op: "out", r: 1, n: DOOR },
  { op: "subtract", r: 1, s: 2 },
  { op: "copy", r: 0, s: 1 },
  { op: "and", r: 0, s: 2 },
  { op: "or", r: 0, s: 1 },
  { op: "xor", r: 0, s: 2 },
  { op: "not", r: 0 },
  { op: "write", r: 0, n: 6 },
  { op: "read", r: 3, n: 6 },
  { op: "in", r: 2, n: KEYPAD, din: 42 },
  { op: "jump", n: 12 },
  { op: "jump if zero", r: 2, n: 20 },
  { op: "subtract", r: 2, s: 2 },
  { op: "jump if zero", r: 2, n: 20 },
  { op: "halt" },
];

// The CPU's test programs. The last has instructions after its HALT, which
// a CPU that doesn't stop there would run.
export const TEST_PROGRAMS: Omit<TestProgram, "words">[] = [
  {
    name: "count down from 3",
    program: [
      { op: "set", r: 0, n: 3 },
      { op: "set", r: 1, n: 1 },
      { op: "out", r: 0, n: DOOR },
      { op: "subtract", r: 0, s: 1 },
      { op: "jump if zero", r: 0, n: 6 },
      { op: "jump", n: 2 },
      { op: "halt" },
    ],
    device: [],
    outs: [3, 2, 1],
  },
  {
    name: "add up the keypad until 0",
    program: [
      { op: "in", r: 1, n: KEYPAD },
      { op: "jump if zero", r: 1, n: 4 },
      { op: "add", r: 0, s: 1 },
      { op: "jump", n: 0 },
      { op: "out", r: 0, n: DOOR },
      { op: "halt" },
    ],
    device: [4, 9, 2, 0],
    outs: [15],
  },
  {
    name: "keep a number in RAM",
    program: [
      { op: "set", r: 0, n: 12 },
      { op: "write", r: 0, n: 3 },
      { op: "set", r: 0, n: 0 },
      { op: "read", r: 2, n: 3 },
      { op: "not", r: 2 },
      { op: "out", r: 2, n: DOOR },
      { op: "halt" },
      { op: "out", r: 0, n: DOOR },
      { op: "jump", n: 7 },
    ],
    device: [],
    outs: [243],
  },
];

// How many ticks a test program may take before it fails.
export const TICK_LIMIT = 1000;

// What the RAM level writes to its 8 places, all different.
const RAM_VALUES: Value[] = [3, 14, 15, 92, 65, 35, 89, 79];

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
    revision: 3,
    goal: "Do OP to A and B. Arithmetic adds A, B (or NOT B for OP 1 and 3) and CIN; 4 and, 5 or, 6 xor, 7 not A. COUT is the carry for every OP.",
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
      [1, 1, 0, 2],
      [1, 0, 1, 3],
      [1, 1, 0, 4],
      [1, 0, 0, 5],
      [1, 1, 1, 6],
      [0, 1, 0, 7],
    ],
    // ADD/SUB and the logic unit side by side, with OP's ones place on SUB
    // and its low two signals on SEL. OP's top signal picks between them,
    // and COUT is ADD/SUB's carry whatever the job (ADR 12).
    solution: {
      nodes: [
        { name: "op", type: "SPLIT", x: 10, y: 34, width: 3 },
        { name: "sel", type: "JOIN", x: 17, y: 26, width: 2 },
        { name: "addsub", type: "ADD/SUB", x: 22, y: 6 },
        { name: "logic", type: "LOGIC UNIT", x: 25, y: 20 },
        { name: "result", type: "MUX", x: 36, y: 14 },
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
        ["addsub", "result:0"],
        ["logic", "result:1"],
        ["op:0", "result:2"],
        ["result", "OUT"],
        ["addsub:1", "COUT"],
      ],
    },
  },
  {
    gate: "2-BIT ALU",
    revision: 3,
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
  {
    gate: "SR LATCH",
    goal: "S turns Q on, and R turns it off. With both off, Q stays as it was.",
    layer: 5,
    inputs: ["S", "R"],
    outputs: ["Q"],
    memory: {
      next: ([s = 0, r = 0], [q = 0]) => [s ? 1 : q & (1 - r)],
      outputs: ([q = 0]) => [q],
    },
    // A loop's first value depends on which gate settles first, so the table
    // turns R on before it reads Q. It never turns S and R on together.
    steps: [
      { inputs: [0, 1], expected: [0] },
      { inputs: [0, 0], expected: [0] },
      { inputs: [1, 0], expected: [1] },
      { inputs: [0, 0], expected: [1] },
      { inputs: [0, 1], expected: [0] },
      { inputs: [0, 0], expected: [0] },
      { inputs: [1, 0], expected: [1] },
    ],
    // Two NANDs, each fed the other's output: a NAND latch, set and reset by
    // its inputs going off, so a NOT flips each of S and R first.
    solution: {
      nodes: [
        { name: "notS", type: "NOT", x: 13, y: 15 },
        { name: "notR", type: "NOT", x: 13, y: 30 },
        { name: "top", type: "NAND", x: 26, y: 15 },
        { name: "bottom", type: "NAND", x: 26, y: 30 },
      ],
      wires: [
        ["S", "notS"],
        ["R", "notR"],
        ["notS", "top:0"],
        ["bottom", "top:1"],
        ["top", "bottom:0"],
        ["notR", "bottom:1"],
        ["top", "Q"],
      ],
    },
  },
  {
    gate: "D LATCH",
    goal: "While CLK is on, Q follows D. While CLK is off, Q stays as it was.",
    layer: 5,
    inputs: ["D", "CLK"],
    outputs: ["Q"],
    memory: {
      next: ([d = 0, clk = 0], [q = 0]) => [clk ? d : q],
      outputs: ([q = 0]) => [q],
    },
    steps: [
      { inputs: [1, 0], expected: [0] },
      { inputs: [1, 1], expected: [1] },
      { inputs: [0, 1], expected: [0] },
      { inputs: [1, 1], expected: [1] },
      { inputs: [0, 0], expected: [1] },
      { inputs: [0, 0], tick: true, expected: [0] },
      { inputs: [1, 0], expected: [0] },
      { inputs: [1, 0], tick: true, expected: [1] },
    ],
    // An SR latch that only listens while CLK is on: S is D AND CLK, and R
    // is NOT D AND CLK.
    solution: {
      nodes: [
        { name: "not", type: "NOT", x: 13, y: 24 },
        { name: "set", type: "AND", x: 23, y: 13 },
        { name: "reset", type: "AND", x: 23, y: 31 },
        { name: "latch", type: "SR LATCH", x: 34, y: 22 },
      ],
      wires: [
        ["D", "set:0"],
        ["CLK", "set:1"],
        ["D", "not"],
        ["not", "reset:0"],
        ["CLK", "reset:1"],
        ["set", "latch:0"],
        ["reset", "latch:1"],
        ["latch", "Q"],
      ],
    },
  },
  {
    gate: "D FLIP-FLOP",
    goal: "Q takes D when CLK turns on, and stays as it was the rest of the time.",
    layer: 5,
    inputs: ["D", "CLK"],
    outputs: ["Q"],
    memory: {
      next: onTick(([d = 0]) => [d], 1),
      outputs: ([, q = 0]) => [q],
    },
    // Step 5 changes D while CLK stays on, which a lone D latch lets through.
    steps: [
      { inputs: [1, 0], expected: [0] },
      { inputs: [1, 0], tick: true, expected: [1] },
      { inputs: [0, 0], expected: [1] },
      { inputs: [0, 1], expected: [0] },
      { inputs: [1, 1], expected: [0] },
      { inputs: [1, 0], expected: [0] },
      { inputs: [1, 0], tick: true, expected: [1] },
    ],
    // Two D latches in a row. The first is open while CLK is off and the
    // second while it's on, so D never runs straight through to Q.
    solution: {
      nodes: [
        { name: "not", type: "NOT", x: 13, y: 36 },
        { name: "first", type: "D LATCH", x: 22, y: 16 },
        { name: "second", type: "D LATCH", x: 34, y: 22 },
      ],
      wires: [
        ["D", "first:0"],
        ["CLK", "not"],
        ["not", "first:1"],
        ["first", "second:0"],
        ["CLK", "second:1"],
        ["second", "Q"],
      ],
    },
  },
  {
    gate: "BIT",
    goal: "On a tick, Q takes D if LOAD is on. If LOAD is off, Q stays as it was.",
    layer: 5,
    inputs: ["CLK", "LOAD", "D"],
    outputs: ["Q"],
    memory: register,
    steps: [
      { inputs: [0, 1, 1], expected: [0] },
      { inputs: [0, 1, 1], tick: true, expected: [1] },
      { inputs: [0, 0, 0], tick: true, expected: [1] },
      { inputs: [0, 1, 0], tick: true, expected: [0] },
      { inputs: [0, 0, 1], tick: true, expected: [0] },
      { inputs: [0, 1, 1], tick: true, expected: [1] },
    ],
    // A flip-flop that takes its own Q back in unless LOAD picks D.
    solution: {
      nodes: [
        { name: "pick", type: "MUX", x: 19, y: 28 },
        { name: "ff", type: "D FLIP-FLOP", x: 32, y: 20 },
      ],
      wires: [
        ["ff", "pick:0"],
        ["D", "pick:1"],
        ["LOAD", "pick:2"],
        ["pick", "ff:0"],
        ["CLK", "ff:1"],
        ["ff", "Q"],
      ],
    },
  },
  {
    gate: "2-BIT REGISTER",
    goal: "On a tick, Q takes both signals of D if LOAD is on. If LOAD is off, Q stays as it was.",
    layer: 5,
    inputs: ["CLK", "LOAD", "D"],
    outputs: ["Q"],
    widths: { D: 2, Q: 2 },
    memory: register,
    steps: [
      { inputs: [0, 1, 2], expected: [0] },
      { inputs: [0, 1, 2], tick: true, expected: [2] },
      { inputs: [0, 0, 1], tick: true, expected: [2] },
      { inputs: [0, 1, 1], tick: true, expected: [1] },
      { inputs: [0, 1, 3], tick: true, expected: [3] },
      { inputs: [0, 0, 0], tick: true, expected: [3] },
    ],
    // Like the adder and the MUX: 8 signals is the same bit six more times,
    // so Bitbox hands over the 8-signal register.
    gives: {
      gate: "REGISTER",
      inputs: ["CLK", "LOAD", "D"],
      outputs: ["Q"],
      widths: { D: 8, Q: 8 },
      memory: register,
    },
    // A bit per signal, sharing CLK and LOAD, joined in order.
    solution: {
      nodes: [
        { name: "split", type: "SPLIT", x: 13, y: 38, width: 2 },
        { name: "high", type: "BIT", x: 24, y: 13 },
        { name: "low", type: "BIT", x: 24, y: 29 },
        { name: "join", type: "JOIN", x: 35, y: 22, width: 2 },
      ],
      wires: [
        ["D", "split"],
        ["CLK", "high:0"],
        ["LOAD", "high:1"],
        ["split:0", "high:2"],
        ["CLK", "low:0"],
        ["LOAD", "low:1"],
        ["split:1", "low:2"],
        ["high", "join:0"],
        ["low", "join:1"],
        ["join", "Q"],
      ],
    },
  },
  {
    gate: "DEMUX4",
    goal: "IN goes to the output SEL numbers, OUT0 to OUT3. The other outputs stay off.",
    layer: 5,
    inputs: ["IN", "SEL"],
    outputs: ["OUT0", "OUT1", "OUT2", "OUT3"],
    widths: { SEL: 2 },
    target: ([d = 0, sel = 0]) => [0, 1, 2, 3].map((i) => (i === sel ? d : 0)),
    // SEL's top signal picks the pair, and its ones place the output within
    // it.
    solution: {
      nodes: [
        { name: "sel", type: "SPLIT", x: 13, y: 36, width: 2 },
        { name: "pair", type: "DEMUX", x: 21, y: 16 },
        { name: "low", type: "DEMUX", x: 33, y: 13 },
        { name: "high", type: "DEMUX", x: 33, y: 31 },
      ],
      wires: [
        ["SEL", "sel"],
        ["IN", "pair:0"],
        ["sel:0", "pair:1"],
        ["pair", "low:0"],
        ["sel:1", "low:1"],
        ["pair:1", "high:0"],
        ["sel:1", "high:1"],
        ["low", "OUT0"],
        ["low:1", "OUT1"],
        ["high", "OUT2"],
        ["high:1", "OUT3"],
      ],
    },
  },
  {
    gate: "4-WAY MUX8",
    goal: "OUT is all 8 signals of the input SEL numbers: A at 0, B at 1, C at 2 and D at 3.",
    layer: 5,
    inputs: ["A", "B", "C", "D", "SEL"],
    outputs: ["OUT"],
    widths: { A: 8, B: 8, C: 8, D: 8, SEL: 2, OUT: 8 },
    target: ([a = 0, b = 0, c = 0, d = 0, sel = 0]) => [[a, b, c, d][sel] ?? 0],
    cases: [
      [1, 2, 3, 4, 0],
      [1, 2, 3, 4, 1],
      [1, 2, 3, 4, 2],
      [1, 2, 3, 4, 3],
      [255, 0, 170, 85, 2],
    ],
    grid: { width: 56, height: 45 },
    // MUX4's shape on buses: SEL's ones place picks within each pair, and
    // its top signal picks the pair.
    solution: {
      nodes: [
        { name: "sel", type: "SPLIT", x: 22, y: 40, width: 2 },
        { name: "ab", type: "MUX8", x: 28, y: 10 },
        { name: "cd", type: "MUX8", x: 28, y: 26 },
        { name: "pick", type: "MUX8", x: 40, y: 18 },
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
    gate: "2-REGISTER FILE",
    goal: "On a tick with WRITE on, register WSEL takes DIN. A and B always show registers ASEL and BSEL.",
    layer: 5,
    inputs: ["CLK", "WRITE", "WSEL", "DIN", "ASEL", "BSEL"],
    outputs: ["A", "B"],
    widths: { DIN: 8, A: 8, B: 8 },
    memory: registerFile(2),
    // Each register gets its own value, then A and B show two different
    // registers, and the same one twice. Step 5 sets up a write but doesn't
    // tick, so A still shows the old value.
    steps: [
      { inputs: [0, 1, 0, 11, 0, 0], expected: [0, 0] },
      { inputs: [0, 1, 0, 11, 0, 0], tick: true, expected: [11, 11] },
      { inputs: [0, 1, 1, 22, 0, 1], tick: true, expected: [11, 22] },
      { inputs: [0, 0, 0, 99, 1, 0], tick: true, expected: [22, 11] },
      { inputs: [0, 1, 1, 55, 1, 1], expected: [22, 22] },
      { inputs: [0, 1, 1, 55, 1, 0], tick: true, expected: [55, 11] },
      { inputs: [0, 0, 0, 0, 0, 1], expected: [11, 55] },
    ],
    // Like the 2-bit register: four registers are the same thing twice
    // more, so Bitbox hands over the 4-register file.
    gives: {
      gate: "REGISTER FILE",
      inputs: ["CLK", "WRITE", "WSEL", "DIN", "ASEL", "BSEL"],
      outputs: ["A", "B"],
      widths: { WSEL: 2, DIN: 8, ASEL: 2, BSEL: 2, A: 8, B: 8 },
      memory: registerFile(4),
    },
    grid: { width: 56, height: 40 },
    // A DEMUX sends WRITE to the LOAD of register WSEL, and a MUX8 for each
    // of A and B picks the register it shows.
    solution: {
      nodes: [
        { name: "write", type: "DEMUX", x: 18, y: 10 },
        { name: "r0", type: "REGISTER", x: 30, y: 8 },
        { name: "r1", type: "REGISTER", x: 30, y: 22 },
        { name: "readA", type: "MUX8", x: 42, y: 10 },
        { name: "readB", type: "MUX8", x: 42, y: 24 },
      ],
      wires: [
        ["WRITE", "write:0"],
        ["WSEL", "write:1"],
        ...[0, 1].flatMap((i): [string, string][] => [
          ["CLK", `r${i}:0`],
          [`write:${i}`, `r${i}:1`],
          ["DIN", `r${i}:2`],
          [`r${i}`, `readA:${i}`],
          [`r${i}`, `readB:${i}`],
        ]),
        ["ASEL", "readA:2"],
        ["BSEL", "readB:2"],
        ["readA", "A"],
        ["readB", "B"],
      ],
    },
  },
  {
    gate: "RAM",
    goal: "On a tick with WRITE on, place ADDR takes DIN. DOUT always shows place ADDR.",
    layer: 5,
    inputs: ["CLK", "WRITE", "ADDR", "DIN"],
    outputs: ["DOUT"],
    widths: { ADDR: 3, DIN: 8, DOUT: 8 },
    // A join for the register files' WSEL and ASEL.
    buses: [2],
    memory: places(8, ([, ...kept], [, , addr = 0]) => [kept[addr] ?? 0]),
    // Every place gets a different value, then each is read back.
    steps: [
      ...RAM_VALUES.map((value, addr) => ({ inputs: [0, 1, addr, value], tick: true, expected: [value] })),
      ...RAM_VALUES.map((value, addr) => ({ inputs: [0, 0, addr, 0], expected: [value] })),
    ],
    grid: { width: 60, height: 50 },
    // Two register files of four places each. ADDR's low two signals pick
    // the register in both, and its top signal steers WRITE to one of them
    // and picks which one DOUT shows. Their B outputs go unused.
    solution: {
      nodes: [
        { name: "addr", type: "SPLIT", x: 15, y: 30, width: 3 },
        { name: "low", type: "JOIN", x: 21, y: 30, width: 2 },
        { name: "write", type: "DEMUX", x: 22, y: 14 },
        { name: "lower", type: "REGISTER FILE", x: 34, y: 13 },
        { name: "upper", type: "REGISTER FILE", x: 34, y: 35 },
        { name: "read", type: "MUX8", x: 48, y: 24 },
      ],
      wires: [
        ["ADDR", "addr"],
        ["addr:1", "low:0"],
        ["addr:2", "low:1"],
        ["WRITE", "write:0"],
        ["addr:0", "write:1"],
        ...(["lower", "upper"] as const).flatMap((file, i): [string, string][] => [
          ["CLK", `${file}:0`],
          [`write:${i}`, `${file}:1`],
          ["low", `${file}:2`],
          ["DIN", `${file}:3`],
          ["low", `${file}:4`],
          [file, `read:${i}`],
        ]),
        ["addr:0", "read:2"],
        ["read", "DOUT"],
      ],
    },
  },
  {
    gate: "PROGRAM COUNTER",
    goal: "On a tick, the count takes ADDR if LOAD is on, or else goes up by 1. After 255 comes 0.",
    layer: 6,
    inputs: ["CLK", "LOAD", "ADDR"],
    outputs: ["PC"],
    widths: { ADDR: 8, PC: 8 },
    memory: {
      next: onTick(([, load = 0, addr = 0], [pc = 0]) => [load ? addr : (pc + 1) & 0xff]),
      outputs: ([, pc = 0]) => [pc],
    },
    // It counts, holds while LOAD is set up without a tick, loads, counts
    // on from there, and wraps.
    steps: [
      { inputs: [0, 0, 0], expected: [0] },
      { inputs: [0, 0, 0], tick: true, expected: [1] },
      { inputs: [0, 0, 0], tick: true, expected: [2] },
      { inputs: [0, 0, 0], tick: true, expected: [3] },
      { inputs: [0, 1, 100], expected: [3] },
      { inputs: [0, 1, 100], tick: true, expected: [100] },
      { inputs: [0, 0, 100], tick: true, expected: [101] },
      { inputs: [0, 1, 254], tick: true, expected: [254] },
      { inputs: [0, 0, 0], tick: true, expected: [255] },
      { inputs: [0, 0, 0], tick: true, expected: [0] },
    ],
    // A register that loads on every tick. An adder with an ON in CIN gives
    // PC + 1, and a MUX8 on LOAD picks that or ADDR for the register.
    solution: {
      nodes: [
        { name: "on", type: "ON", x: 20, y: 6 },
        { name: "pick", type: "MUX8", x: 20, y: 24 },
        { name: "pc", type: "REGISTER", x: 31, y: 16 },
        { name: "add", type: "8-BIT ADDER", x: 31, y: 32 },
      ],
      wires: [
        ["CLK", "pc:0"],
        ["on", "pc:1"],
        ["pick", "pc:2"],
        ["pc", "add:0"],
        ["on", "add:2"],
        ["add", "pick:0"],
        ["ADDR", "pick:1"],
        ["LOAD", "pick:2"],
        ["pc", "PC"],
      ],
    },
  },
  {
    gate: "2-TO-4 DECODER",
    goal: "Only the output S numbers is on, D0 to D3.",
    layer: 6,
    inputs: ["S"],
    outputs: ["D0", "D1", "D2", "D3"],
    widths: { S: 2 },
    target: ([s = 0]) => [0, 1, 2, 3].map((i) => (i === s ? 1 : 0)),
    // An AND for each output, fed each signal of S or its NOT.
    solution: {
      nodes: [
        { name: "s", type: "SPLIT", x: 11, y: 22, width: 2 },
        { name: "notHigh", type: "NOT", x: 18, y: 12 },
        { name: "notLow", type: "NOT", x: 18, y: 32 },
        { name: "d0", type: "AND", x: 31, y: 9 },
        { name: "d1", type: "AND", x: 31, y: 18 },
        { name: "d2", type: "AND", x: 31, y: 27 },
        { name: "d3", type: "AND", x: 31, y: 36 },
      ],
      wires: [
        ["S", "s"],
        ["s:0", "notHigh"],
        ["s:1", "notLow"],
        ["notHigh", "d0:0"],
        ["notLow", "d0:1"],
        ["notHigh", "d1:0"],
        ["s:1", "d1:1"],
        ["s:0", "d2:0"],
        ["notLow", "d2:1"],
        ["s:0", "d3:0"],
        ["s:1", "d3:1"],
        ["d0", "D0"],
        ["d1", "D1"],
        ["d2", "D2"],
        ["d3", "D3"],
      ],
    },
  },
  {
    gate: "4-TO-16 DECODER",
    goal: "Only the signal S numbers is on: LO holds numbers 0 to 7, and HI numbers 8 to 15.",
    layer: 6,
    inputs: ["S"],
    outputs: ["LO", "HI"],
    widths: { S: 4, LO: 8, HI: 8 },
    // Joins for S's top and bottom two signals.
    buses: [2],
    target: ([s = 0]) => [s < 8 ? 1 << s : 0, s < 8 ? 0 : 1 << (s - 8)],
    grid: { width: 60, height: 48 },
    // A 2-to-4 decoder on S's top two signals picks a group of four, and a
    // DEMUX4 per group sends it to the number S's bottom two signals pick.
    // Sixteen ANDs would do it too, but go over ten parts (ADR 10).
    solution: {
      nodes: [
        { name: "s", type: "SPLIT", x: 13, y: 24, width: 4 },
        { name: "high", type: "JOIN", x: 19, y: 12, width: 2 },
        { name: "low", type: "JOIN", x: 19, y: 38, width: 2 },
        { name: "group", type: "2-TO-4 DECODER", x: 26, y: 12 },
        { name: "g0", type: "DEMUX4", x: 35, y: 7 },
        { name: "g1", type: "DEMUX4", x: 35, y: 17 },
        { name: "g2", type: "DEMUX4", x: 35, y: 27 },
        { name: "g3", type: "DEMUX4", x: 35, y: 37 },
        { name: "lo", type: "JOIN", x: 43, y: 14, width: 8 },
        { name: "hi", type: "JOIN", x: 43, y: 34, width: 8 },
      ],
      wires: [
        ["S", "s"],
        ["s:0", "high:0"],
        ["s:1", "high:1"],
        ["s:2", "low:0"],
        ["s:3", "low:1"],
        ["high", "group"],
        ...[0, 1, 2, 3].flatMap((g): [string, string][] => [
          [`group:${g}`, `g${g}:0`],
          ["low", `g${g}:1`],
        ]),
        // A join takes its high bit first, so number n goes in pin 7 - n.
        ...Array.from({ length: 16 }, (_, n): [string, string] => [
          `g${Math.floor(n / 4)}:${n % 4}`,
          n < 8 ? `lo:${7 - n}` : `hi:${15 - n}`,
        ]),
        ["lo", "LO"],
        ["hi", "HI"],
      ],
    },
  },
  {
    gate: "4-BIT ZERO TEST",
    goal: "ZERO is on only when every signal of A is off.",
    layer: 6,
    inputs: ["A"],
    outputs: ["ZERO"],
    widths: { A: 4 },
    target: ([a = 0]) => [a === 0 ? 1 : 0],
    // Like the adder: 8 signals is the same OR tree one level deeper, so
    // Bitbox hands over the 8-signal zero test for the CPU's jump-if-zero.
    gives: {
      gate: "ZERO TEST",
      inputs: ["A"],
      outputs: ["ZERO"],
      widths: { A: 8 },
      target: ([a = 0]) => [a === 0 ? 1 : 0],
    },
    // OR A's signals together in pairs, down to one wire that's on when A
    // isn't zero, and NOT it.
    solution: {
      nodes: [
        { name: "split", type: "SPLIT", x: 11, y: 22, width: 4 },
        { name: "or0", type: "OR", x: 18, y: 15 },
        { name: "or1", type: "OR", x: 18, y: 29 },
        { name: "or2", type: "OR", x: 26, y: 22 },
        { name: "not", type: "NOT", x: 33, y: 22 },
      ],
      wires: [
        ["A", "split"],
        ["split:0", "or0:0"],
        ["split:1", "or0:1"],
        ["split:2", "or1:0"],
        ["split:3", "or1:1"],
        ["or0", "or2:0"],
        ["or1", "or2:1"],
        ["or2", "not"],
        ["not", "ZERO"],
      ],
    },
  },
  {
    gate: "SEQUENCER",
    goal: "EXEC starts off and changes on every tick: off for fetch, on for execute.",
    layer: 6,
    inputs: ["CLK"],
    outputs: ["EXEC"],
    memory: {
      next: onTick((_, [exec = 0]) => [1 - exec]),
      outputs: ([, exec = 0]) => [exec],
    },
    steps: [
      { inputs: [0], expected: [0] },
      { inputs: [0], tick: true, expected: [1] },
      { inputs: [0], tick: true, expected: [0] },
      { inputs: [0], tick: true, expected: [1] },
      { inputs: [0], tick: true, expected: [0] },
    ],
    // A flip-flop that takes the NOT of its own Q on every tick.
    solution: {
      nodes: [
        { name: "not", type: "NOT", x: 16, y: 30 },
        { name: "ff", type: "D FLIP-FLOP", x: 26, y: 20 },
      ],
      wires: [
        ["not", "ff:0"],
        ["CLK", "ff:1"],
        ["ff", "not"],
        ["ff", "EXEC"],
      ],
    },
  },
  {
    kind: "instruction set",
    id: INSTRUCTION_SET_ID,
    goal: "Give each instruction a mnemonic and an opcode, all different.",
    layer: 7,
  },
  controlUnit(BITBOX_INSTRUCTION_SET),
  executeLevel(BITBOX_INSTRUCTION_SET),
  cpuLevel(BITBOX_INSTRUCTION_SET),
  {
    kind: "door program",
    id: DOOR_PROGRAM_ID,
    goal: "Write the door program in your instruction set, type the name on the keypad, and run it.",
    layer: 9,
  },
];

// The game's levels as they read a player's instruction set.
export function withInstructionSet(levels: readonly Level[], set: InstructionSet): Level[] {
  return levels.map((level) => (isCircuit(level) && level.reads ? level.reads(set) : level));
}

function controlUnit(set: InstructionSet): CircuitLevel {
  const opcodes = new Set(INSTRUCTIONS.flatMap(({ id }) => rowOf(set, id).opcode ?? []));
  const spare = Array.from({ length: 16 }, (_, n) => n).filter((n) => !opcodes.has(n));
  const jz = rowOf(set, "jump if zero").opcode ?? 0;
  return {
    gate: "CONTROL UNIT",
    goal: "Turn your opcode into the signals that do its instruction. JUMP is on for jump, and for jump if zero while ZERO is on.",
    layer: 8,
    inputs: ["OPCODE", "ZERO"],
    outputs: ["WRITE", "SRC", "OP", "STORE", "JUMP", "IN", "OUT", "HALT"],
    widths: { OPCODE: 4, SRC: 2, OP: 3 },
    // Joins for the zero tests.
    buses: [8],
    target: (inputs) => control(set, inputs),
    // Every instruction in table order, jump if zero both ways, then the
    // spare opcode. The test run checks the rest out of sight.
    cases: [
      ...INSTRUCTIONS.flatMap(({ id }) => {
        const opcode = rowOf(set, id).opcode ?? 0;
        return opcode === jz
          ? [
              [opcode, 0],
              [opcode, 1],
            ]
          : [[opcode, 0]];
      }),
      ...spare.map((opcode) => [opcode, 0]),
    ],
    grid: { width: 76, height: 64 },
    // The decoder lights one line per opcode. A zero test over a join of
    // lines is on when none of them is: so WRITE is on unless the
    // instruction is one that writes no register, or the spare opcode, and
    // each SRC and OP signal is on unless it's one of a few instructions.
    solution: {
      nodes: [
        { name: "decoder", type: "4-TO-16 DECODER", x: 13, y: 19 },
        { name: "lo", type: "SPLIT", x: 22, y: 4, width: 8 },
        { name: "hi", type: "SPLIT", x: 22, y: 26, width: 8 },
        { name: "writers", type: "JOIN", x: 33, y: 2, width: 8 },
        { name: "write", type: "ZERO TEST", x: 39, y: 8 },
        { name: "op2", type: "JOIN", x: 33, y: 22, width: 8 },
        { name: "opHigh", type: "ZERO TEST", x: 39, y: 28 },
        { name: "op1", type: "JOIN", x: 33, y: 42, width: 8 },
        { name: "opMid", type: "ZERO TEST", x: 39, y: 48 },
        { name: "op0", type: "JOIN", x: 48, y: 2, width: 8 },
        { name: "opLow", type: "ZERO TEST", x: 54, y: 8 },
        { name: "src1", type: "JOIN", x: 48, y: 22, width: 8 },
        { name: "srcHigh", type: "ZERO TEST", x: 54, y: 28 },
        { name: "src0", type: "JOIN", x: 48, y: 42, width: 8 },
        { name: "srcLow", type: "ZERO TEST", x: 54, y: 48 },
        { name: "op", type: "JOIN", x: 63, y: 20, width: 3 },
        { name: "src", type: "JOIN", x: 63, y: 10, width: 2 },
        { name: "taken", type: "AND", x: 22, y: 50 },
        { name: "jump", type: "OR", x: 30, y: 58 },
      ],
      wires: [
        ["OPCODE", "decoder"],
        ["decoder:0", "lo"],
        ["decoder:1", "hi"],
        ...into("writers", [
          lineOf("halt"),
          lineOf("write"),
          lineOf("jump"),
          lineOf("jump if zero"),
          lineOf("out"),
          line(SPARE),
        ]),
        ["writers", "write"],
        ...into("op2", [lineOf("add"), lineOf("subtract")]),
        ["op2", "opHigh"],
        ...into("op1", [lineOf("add"), lineOf("subtract"), lineOf("and"), lineOf("or")]),
        ["op1", "opMid"],
        ...into("op0", [lineOf("add"), lineOf("and"), lineOf("xor")]),
        ["op0", "opLow"],
        ...into("src1", [lineOf("copy"), lineOf("set")]),
        ["src1", "srcHigh"],
        ...into("src0", [lineOf("copy"), lineOf("read"), lineOf("in")]),
        ["src0", "srcLow"],
        ...into("op", ["opHigh", "opMid", "opLow"]),
        ...into("src", ["srcHigh", "srcLow"]),
        [lineOf("jump if zero"), "taken:0"],
        ["ZERO", "taken:1"],
        [lineOf("jump"), "jump:0"],
        ["taken", "jump:1"],
        ["write", "WRITE"],
        ["src", "SRC"],
        ["op", "OP"],
        [lineOf("write"), "STORE"],
        ["jump", "JUMP"],
        [lineOf("in"), "IN"],
        [lineOf("out"), "OUT"],
        [lineOf("halt"), "HALT"],
      ],
    },
    reads: controlUnit,
  };
}

function executeLevel(set: InstructionSet): CircuitLevel {
  const memory = executeUnit(set);
  // The expected outputs are the spec's, played from all 0.
  let state: State = [];
  const steps = EXECUTE_STEPS.map((instruction): Row => {
    const [i, n] = encode(set, instruction);
    const inputs = [0, i, n, instruction.din ?? 0];
    const din = inputs[3] ?? 0;
    state = memory.next([0, i, n, din], memory.next([1, i, n, din], state));
    return { inputs, tick: true, expected: memory.outputs(state, inputs) };
  });
  return {
    gate: "EXECUTE UNIT",
    goal: "On each tick, do instruction I with number N. ADDR and DEV show N, and DOUT shows register R.",
    layer: 8,
    inputs: ["CLK", "I", "N", "DIN"],
    outputs: ["JUMP", "ADDR", "OUT", "DOUT", "DEV", "IN", "HALT"],
    widths: { I: 8, N: 8, DIN: 8, ADDR: 8, DOUT: 8, DEV: 8 },
    // Joins for the opcode, R and S, and the RAM address.
    buses: [4, 3, 2],
    memory,
    steps,
    grid: { width: 80, height: 64 },
    // I splits into the opcode, R and S. R and S pick the registers, and
    // the control unit picks what R takes: S, N, RAM or DIN, or the ALU.
    // RAM's address is N's low three signals, and it takes R.
    solution: {
      nodes: [
        { name: "i", type: "SPLIT", x: 15, y: 18, width: 8 },
        { name: "opcode", type: "JOIN", x: 21, y: 8, width: 4 },
        { name: "r", type: "JOIN", x: 21, y: 22, width: 2 },
        { name: "s", type: "JOIN", x: 21, y: 28, width: 2 },
        { name: "n", type: "SPLIT", x: 15, y: 40, width: 8 },
        { name: "a", type: "JOIN", x: 21, y: 50, width: 3 },
        { name: "control", type: "CONTROL UNIT", x: 28, y: 2 },
        { name: "registers", type: "REGISTER FILE", x: 30, y: 22 },
        { name: "zero", type: "ZERO TEST", x: 40, y: 12 },
        { name: "alu", type: "ALU", x: 42, y: 26 },
        { name: "ram", type: "RAM", x: 42, y: 40 },
        { name: "memory", type: "MUX8", x: 52, y: 44 },
        { name: "result", type: "4-WAY MUX8", x: 60, y: 28 },
      ],
      wires: [
        ["I", "i"],
        ...[0, 1, 2, 3].map((pin): [string, string] => [`i:${pin}`, `opcode:${pin}`]),
        ["i:4", "r:0"],
        ["i:5", "r:1"],
        ["i:6", "s:0"],
        ["i:7", "s:1"],
        ["N", "n"],
        ["n:5", "a:0"],
        ["n:6", "a:1"],
        ["n:7", "a:2"],
        ["opcode", "control:0"],
        ["zero", "control:1"],
        ["CLK", "registers:0"],
        ["control:0", "registers:1"],
        ["r", "registers:2"],
        ["result", "registers:3"],
        ["r", "registers:4"],
        ["s", "registers:5"],
        ["registers:0", "zero"],
        ["registers:0", "alu:0"],
        ["registers:1", "alu:1"],
        ["control:2", "alu:2"],
        ["CLK", "ram:0"],
        ["control:3", "ram:1"],
        ["a", "ram:2"],
        ["registers:0", "ram:3"],
        ["ram", "memory:0"],
        ["DIN", "memory:1"],
        ["control:5", "memory:2"],
        ["registers:1", "result:0"],
        ["N", "result:1"],
        ["memory", "result:2"],
        ["alu", "result:3"],
        ["control:1", "result:4"],
        ["control:4", "JUMP"],
        ["N", "ADDR"],
        ["control:6", "OUT"],
        ["registers:0", "DOUT"],
        ["N", "DEV"],
        ["control:5", "IN"],
        ["control:7", "HALT"],
      ],
    },
    reads: executeLevel,
  };
}

function cpuLevel(set: InstructionSet): CircuitLevel {
  return {
    gate: "CPU",
    goal: "Fetch on one tick, execute on the next, until HALT. Run each test program and send the right values out.",
    layer: 8,
    inputs: ["CLK", "DIN"],
    outputs: ["OUT", "DOUT", "DEV", "IN", "HALT"],
    widths: { DIN: 8, DOUT: 8, DEV: 8 },
    memory: cpu(set),
    programs: TEST_PROGRAMS.map((test) => Object.assign({ words: assemble(set, test.program) }, test)),
    programMemory: { x: 30, y: 13 },
    describe: (i, n) => describeInstruction(set, i, n),
    grid: { width: 76, height: 62 },
    // The program counter addresses program memory, and two registers take
    // its I and N on a fetch tick, while EXEC is off. The execute unit's
    // clock is EXEC, so it does the instruction as EXEC turns on. On an
    // execute tick the program counter loads: the jump address, or itself.
    // Once HALT is on during execute, the sequencer's clock stops.
    solution: {
      nodes: [
        { name: "pc", type: "PROGRAM COUNTER", x: 16, y: 10 },
        { name: "hold", type: "MUX8", x: 16, y: 26 },
        { name: "sequencer", type: "SEQUENCER", x: 28, y: 46 },
        { name: "running", type: "NAND", x: 18, y: 54 },
        { name: "clock", type: "AND", x: 18, y: 46 },
        { name: "fetch", type: "NOT", x: 38, y: 40 },
        { name: "instruction", type: "REGISTER", x: 44, y: 8 },
        { name: "number", type: "REGISTER", x: 44, y: 20 },
        { name: "execute", type: "EXECUTE UNIT", x: 58, y: 14 },
      ],
      wires: [
        ["CLK", "clock:0"],
        ["running", "clock:1"],
        ["clock", "sequencer"],
        ["sequencer", "running:0"],
        ["execute:6", "running:1"],
        ["CLK", "pc:0"],
        ["sequencer", "pc:1"],
        ["hold", "pc:2"],
        ["pc", "hold:0"],
        ["execute:1", "hold:1"],
        ["execute:0", "hold:2"],
        ["pc", `${PROGRAM_MEMORY}:0`],
        ["sequencer", "fetch"],
        ["CLK", "instruction:0"],
        ["fetch", "instruction:1"],
        [`${PROGRAM_MEMORY}:0`, "instruction:2"],
        ["CLK", "number:0"],
        ["fetch", "number:1"],
        [`${PROGRAM_MEMORY}:1`, "number:2"],
        ["sequencer", "execute:0"],
        ["instruction", "execute:1"],
        ["number", "execute:2"],
        ["DIN", "execute:3"],
        ["execute:2", "OUT"],
        ["execute:3", "DOUT"],
        ["execute:4", "DEV"],
        ["execute:5", "IN"],
        ["execute:6", "HALT"],
      ],
    },
    reads: cpuLevel,
  };
}

// An ALU on buses width signals wide. Subtract is add with B flipped and a
// carry in from OP's ones place, which wraps 1 - 2 round to 3 at 2 bits, or
// 3 - 5 to 254 at 8.
function aluTarget(width: number): Combinational["target"] {
  return ([a = 0, b = 0, op = 0]) => operate(op, a, b, op & 1, width).slice(0, 1);
}

// The ALU's operations on buses width signals wide, by OP (ADR 12): the result
// and the carry out. Only OP's top signal (logic) and ones place (subtract)
// matter to arithmetic, and COUT is the add or subtract's carry for every OP.
function operate(op: Value, a: Value, b: Value, cin: Value, width: number): Value[] {
  const all = 2 ** width - 1;
  const total = a + (op & 1 ? ~b & all : b) + cin;
  const logic = [a & b, a | b, a ^ b, ~a & all];
  return [op & 4 ? (logic[op & 3] ?? 0) : total & all, total > all ? 1 : 0];
}

// Whether a level has a circuit and a board: the instruction set and the
// door program don't.
export const isCircuit = (level: Level): level is CircuitLevel => level.kind === undefined;

// The part a solved level adds to the bin: the gate it builds, unless it
// gives another.
export function partGiven(level: Level): Part | null {
  if (!isCircuit(level)) return null;
  return level.gives ?? level;
}

// What saves, story flags and solved progress know a level by: the gate it
// builds, or the own identifier of a level with no circuit.
export const levelId = (level: Level): string => (isCircuit(level) ? level.gate : level.id);

// The game's circuit levels, the ones with a board.
export const circuits = (levels: readonly Level[]): CircuitLevel[] =>
  levels.flatMap((level) => (isCircuit(level) ? [level] : []));

// The parts the game's boards can hold: each level's gate, computing what
// its level asks for, and each part a level gives instead. A level's own
// gate stays a kind, so its board can still be loaded and tested.
export const PARTS: Parts = partsOf(LEVELS);

export function partsOf(levels: readonly Level[]): Parts {
  const built = circuits(levels);
  return partsFrom([...built, ...built.flatMap((level) => level.gives ?? [])]);
}

// Every solved level adds its part; the first level hands you NAND.
export function partsBin(levelIndex: number, levels = LEVELS): NodeType[] {
  return levels.slice(0, levelIndex).flatMap((level) => partGiven(level)?.gate ?? []);
}

// The levels that can be played: every solved level plus the next one.
// The revision of each level the player has solved, by its levelId.
// Keyed by identifier, not position, so it still means the same levels after one
// is added, taken out or moved.
export type Solved = Partial<Record<NodeType, number>>;

export const revisionOf = (level: Level): number => level.revision ?? 1;

// How many levels from the first are solved, at their current revision.
// Progress goes one level at a time, so a level added or changed before
// ones already solved must be solved first; then the count jumps past them.
export function solvedCount(solved: Solved, levels = LEVELS): number {
  const gap = levels.findIndex((level) => solved[levelId(level)] !== revisionOf(level));
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

// The level at an index, which must be a circuit level.
export function circuitAt(levelIndex: number, levels = LEVELS): CircuitLevel {
  const level = levelAt(levelIndex, levels);
  if (!isCircuit(level)) throw new Error(`Level ${levelIndex} isn't a circuit`);
  return level;
}

// The layer a level leads up to: the next layer, if the level is the last
// of its own and the next layer has a level in the game yet.
export function floorAbove(levelIndex: number, levels = LEVELS): Layer | null {
  const here = levelAt(levelIndex, levels).layer;
  const next = levels[levelIndex + 1];
  return next !== undefined && next.layer !== here ? layerOf(levelIndex + 1, levels) : null;
}

// The layer whose clue a sheet shows, if any: the last sheet of each of L1
// to L6 has one in its margin, once that level is solved.
export function clueAt(levelIndex: number, solved: number, levels = LEVELS): number | null {
  const { layer } = levelAt(levelIndex, levels);
  const last = layerLevels(layer, levels).at(-1);
  return layer <= 6 && last === levelIndex && levelIndex < solved ? layer : null;
}

// How many signals a level's terminal carries.
export function terminalWidth(level: CircuitLevel, label: Label): number {
  return level.widths?.[label] ?? 1;
}

// The first layer whose Wiring has the constant nodes, ON and OFF.
const CONSTANTS_LAYER = 6;

// The parts bin's Wiring section: a split and a join for each bus width the
// level's terminals use, widest first, then from L6 on the constants. Levels
// without buses have no splits or joins. None of them are parts, so the
// level supplies them (ADR 5).
export function wiring(level: CircuitLevel): { type: NodeType; width: number }[] {
  const terminals = [...level.inputs, ...level.outputs].map((label) => terminalWidth(level, label));
  const widths = [...new Set([...terminals, ...(level.buses ?? [])])];
  const buses = widths.filter((width) => width > 1);
  buses.sort((a, b) => b - a);
  const constants = level.layer >= CONSTANTS_LAYER ? ["ON", "OFF"].map((type) => ({ type, width: 1 })) : [];
  return [
    ...buses.flatMap((width) => [
      { type: "SPLIT", width },
      { type: "JOIN", width },
    ]),
    ...constants,
  ];
}

// A fresh board with the level's input terminals down the left edge, its
// output terminals down the right, and the gate wired between them if it's
// prebuilt. A program level's board has program memory, holding its first
// test program. The board can hold the given parts.
export function loadLevel(level: CircuitLevel, parts = PARTS): Game {
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
  if (level.programs !== undefined) placed(placeNode(game, PROGRAM_MEMORY, level.programMemory));
  loadFirstProgram(game, level);
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

// Fills a program level's program memory with its first test program, so
// the player can tick through it while building. A saved board's program
// memory comes back blank, since saves don't keep contents.
export function loadFirstProgram(game: Game, level: CircuitLevel): void {
  const memory = programMemoryOf(game.nodes);
  if (memory && level.programs !== undefined) loadContents(game, memory.id, level.programs[0]?.words ?? []);
}

// The pins a level's solution wires together, once its nodes are on the
// board as the given nodes, in the solution's order.
export function solutionWires(game: Game, level: CircuitLevel, ids: NodeID[]): { from: Pin; to: Pin }[] {
  const nodes = level.solution?.nodes ?? [];
  const pin = (end: string, side: Pin["side"]): Pin => {
    const [name = "", index = "0"] = end.split(":");
    const own = nodes.findIndex((n) => n.name === name);
    const node =
      own >= 0
        ? ids[own]
        : (terminalNamed(game, side === "out" ? "input" : "output", name)?.id ??
          [...game.nodes.values()].find((n) => n.type === name)?.id);
    if (node === undefined) throw new Error(`${level.gate}'s solution has no ${end}`);
    return { node, side, index: Number(index) };
  };
  return (level.solution?.wires ?? []).map(([from, to]) => ({ from: pin(from, "out"), to: pin(to, "in") }));
}

// Builds a level's solution onto its board.
export function buildSolution(game: Game, level: CircuitLevel): void {
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
  // A test program's row: its name, with the values its device gives as
  // its inputs and the values it sends out as its outputs.
  name?: string;
}

// The input terminal a level with a clock has.
export const CLOCK: Label = "CLK";

export function hasClock(level: CircuitLevel): boolean {
  return level.inputs.includes(CLOCK);
}

// The level's clock switch on the board, if the level has one.
export function clockOf(game: Game, level: CircuitLevel): NodeID | undefined {
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
export function rowCount(level: CircuitLevel): number {
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
function rowNumber(level: CircuitLevel, inputs: Value[]): number {
  return level.inputs.reduce((n, label, i) => n * 2 ** terminalWidth(level, label) + (inputs[i] ?? 0), 0);
}

// The rows the level panel shows: the timing table on a memory level, or
// else the truth table.
export function testTable(level: CircuitLevel): Row[] {
  if (level.programs !== undefined)
    return level.programs.map((test) => ({ name: test.name, inputs: test.device, expected: test.outs }));
  return level.steps ?? truthTable(level);
}

// The rows of the truth table the level panel shows: the level's cases if it
// has them, or else every combination of inputs. A memory level has none.
export function truthTable(level: CircuitLevel): Row[] {
  if (level.steps !== undefined || level.programs !== undefined) return [];
  if (level.cases !== undefined) return level.cases.map((inputs) => ({ inputs, expected: expectedFor(level, inputs) }));
  return Array.from({ length: rowCount(level) }, (_, n) => rowAt(level, n));
}

// Sets the input terminals to the given values, in the level's label order,
// settling the circuit.
export function applyInputs(game: Game, level: CircuitLevel, values: Value[]): void {
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
  // Whether a test program ran out of ticks before it halted.
  endless: boolean;
  passed: boolean;
}

// Runs the truth table or timing table on a copy of the board's signals,
// leaving the board and its input switches alone: the shown rows, then, if the level only shows a
// few cases, every other row out of sight. The run starts where restart
// would leave the board, so every memory part starts at 0.
export function checkLevel(board: Game, levelIndex: number, levels = LEVELS): CheckResult {
  const level = circuitAt(levelIndex, levels);
  const allowed = new Set<NodeType>([...partsBin(levelIndex, levels), ...wiring(level).map((w) => w.type)]);
  if (level.prebuilt === true) allowed.add(level.gate);
  // Terminals and program memory come with the level.
  const gates = [...board.nodes.values()].filter((node) => nodeKind(board, node).removable);
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
  const ran = { endless: false };
  if (level.programs !== undefined) {
    const inputs = level.inputs.map(terminal("input"));
    const outputs = level.outputs.map(terminal("output"));
    const memory = programMemoryOf(board.nodes)?.id ?? -1;
    rows = level.programs.map((test): CheckedRow => {
      const sim = simulate(board, inputs, outputs, new Map([[memory, test.words]]));
      const outcome = finish(
        play(
          machineOn(level, (values) => {
            const { outputs: got, stable } = sim(values);
            if (!stable) settled.always = false;
            return got;
          }),
          test.device,
          TICK_LIMIT,
        ),
      );
      if (!outcome.halted) ran.endless = true;
      return { name: test.name, inputs: test.device, expected: test.outs, actual: outcome.outs };
    });
  } else if (level.steps === undefined) {
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
    !ran.endless &&
    hidden.failed.length === 0 &&
    rows.every((row) => matches(row.actual, row.expected));
  return { rows, hidden, forbidden, unstable, endless: ran.endless, passed };
}

// A CPU board as a machine a test program runs on, given a way to set its
// input terminals and read its outputs: CLK, then DIN.
export function machineOn(level: CircuitLevel, run: (values: Value[]) => Value[]): Machine {
  const clock = level.inputs.indexOf(CLOCK);
  const values = (clk: Value, din: Value): Value[] => level.inputs.map((_, i) => (i === clock ? clk : din));
  return {
    tick: (din) => {
      run(values(1, din));
      run(values(0, din));
    },
    read: (din) => run(values(0, din)),
  };
}

// Sets a step's inputs and, if it ticks, turns the clock on and off, giving
// the outputs at the end.
function playStep(level: CircuitLevel, step: Row, run: (values: Value[]) => Value[]): Value[] {
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
