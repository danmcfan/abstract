import { describe, expect, test } from "bun:test";
import { edgeInto, placeNode, restart, terminalNamed, wire, type Game, type Pin } from "./circuit";
import { partsFrom } from "./kind";
import { buildSolution, checkLevel, loadLevel, LEVELS, type CheckResult, type Level } from "./level";
import type { NodeID, Value } from "./node";
import { table, TestRun } from "./testrun";

// The NOT level: input A, output Y, two rows.
const NOT = LEVELS[1]!;

// A run's check, as checkLevel would give it: the first shown row wrong, the second
// right, and any rows that failed out of sight.
const check = (hidden: CheckResult["hidden"]["failed"] = []): CheckResult => ({
  rows: [
    { inputs: [0], expected: [1], actual: [0] },
    { inputs: [1], expected: [0], actual: [0] },
  ],
  hidden: { checked: hidden.length, failed: hidden },
  forbidden: [],
  unstable: false,
  passed: false,
});

describe("table", () => {
  test("before any run, the level's table is untested", () => {
    expect(table(NOT)).toEqual([
      { inputs: [0], expected: [1], status: "untested" },
      { inputs: [1], expected: [0], status: "untested" },
    ]);
  });
});

describe("test run", () => {
  test("a step on a level with no clock never ticks", () => {
    const run = new TestRun(NOT, check());
    expect(run.step(loadLevel(NOT))?.ticked).toBe(false);
  });

  test("each step shows the next row checked, with its actual value", () => {
    const game = loadLevel(NOT);
    const run = new TestRun(NOT, check());
    expect(run.current).toBeNull();
    expect(run.rows.map((row) => row.status)).toEqual(["untested", "untested"]);

    expect(run.step(game)?.row.inputs).toEqual([0]);
    expect(run.current).toBe(0);
    expect(run.rows[0]).toEqual({ inputs: [0], expected: [1], actual: [0], status: "failed" });
    expect(run.rows[1]!.status).toBe("untested");

    run.step(game);
    expect(run.rows[1]).toEqual({ inputs: [1], expected: [0], actual: [0], status: "passed" });

    const rows = run.rows;
    expect(run.rows).toBe(rows);
    expect(run.step(game)).toBeNull();
    expect(run.done).toBe(true);
    expect(run.current).toBeNull();
  });

  test("each step sets the board's inputs to its row", () => {
    const game = loadLevel(NOT);
    const run = new TestRun(NOT, check());
    run.step(game);
    run.step(game);
    const a = [...game.nodes.values()].find((node) => node.type === "INPUT")!;
    expect(a.signals).toEqual([1]);
  });

  test("a row that failed out of sight shows as failed with its actual value once the run ends", () => {
    const game = loadLevel(NOT);
    const run = new TestRun(NOT, check([{ inputs: [1], expected: [0], actual: [1] }]));
    run.step(game);
    run.step(game);
    expect(run.rows).toHaveLength(2);
    run.step(game);
    expect(run.rows).toHaveLength(3);
    expect(run.rows[2]).toEqual({ inputs: [1], expected: [0], actual: [1], status: "failed" });
  });
});

// What the board's output terminals show, in the level's label order: the
// value on the wire into each, or 0 when it isn't wired.
function boardOutputs(game: Game, level: Level): Value[] {
  return level.outputs.map((label) => edgeInto(game, terminalNamed(game, "output", label)!.id, 0)?.value ?? 0);
}

// Steps a whole test run of the board after a restart, as the session does,
// and gives each shown row's recorded actual next to what the board showed.
function stepRun(game: Game, levels: Level[], index: number): { recorded: Value[]; shown: Value[] }[] {
  const level = levels[index]!;
  restart(game);
  const run = new TestRun(level, checkLevel(game, index, levels));
  const seen: { recorded: Value[]; shown: Value[] }[] = [];
  for (let step = run.step(game); step !== null; step = run.step(game)) {
    seen.push({ recorded: step.row.actual, shown: boardOutputs(game, level) });
  }
  return seen;
}

// Checks a test run of the last of the levels records these outputs, and
// that the board shows each of them.
function expectShownAsRecorded(game: Game, levels: Level[], recorded: Value[][]): void {
  const seen = stepRun(game, levels, levels.length - 1);
  expect(seen.map((row) => row.recorded)).toEqual(recorded);
  for (const row of seen) expect(row.shown).toEqual(row.recorded);
}

const out = (node: NodeID, index = 0): Pin => ({ node, side: "out", index });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });

// A memory level with no clock whose board holds its value in a loop: two
// cross-coupled NANDs, set and reset by S and R going off.
const LATCH: Level = {
  gate: "NAND LATCH",
  goal: "Q turns on while S is off, off while R is off, and holds while both are on.",
  layer: 5,
  inputs: ["S", "R"],
  outputs: ["Q"],
  memory: {
    next: ([s = 1, r = 1], state) => {
      if (s === 0) return [1];
      if (r === 0) return [0];
      return state;
    },
    outputs: ([q = 0]) => [q],
  },
  steps: [
    { inputs: [0, 1], expected: [1] },
    { inputs: [1, 1], expected: [1] },
    { inputs: [1, 0], expected: [0] },
    { inputs: [1, 1], expected: [0] },
  ],
};

// A memory level with a clock: a D flip-flop, prebuilt.
const FLIP_FLOP: Level = {
  gate: "DFF",
  goal: "Q takes D's value when the clock turns on, and keeps it until the next tick.",
  layer: 5,
  inputs: ["D", "CLK"],
  outputs: ["Q"],
  memory: {
    next: ([d = 0, clk = 0], [q = 0, seen = 0]) => [clk && !seen ? d : q, clk],
    outputs: ([q = 0]) => [q],
  },
  steps: [
    { inputs: [1, 0], expected: [0] },
    { inputs: [1, 0], tick: true, expected: [1] },
    { inputs: [0, 0], expected: [1] },
    { inputs: [0, 0], tick: true, expected: [0] },
  ],
  prebuilt: true,
};

describe("a test run's board", () => {
  test("shows the recorded outputs on every row of every level's intended solution", () => {
    // Each value is paired with its gate, so a failure names the level.
    LEVELS.forEach((level, index) => {
      if (level.solution === undefined) return;
      const game = loadLevel(level);
      buildSolution(game, level);
      for (const { recorded, shown } of stepRun(game, LEVELS, index))
        expect([level.gate, shown]).toEqual([level.gate, recorded]);
    });
  });

  test("shows the recorded outputs on a memory level whose steps tick the clock", () => {
    const levels = [...LEVELS, FLIP_FLOP];
    const game = loadLevel(FLIP_FLOP, partsFrom(levels));
    expectShownAsRecorded(game, levels, [[0], [1], [1], [0]]);
  });

  test("shows the recorded outputs on a board that holds its value in a stable loop", () => {
    const levels = [...LEVELS, LATCH];
    const game = loadLevel(LATCH, partsFrom(levels));
    const top = placeNode(game, "NAND", { x: 12, y: 6 })!.id;
    const bottom = placeNode(game, "NAND", { x: 12, y: 14 })!.id;
    wire(game, out(terminalNamed(game, "input", "S")!.id), inp(top, 0));
    wire(game, out(bottom), inp(top, 1));
    wire(game, out(top), inp(bottom, 0));
    wire(game, out(terminalNamed(game, "input", "R")!.id), inp(bottom, 1));
    wire(game, out(top), inp(terminalNamed(game, "output", "Q")!.id));
    expectShownAsRecorded(game, levels, [[1], [1], [0], [0]]);
  });
});
