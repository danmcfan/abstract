import { newGame, placeNode, setInput, wire, type Game } from "./circuit";
import { GRID_HEIGHT, GRID_WIDTH } from "./grid";
import type { Label, NodeType } from "./node";

// A level asks the player to build one gate out of the gates they have
// already built. Solving it adds that gate to the parts bin for later levels.
// A prebuilt level comes already wired: the player only tests it, to see
// what the gate does.
export interface Level {
  gate: NodeType;
  goal: string;
  inputs: Label[];
  target: (inputs: boolean[]) => boolean;
  prebuilt?: boolean;
}

export const LEVELS: Level[] = [
  {
    gate: "NAND",
    goal: "Output is on unless A and B are both on.",
    inputs: ["ALPHA", "BETA"],
    target: ([a, b]) => !(a && b),
    prebuilt: true,
  },
  { gate: "NOT", goal: "Output is on when A is off.", inputs: ["ALPHA"], target: ([a]) => !a },
  { gate: "AND", goal: "Output is on when A and B are both on.", inputs: ["ALPHA", "BETA"], target: ([a, b]) => !!(a && b) },
  { gate: "OR", goal: "Output is on when A or B is on.", inputs: ["ALPHA", "BETA"], target: ([a, b]) => !!(a || b) },
  { gate: "XOR", goal: "Output is on when exactly one of A and B is on.", inputs: ["ALPHA", "BETA"], target: ([a, b]) => a !== b },
];

// Every solved level adds its gate; the first level hands you NAND.
export function partsBin(levelIndex: number): NodeType[] {
  return LEVELS.slice(0, levelIndex).map((level) => level.gate);
}

// A fresh board with the level's input terminals on the left and one output
// terminal on the right, and the gate wired between them if it's prebuilt.
export function loadLevel(level: Level): Game {
  const game = newGame();
  const inputs = level.inputs.map(
    (label, i) => placeNode(game, "INPUT", { x: 4, y: (GRID_HEIGHT * (i + 1)) / (level.inputs.length + 1) }, label)!,
  );
  const output = placeNode(game, "OUTPUT", { x: GRID_WIDTH - 4, y: GRID_HEIGHT / 2 })!;
  if (level.prebuilt) {
    const gate = placeNode(game, level.gate, { x: GRID_WIDTH / 2, y: GRID_HEIGHT / 2 })!;
    inputs.forEach((input, i) => wire(game, { node: input.id, side: "out", index: 0 }, { node: gate.id, side: "in", index: i }));
    wire(game, { node: gate.id, side: "out", index: 0 }, { node: output.id, side: "in", index: 0 });
  }
  return game;
}

export interface Row {
  inputs: boolean[];
  expected: boolean;
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

export function readOutput(game: Game): boolean {
  return [...game.nodes.values()].some((node) => node.type === "OUTPUT" && node.isHigh);
}

export interface CheckResult {
  rows: (Row & { actual: boolean })[];
  // Gate types on the board that this level's parts bin doesn't offer.
  forbidden: NodeType[];
  passed: boolean;
}

// Runs the truth table on a copy, so the player's board (and its input
// switches) is left untouched.
export function checkLevel(board: Game, levelIndex: number): CheckResult {
  const game = structuredClone(board);
  const level = LEVELS[levelIndex]!;
  const allowed = new Set<NodeType>(["INPUT", "OUTPUT", ...partsBin(levelIndex)]);
  if (level.prebuilt) allowed.add(level.gate);
  const forbidden = [...new Set([...game.nodes.values()].map((node) => node.type))].filter((type) => !allowed.has(type));
  const rows = truthTable(level).map((row) => {
    applyInputs(game, level, row.inputs);
    return { ...row, actual: readOutput(game) };
  });
  return { rows, forbidden, passed: forbidden.length === 0 && rows.every((row) => row.actual === row.expected) };
}
