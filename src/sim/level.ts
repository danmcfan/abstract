import { newGame, nodeKind, placeNode, setInputs, simulate, wire, type Game } from "./circuit";
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
}

type Part = Spec & { gate: NodeType };

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
  },
  {
    gate: "AND",
    goal: "Output is on when A and B are both on.",
    layer: 2,
    inputs: ["A", "B"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0]) => [a & b],
  },
  {
    gate: "OR",
    goal: "Output is on when A or B is on.",
    layer: 2,
    inputs: ["A", "B"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0]) => [a | b],
  },
  {
    gate: "XOR",
    goal: "Output is on when exactly one of A and B is on.",
    layer: 2,
    inputs: ["A", "B"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0]) => [a ^ b],
  },
  {
    gate: "MUX",
    goal: "Output is A when SEL is off, and B when SEL is on.",
    layer: 2,
    inputs: ["A", "B", "SEL"],
    outputs: ["OUT"],
    target: ([a = 0, b = 0, sel = 0]) => [sel ? b : a],
  },
  {
    gate: "DEMUX",
    goal: "D goes to Y0 when SEL is off, and to Y1 when SEL is on.",
    layer: 2,
    inputs: ["D", "SEL"],
    outputs: ["Y0", "Y1"],
    target: ([d = 0, sel = 0]) => [d & (1 - sel), d & sel],
  },
  {
    gate: "HALF ADDER",
    goal: "SUM is on when exactly one of A and B is on. COUT is on when both are.",
    layer: 3,
    inputs: ["A", "B"],
    outputs: ["SUM", "COUT"],
    target: ([a = 0, b = 0]) => [a ^ b, a & b],
  },
  {
    gate: "FULL ADDER",
    goal: "Add A, B and CIN. SUM is the ones place of the total, and COUT the twos place.",
    layer: 3,
    inputs: ["A", "B", "CIN"],
    outputs: ["SUM", "COUT"],
    target: ([a = 0, b = 0, cin = 0]) => [a ^ b ^ cin, (a & b) | (cin & (a ^ b))],
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

interface CheckedRow extends Row {
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

// Runs the truth table or timing table without touching the player's board
// (or its input switches): the shown rows, then, if the level only shows a
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
