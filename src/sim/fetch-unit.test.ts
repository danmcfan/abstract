import { describe, expect, test } from "bun:test";
import { buildSolution, checkLevel, levelId, LEVELS, loadLevel, revisionOf } from "./level";
import type { State } from "./node";
import { index, level, tick } from "./fixtures";

describe("the fetch unit", () => {
  test("comes just before the CPU", () => {
    expect(levelId(LEVELS[index("CPU") - 1]!)).toBe("FETCH UNIT");
  });

  test("names its terminals, the count as the program counter does", () => {
    const fetch = level("FETCH UNIT");
    expect(fetch.inputs).toEqual(["CLK", "EXEC", "JUMP", "IIN", "NIN"]);
    expect(fetch.outputs).toEqual(["COUNT", "OPCODE", "R", "S", "N"]);
    expect(level("PROGRAM COUNTER").outputs).toEqual(["COUNT"]);
  });

  // With EXEC off a tick fetches and counts; with it on, a tick jumps or holds.
  test("fetches, then jumps to N or holds", () => {
    const memory = level("FETCH UNIT").memory!;
    let state: State = [];
    state = tick(memory, [0, 0, 0, 0b1011_0110, 42], state);
    expect(memory.outputs(state, [])).toEqual([1, 11, 1, 2, 42]);
    state = tick(memory, [0, 1, 0, 0, 0], state);
    expect(memory.outputs(state, [])).toEqual([1, 11, 1, 2, 42]);
    state = tick(memory, [0, 0, 0, 0b0001_0000, 7], state);
    state = tick(memory, [0, 1, 1, 0, 0], state);
    expect(memory.outputs(state, [])).toEqual([7, 1, 0, 0, 7]);
  });

  test("builds in 5 nodes and 18 wires, and passes", () => {
    const fetch = level("FETCH UNIT");
    expect([fetch.solution?.nodes.length, fetch.solution?.wires.length]).toEqual([5, 18]);
    const game = loadLevel(fetch);
    buildSolution(game, fetch);
    expect(checkLevel(game, index("FETCH UNIT")).passed).toBe(true);
  });
});

describe("the 3-part CPU", () => {
  test("builds in 3 nodes and 19 wires, at a new revision", () => {
    const cpu = level("CPU");
    expect([cpu.solution?.nodes.length, cpu.solution?.wires.length]).toEqual([3, 19]);
    expect(cpu.solution?.nodes.map((node) => node.type)).toEqual(["STEPPER", "FETCH UNIT", "EXECUTE UNIT"]);
    expect(revisionOf(cpu)).toBe(2);
  });
});
