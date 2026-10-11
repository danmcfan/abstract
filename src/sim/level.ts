import { propagate } from "./circuit";
import { GRID_HEIGHT, GRID_WIDTH } from "./grid";
import { addNode, newGame, type Game, type Label, type NodeType } from "./node";

// A level asks the player to build one gate out of the gates they have
// already built. Solving it adds that gate to the toolbox for later levels.
export interface Level {
  gate: NodeType;
  goal: string;
  inputs: Label[];
  target: (inputs: boolean[]) => boolean;
}

export const LEVELS: Level[] = [
  { gate: "NOT", goal: "Output is on when A is off.", inputs: ["ALPHA"], target: ([a]) => !a },
  { gate: "AND", goal: "Output is on when A and B are both on.", inputs: ["ALPHA", "BETA"], target: ([a, b]) => !!(a && b) },
  { gate: "OR", goal: "Output is on when A or B is on.", inputs: ["ALPHA", "BETA"], target: ([a, b]) => !!(a || b) },
];

// NAND is the one gate you start with. Every solved level adds its gate.
export function toolbox(levelIndex: number): NodeType[] {
  return ["NAND", ...LEVELS.slice(0, levelIndex).map((level) => level.gate)];
}

// A fresh board with the level's input terminals on the left and one output
// terminal on the right.
export function loadLevel(level: Level): Game {
  const game = newGame();
  level.inputs.forEach((label, i) => {
    addNode(game, "INPUT", { x: 4, y: (GRID_HEIGHT * (i + 1)) / (level.inputs.length + 1) }, label);
  });
  addNode(game, "OUTPUT", { x: GRID_WIDTH - 4, y: GRID_HEIGHT / 2 });
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
// and settles the circuit.
export function applyInputs(game: Game, level: Level, values: boolean[]): void {
  for (const node of game.nodes.values()) {
    const i = level.inputs.indexOf(node.label);
    if (node.type === "INPUT" && i >= 0) node.isHigh = values[i]!;
  }
  propagate(game);
}

export function readOutput(game: Game): boolean {
  return [...game.nodes.values()].some((node) => node.type === "OUTPUT" && node.isHigh);
}

export interface CheckResult {
  rows: (Row & { actual: boolean })[];
  // Gate types on the board that this level's toolbox doesn't offer.
  forbidden: NodeType[];
  passed: boolean;
}

export function checkLevel(game: Game, levelIndex: number): CheckResult {
  const level = LEVELS[levelIndex]!;
  const allowed = new Set<NodeType>(["INPUT", "OUTPUT", ...toolbox(levelIndex)]);
  const forbidden = [...new Set([...game.nodes.values()].map((node) => node.type))].filter((type) => !allowed.has(type));
  const rows = truthTable(level).map((row) => {
    applyInputs(game, level, row.inputs);
    return { ...row, actual: readOutput(game) };
  });
  return { rows, forbidden, passed: forbidden.length === 0 && rows.every((row) => row.actual === row.expected) };
}
