import { newGame, placeNode, setInputs, simulate, wire, type Game } from "./circuit";
import { DEFAULT_GRID, type Size } from "./grid";
import { definePart, mask, type Label, type Node, type NodeID, type NodeType, type Spec, type Value } from "./node";

// A level asks the player to build one gate out of the gates they have
// already built. Solving it adds that gate to the parts bin for later levels.
// A prebuilt level comes already wired: the player only tests it, to see
// what the gate does. The level names its terminals, and its target gives
// one value per output, in order; the part it adds to the bin computes the
// same (ADR 6), with bus pins as wide as the level's bus terminals.
export interface Level extends Spec {
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
  { number: 3, name: "Arithmetic", floor: "adder assembly", parts: "Half adder, full adder, 8-bit adder" },
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
];

for (const level of LEVELS) definePart(level.gate, level);

// Every solved level adds its gate; the first level hands you NAND.
export function partsBin(levelIndex: number, levels = LEVELS): NodeType[] {
  return levels.slice(0, levelIndex).map((level) => level.gate);
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
// prebuilt.
export function loadLevel(level: Level): Game {
  const grid = level.grid ?? DEFAULT_GRID;
  const game = newGame(grid);
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

export interface Row {
  // One value per input, in the level's order.
  inputs: Value[];
  // One value per output, in the level's order.
  expected: Value[];
}

interface CheckedRow extends Row {
  // What the board's output terminals gave.
  actual: Value[];
}

function expectedFor(level: Level, inputs: Value[]): Value[] {
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
function rowAt(level: Level, n: number): Row {
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

// The rows the level panel shows: the level's cases if it has them, or else
// every combination of inputs.
export function truthTable(level: Level): Row[] {
  if (level.cases !== undefined) return level.cases.map((inputs) => ({ inputs, expected: expectedFor(level, inputs) }));
  return Array.from({ length: rowCount(level) }, (_, n) => rowAt(level, n));
}

// Sets the INPUT terminals to the given values, in the level's label order,
// settling the circuit.
export function applyInputs(game: Game, level: Level, values: Value[]): void {
  const settings = new Map<NodeID, Value>();
  for (const node of game.nodes.values()) {
    const i = level.inputs.indexOf(node.label);
    const value = values[i];
    if (node.type === "INPUT" && value !== undefined) settings.set(node.id, value);
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
  passed: boolean;
}

// Runs the truth table without touching the player's board (or its input
// switches): the shown rows, then, if the level only shows a few cases,
// every other row out of sight.
export function checkLevel(board: Game, levelIndex: number, levels = LEVELS): CheckResult {
  const level = levelAt(levelIndex, levels);
  const allowed = new Set<NodeType>([
    "INPUT",
    "OUTPUT",
    ...partsBin(levelIndex, levels),
    ...wiring(level).map((w) => w.type),
  ]);
  if (level.prebuilt === true) allowed.add(level.gate);
  const forbidden = [...new Set([...board.nodes.values()].map((node) => node.type))].filter(
    (type) => !allowed.has(type),
  );

  const terminal =
    (type: NodeType) =>
    (label: Label): NodeID =>
      [...board.nodes.values()].find((node) => node.type === type && node.label === label)?.id ?? -1;
  const run = simulate(board, level.inputs.map(terminal("INPUT")), level.outputs.map(terminal("OUTPUT")));
  const rows = truthTable(level).map((row): CheckedRow => Object.assign(row, { actual: run(row.inputs) }));
  const hidden = level.cases === undefined ? { checked: 0, failed: [] } : checkHidden(level, level.cases, run);

  const passed =
    forbidden.length === 0 && hidden.failed.length === 0 && rows.every((row) => matches(row.actual, row.expected));
  return { rows, hidden, forbidden, passed };
}

function checkHidden(level: Level, cases: Value[][], run: (values: Value[]) => Value[]): CheckResult["hidden"] {
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
  if (count <= FULL_CHECK_LIMIT) {
    for (let n = 0; n < count && failed.length < MAX_HIDDEN_FAILURES; n++) check(n);
  } else {
    const random = seeded(SAMPLE_SEED);
    for (let i = 0; i < SAMPLE_SIZE && failed.length < MAX_HIDDEN_FAILURES; i++) check(Math.floor(random() * count));
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
