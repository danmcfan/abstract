import { describe, expect, test } from "bun:test";
import { unwire, type Game } from "./circuit";
import { REVERSED } from "./fixtures";
import type { InstructionSet } from "./instruction";
import { buildSolution, checkLevel, circuitAt, LEVELS, levelId, loadLevel, partsOf, withInstructionSet } from "./level";
import type { NodeType } from "./node";

const index = (gate: NodeType): number => LEVELS.findIndex((level) => levelId(level) === gate);
const CPU = index("CPU");

// A level's intended board, with the game's levels read with a set.
function solved(gate: NodeType, set?: InstructionSet): { game: Game; levels: typeof LEVELS } {
  const levels = set ? withInstructionSet(LEVELS, set) : LEVELS;
  const level = circuitAt(index(gate), levels);
  const game = loadLevel(level, partsOf(levels));
  buildSolution(game, level);
  return { game, levels };
}

const nodeOf = (game: Game, type: NodeType): number => [...game.nodes.values()].find((n) => n.type === type)?.id ?? -1;

describe("the CPU level", () => {
  test("its intended board runs every test program", () => {
    const { game } = solved("CPU");
    const result = checkLevel(game, CPU);
    expect(result.passed).toBe(true);
    expect(result.endless).toBe(false);
  });

  test("a board that never jumps fails the jump program", () => {
    const { game } = solved("CPU");
    unwire(game, { node: nodeOf(game, "FETCH UNIT"), side: "in", index: 2 });
    const result = checkLevel(game, CPU);
    expect(result.passed).toBe(false);
    expect(result.rows.find((row) => row.name === "count down from 3")?.actual).toEqual([3]);
  });

  // The last test program has a loop after its HALT.
  test("a board that doesn't stop at HALT fails at the tick limit", () => {
    const { game } = solved("CPU");
    unwire(game, { node: nodeOf(game, "STEPPER"), side: "in", index: 1 });
    const result = checkLevel(game, CPU);
    expect(result.passed).toBe(false);
    expect(result.endless).toBe(true);
  });

  test("still runs its test programs after the opcodes change", () => {
    const { game, levels } = solved("CPU", REVERSED);
    expect(checkLevel(game, CPU, levels).passed).toBe(true);
  });
});
