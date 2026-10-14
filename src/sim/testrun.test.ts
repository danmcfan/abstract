import { describe, expect, test } from "bun:test";
import { loadLevel, LEVELS, type CheckResult } from "./level";
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
