import { describe, expect, test } from "bun:test";
import { control, opEncoder, writeEncoder } from "./cpu";
import { randomSet } from "./fixtures";
import { BITBOX_INSTRUCTION_SET, INSTRUCTIONS, rowOf, type InstructionID } from "./instruction";
import {
  buildSolution,
  checkLevel,
  circuitAt,
  levelId,
  LEVELS,
  loadLevel,
  partsOf,
  revisionOf,
  spareOf,
  withInstructionSet,
} from "./level";
import type { NodeType } from "./node";

const L8_CONTROL = ["OP ENCODER", "WRITE ENCODER", "CONTROL UNIT"];
const index = (gate: NodeType): number => LEVELS.findIndex((level) => levelId(level) === gate);
const opcodeOf = (id: InstructionID): number => rowOf(BITBOX_INSTRUCTION_SET, id).opcode ?? 0;

// Each spec's outputs for an instruction in Bitbox's set.
const op = (id: InstructionID): number => opEncoder(BITBOX_INSTRUCTION_SET, [opcodeOf(id)])[0]!;
const write = (id: InstructionID): number[] => writeEncoder(BITBOX_INSTRUCTION_SET, [opcodeOf(id)]);
const at = (id: InstructionID, a = 0): number[] => control(BITBOX_INSTRUCTION_SET, [opcodeOf(id), a]);

describe("the L8 control levels", () => {
  test("follow the instruction set, encoders first", () => {
    const first = index("OP ENCODER");
    expect(LEVELS.slice(first, first + 4).map((level) => levelId(level))).toEqual([...L8_CONTROL, "EXECUTE UNIT"]);
    expect(LEVELS[first - 1]?.kind).toBe("instruction set");
  });

  test("the control unit's new terminals bump its revision", () => {
    expect(revisionOf(LEVELS[index("CONTROL UNIT")]!)).toBe(2);
  });

  // Every valid instruction set, not only Bitbox's, keeps within ADR 11.
  test.each([1, 2, 3, 4, 5, 6].flatMap((seed) => L8_CONTROL.map((gate) => [gate, seed] as const)))(
    "%s's solution keeps within 7 nodes and 20 wires and passes for random set %d",
    (gate, seed) => {
      const set = randomSet(seed);
      const levels = withInstructionSet(LEVELS, set);
      const level = circuitAt(index(gate), levels);
      const solution = level.solution!;
      expect(solution.nodes.length).toBeLessThanOrEqual(7);
      expect(solution.wires.length).toBeLessThanOrEqual(20);
      const game = loadLevel(level, partsOf(levels));
      buildSolution(game, level);
      const result = checkLevel(game, index(gate), levels);
      expect(result.forbidden).toEqual([]);
      expect(result.passed).toBe(true);
    },
  );

  test.each(L8_CONTROL)("%s's board for Bitbox's opcodes fails another set", (gate) => {
    const game = loadLevel(circuitAt(index(gate)));
    buildSolution(game, circuitAt(index(gate)));
    const levels = withInstructionSet(LEVELS, randomSet(7));
    expect(checkLevel(game, index(gate), levels).passed).toBe(false);
  });
});

describe("the op encoder", () => {
  test("gives each instruction its OP, 7 for those that don't use the ALU", () => {
    expect(INSTRUCTIONS.map(({ id }) => [id, op(id)])).toEqual(
      INSTRUCTIONS.map(({ id }) => [id, { add: 0, subtract: 1, and: 4, or: 5, xor: 6 }[id as string] ?? 7]),
    );
    expect(opEncoder(BITBOX_INSTRUCTION_SET, [spareOf(BITBOX_INSTRUCTION_SET)])).toEqual([7]);
  });
});

describe("the write encoder", () => {
  test("turns WRITE on for the instructions that write R, and picks its SRC", () => {
    expect(write("copy")).toEqual([1, 0]);
    expect(write("set")).toEqual([1, 1]);
    expect(write("read")).toEqual([1, 2]);
    expect(write("in")).toEqual([1, 2]);
    expect(write("add")).toEqual([1, 3]);
    expect(write("not")).toEqual([1, 3]);
    for (const id of ["halt", "write", "jump", "jump if zero", "out"] as const) expect(write(id)[0]).toBe(0);
    expect(writeEncoder(BITBOX_INSTRUCTION_SET, [spareOf(BITBOX_INSTRUCTION_SET)])[0]).toBe(0);
  });
});

describe("the control unit", () => {
  test("gives STORE, JUMP, IN, OUT and HALT, jumping if zero only while A is 0", () => {
    expect(at("write", 5)).toEqual([1, 0, 0, 0, 0]);
    expect(at("jump", 5)).toEqual([0, 1, 0, 0, 0]);
    expect(at("jump if zero", 0)).toEqual([0, 1, 0, 0, 0]);
    expect(at("jump if zero", 3)).toEqual([0, 0, 0, 0, 0]);
    expect(at("in")).toEqual([0, 0, 1, 0, 0]);
    expect(at("out")).toEqual([0, 0, 0, 1, 0]);
    expect(at("halt")).toEqual([0, 0, 0, 0, 1]);
    expect(at("add", 0)).toEqual([0, 0, 0, 0, 0]);
  });
});
