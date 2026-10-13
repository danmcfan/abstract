import { newGame, placeNode, setInput, wire, type Game } from "./circuit";
import { GRID_HEIGHT, GRID_WIDTH } from "./grid";
import { definePart, type Label, type NodeType, type Spec } from "./node";

// A level asks the player to build one gate out of the gates they have
// already built. Solving it adds that gate to the parts bin for later levels.
// A prebuilt level comes already wired: the player only tests it, to see
// what the gate does. The level names its terminals, and its target gives
// one value per output, in order; the part it adds to the bin computes the
// same (ADR 6).
export interface Level extends Spec {
  gate: NodeType;
  goal: string;
  // The number of the layer the level belongs to.
  layer: number;
  prebuilt?: boolean;
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
  { number: 6, name: "Control", floor: "the clock tower", parts: "Constants, program counter, decoder, sequencer, clock speed" },
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
    target: ([a, b]) => [!(a && b)],
    layer: 1,
    prebuilt: true,
  },
  { gate: "NOT", goal: "Output is on when A is off.", layer: 2, inputs: ["A"], outputs: ["OUT"], target: ([a]) => [!a] },
  { gate: "AND", goal: "Output is on when A and B are both on.", layer: 2, inputs: ["A", "B"], outputs: ["OUT"], target: ([a, b]) => [!!(a && b)] },
  { gate: "OR", goal: "Output is on when A or B is on.", layer: 2, inputs: ["A", "B"], outputs: ["OUT"], target: ([a, b]) => [!!(a || b)] },
  { gate: "XOR", goal: "Output is on when exactly one of A and B is on.", layer: 2, inputs: ["A", "B"], outputs: ["OUT"], target: ([a, b]) => [a !== b] },
  {
    gate: "MUX",
    goal: "Output is A when SEL is off, and B when SEL is on.",
    layer: 2,
    inputs: ["A", "B", "SEL"],
    outputs: ["OUT"],
    target: ([a, b, sel]) => [!!(sel ? b : a)],
  },
  {
    gate: "DEMUX",
    goal: "D goes to Y0 when SEL is off, and to Y1 when SEL is on.",
    layer: 2,
    inputs: ["D", "SEL"],
    outputs: ["Y0", "Y1"],
    target: ([d, sel]) => [!!(d && !sel), !!(d && sel)],
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
  return indexes[0]! < playableCount(solved, levels) ? "in progress" : "locked";
}

export function layerOf(levelIndex: number, levels = LEVELS): Layer {
  return LAYERS.find((layer) => layer.number === levels[levelIndex]!.layer)!;
}

// The layer a level leads up to: the next layer, if the level is the last
// of its own and the next layer has a level in the game yet.
export function floorAbove(levelIndex: number, levels = LEVELS): Layer | null {
  const here = levels[levelIndex]!.layer;
  const next = levels[levelIndex + 1];
  return next && next.layer !== here ? layerOf(levelIndex + 1, levels) : null;
}

// A fresh board with the level's input terminals down the left edge, its
// output terminals down the right, and the gate wired between them if it's
// prebuilt.
export function loadLevel(level: Level): Game {
  const game = newGame();
  const column = (x: number, i: number, count: number) => ({ x, y: (GRID_HEIGHT * (i + 1)) / (count + 1) });
  const inputs = level.inputs.map((label, i) => placeNode(game, "INPUT", column(4, i, level.inputs.length), label)!);
  const outputs = level.outputs.map((label, i) => placeNode(game, "OUTPUT", column(GRID_WIDTH - 4, i, level.outputs.length), label)!);
  if (level.prebuilt) {
    const gate = placeNode(game, level.gate, { x: GRID_WIDTH / 2, y: GRID_HEIGHT / 2 })!;
    inputs.forEach((input, i) => wire(game, { node: input.id, side: "out", index: 0 }, { node: gate.id, side: "in", index: i }));
    outputs.forEach((output, i) => wire(game, { node: gate.id, side: "out", index: i }, { node: output.id, side: "in", index: 0 }));
  }
  return game;
}

export interface Row {
  inputs: boolean[];
  // One value per output, in the level's order.
  expected: boolean[];
}

// Every combination of inputs, counting up in binary with A as the high bit.
export function truthTable(level: Level): Row[] {
  const n = level.inputs.length;
  const rows: Row[] = [];
  for (let bits = 0; bits < 1 << n; bits++) {
    const inputs = level.inputs.map((_, i) => ((bits >> (n - 1 - i)) & 1) === 1);
    rows.push({ inputs, expected: level.target(inputs) });
  }
  return rows;
}

// Sets the INPUT terminals to the given values, in the level's label order,
// settling the circuit.
export function applyInputs(game: Game, level: Level, values: boolean[]): void {
  for (const node of game.nodes.values()) {
    const i = level.inputs.indexOf(node.label);
    if (node.type === "INPUT" && i >= 0) setInput(game, node.id, values[i]!);
  }
}

// Reads each OUTPUT terminal by name, in the level's output order.
export function readOutputs(game: Game, level: Level): boolean[] {
  const terminals = [...game.nodes.values()].filter((node) => node.type === "OUTPUT");
  return level.outputs.map((label) => terminals.find((node) => node.label === label)?.isHigh ?? false);
}

// A row passes only if every output matches.
export function matches(actual: boolean[], expected: boolean[]): boolean {
  return actual.length === expected.length && actual.every((value, i) => value === expected[i]);
}

export interface CheckResult {
  rows: (Row & { actual: boolean[] })[];
  // Gate types on the board that this level's parts bin doesn't offer.
  forbidden: NodeType[];
  passed: boolean;
}

// Runs the truth table on a copy, so the player's board (and its input
// switches) is left untouched.
export function checkLevel(board: Game, levelIndex: number, levels = LEVELS): CheckResult {
  const game = structuredClone(board);
  const level = levels[levelIndex]!;
  const allowed = new Set<NodeType>(["INPUT", "OUTPUT", ...partsBin(levelIndex, levels)]);
  if (level.prebuilt) allowed.add(level.gate);
  const forbidden = [...new Set([...game.nodes.values()].map((node) => node.type))].filter((type) => !allowed.has(type));
  const rows = truthTable(level).map((row) => {
    applyInputs(game, level, row.inputs);
    return { ...row, actual: readOutputs(game, level) };
  });
  return { rows, forbidden, passed: forbidden.length === 0 && rows.every((row) => matches(row.actual, row.expected)) };
}
