import { describe, expect, test } from "bun:test";
import { control, encode, fields, registerUnit, type Instruction } from "./cpu";
import { randomSet } from "./fixtures";
import { BITBOX_INSTRUCTION_SET } from "./instruction";
import {
  buildSolution,
  checkLevel,
  circuitAt,
  levelId,
  LEVELS,
  loadLevel,
  partsOf,
  revisionOf,
  withInstructionSet,
} from "./level";
import type { NodeType, State, Value } from "./node";

const L8_DATA = ["INSTRUCTION REGISTER", "REGISTER UNIT", "EXECUTE UNIT"];
// Each level's nodes and wires, counted by hand: ADR 11 allows 7 and 20.
const SIZES: Record<string, [nodes: number, wires: number]> = {
  "INSTRUCTION REGISTER": [5, 15],
  "REGISTER UNIT": [6, 20],
  "EXECUTE UNIT": [3, 19],
};
const index = (gate: NodeType): number => LEVELS.findIndex((level) => levelId(level) === gate);

// Ticks a memory part once with its inputs, from its state.
const tick = (memory: { next: (inputs: Value[], state: State) => State }, inputs: Value[], state: State): State =>
  memory.next([0, ...inputs.slice(1)], memory.next([1, ...inputs.slice(1)], state));

describe("the L8 data levels", () => {
  test("follow the control unit, the execute unit last", () => {
    const first = index("INSTRUCTION REGISTER");
    expect(levelId(LEVELS[first - 1]!)).toBe("CONTROL UNIT");
    expect(LEVELS.slice(first, first + 3).map((level) => levelId(level))).toEqual(L8_DATA);
  });

  test("the execute unit's new terminals bump its revision", () => {
    expect(revisionOf(LEVELS[index("EXECUTE UNIT")]!)).toBe(2);
  });

  test("the briefs say how D splits and which of N's signals RAM uses", () => {
    expect(circuitAt(index("INSTRUCTION REGISTER")).goal).toContain("top 4 signals");
    expect(circuitAt(index("EXECUTE UNIT")).goal).toContain("low 3 signals");
  });

  // Every valid instruction set, not only Bitbox's, keeps within ADR 11.
  test.each([1, 2, 3, 4, 5, 6].flatMap((seed) => L8_DATA.map((gate) => [gate, seed] as const)))(
    "%s's solution has its hand-counted size and passes for random set %d",
    (gate, seed) => {
      const levels = withInstructionSet(LEVELS, randomSet(seed));
      const level = circuitAt(index(gate), levels);
      const solution = level.solution!;
      expect([solution.nodes.length, solution.wires.length]).toEqual(SIZES[gate]!);
      const game = loadLevel(level, partsOf(levels));
      buildSolution(game, level);
      const result = checkLevel(game, index(gate), levels);
      expect(result.forbidden).toEqual([]);
      expect(result.passed).toBe(true);
    },
  );
});

describe("the instruction register", () => {
  const { memory } = circuitAt(index("INSTRUCTION REGISTER"));

  test("takes D on a tick with LOAD on, as OPCODE, R and S", () => {
    const state = tick(memory!, [0, 1, 0b1011_01_10], []);
    expect(memory!.outputs(state, [])).toEqual([11, 1, 2]);
    expect(memory!.outputs(tick(memory!, [0, 0, 0], state), [])).toEqual([11, 1, 2]);
  });
});

// CLK, OPCODE, R, S, N, RAM, DIN and IN for an instruction.
const inputs = ({ op, r = 0, s = 0, n = 0 }: Instruction, ram = 0, din = 0): Value[] => {
  const { opcode } = fields(encode(BITBOX_INSTRUCTION_SET, { op, r, s, n })[0]);
  return [0, opcode, r, s, n, ram, din, control(BITBOX_INSTRUCTION_SET, [opcode])[2] ?? 0];
};
describe("the register unit", () => {
  const unit = registerUnit(BITBOX_INSTRUCTION_SET);
  const run = (steps: Value[][]): State => steps.reduce((state, step) => tick(unit, step, state), [] as State);
  const a = (state: State, r: number): Value => unit.outputs(state, [0, 0, r])[0] ?? 0;

  test("set puts N in register R, and A shows it", () => {
    expect(a(run([inputs({ op: "set", r: 1, n: 5 })]), 1)).toBe(5);
  });
  test("read takes RAM, and in takes DIN", () => {
    expect(a(run([inputs({ op: "read", r: 2 }, 33, 44)]), 2)).toBe(33);
    expect(a(run([inputs({ op: "in", r: 2 }, 33, 44)]), 2)).toBe(44);
  });
  test("add takes the ALU's result, and write changes no register", () => {
    const state = run([
      inputs({ op: "set", r: 1, n: 5 }),
      inputs({ op: "set", r: 2, n: 3 }),
      inputs({ op: "add", r: 1, s: 2 }),
      inputs({ op: "write", r: 1 }),
    ]);
    expect(a(state, 1)).toBe(8);
  });
});
