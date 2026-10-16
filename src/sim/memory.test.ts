import { describe, expect, test } from "bun:test";
import { kindOf } from "./kind";
import {
  buildSolution,
  checkLevel,
  floorAbove,
  layerLevels,
  LEVELS,
  loadLevel,
  matches,
  PARTS,
  partsBin,
  truthTable,
  type Row,
  circuitAt,
  levelId,
  type CircuitLevel,
} from "./level";
import type { NodeType, Value } from "./node";

const levelIndex = (type: NodeType): number => LEVELS.findIndex((level) => levelId(level) === type);
const levelOf = (type: NodeType): CircuitLevel => circuitAt(levelIndex(type));

const L5 = [
  "SR LATCH",
  "D LATCH",
  "D FLIP-FLOP",
  "BIT",
  "2-BIT REGISTER",
  "DEMUX4",
  "4-WAY MUX8",
  "2-REGISTER FILE",
  "RAM",
];

// What the level's own part gives on each step of the given timing table,
// wired straight between the level's terminals.
function partPlays(level: CircuitLevel, steps: Row[]): Value[][] {
  if (level.steps === undefined) throw new Error(`${level.gate} has no timing table`);
  const played: CircuitLevel = { ...level, prebuilt: true, steps };
  const levels = LEVELS.map((l) => (l === level ? played : l));
  const index = LEVELS.indexOf(level);
  return checkLevel(loadLevel(played), index, levels).rows.map((row) => row.actual);
}

// The index of the first step a board fails, building the level's solution
// with some wires changed.
function firstFailure(level: CircuitLevel, rewire: (wires: [string, string][]) => [string, string][]): number {
  const solution = level.solution!;
  const changed: CircuitLevel = { ...level, solution: { ...solution, wires: rewire(solution.wires) } };
  const game = loadLevel(changed);
  buildSolution(game, changed);
  const result = checkLevel(game, levelIndex(level.gate));
  expect(result.passed).toBe(false);
  return result.rows.findIndex((row) => !matches(row.actual, row.expected));
}

describe("the L5 levels", () => {
  test("follow the ALU, in order, with RAM last", () => {
    const first = levelIndex("2-BIT ALU") + 1;
    expect(layerLevels(5)).toEqual(L5.map((_, i) => first + i));
    expect(layerLevels(5).map((i) => levelId(LEVELS[i]!))).toEqual(L5);
    expect(floorAbove(levelIndex("2-BIT ALU"))?.floor).toBe("the filing vault");
  });

  test.each(L5)("%s puts its part in the parts bin once solved", (gate) => {
    const part =
      ({ "2-BIT REGISTER": "REGISTER", "2-REGISTER FILE": "REGISTER FILE" } as Record<string, string>)[gate] ?? gate;
    expect(partsBin(levelIndex(gate) + 1)).toContain(part);
    expect(partsBin(levelIndex(gate))).not.toContain(part);
  });

  test("every level but DEMUX4 and the 4-way MUX8 has a timing table, and all but the SR latch a clock", () => {
    const timed = L5.filter((gate) => levelOf(gate).steps !== undefined);
    expect(timed).toEqual(L5.filter((gate) => gate !== "DEMUX4" && gate !== "4-WAY MUX8"));
    expect(timed.filter((gate) => !levelOf(gate).inputs.includes("CLK"))).toEqual(["SR LATCH"]);
  });
});

describe("the SR latch", () => {
  test("S sets Q, R resets it, and with both off Q holds", () => {
    const steps: Row[] = [
      [0, 0],
      [1, 0],
      [0, 0],
      [0, 1],
      [0, 0],
    ].map((inputs) => ({ inputs, expected: [0] }));
    expect(partPlays(levelOf("SR LATCH"), steps)).toEqual([[0], [1], [1], [0], [0]]);
  });

  test("its timing table never turns S and R on together", () => {
    expect(levelOf("SR LATCH").steps!.some(({ inputs: [s, r] }) => s === 1 && r === 1)).toBe(false);
  });
});

describe("the D latch", () => {
  test("Q follows D while CLK is on, and holds while it's off", () => {
    const steps: Row[] = [
      [1, 0],
      [1, 1],
      [0, 1],
      [1, 1],
      [0, 0],
      [1, 0],
    ].map((inputs) => ({ inputs, expected: [0] }));
    expect(partPlays(levelOf("D LATCH"), steps)).toEqual([[0], [1], [0], [1], [1], [1]]);
  });
});

describe("the D flip-flop", () => {
  test("Q takes D only when CLK turns on, and ignores D while CLK stays on", () => {
    const steps: Row[] = [
      { inputs: [1, 0], expected: [] },
      { inputs: [1, 1], expected: [] },
      { inputs: [0, 1], expected: [] },
      { inputs: [0, 0], expected: [] },
      { inputs: [0, 0], tick: true, expected: [] },
    ];
    expect(partPlays(levelOf("D FLIP-FLOP"), steps)).toEqual([[0], [1], [1], [1], [0]]);
  });

  test("built as one D latch, it fails where D changes while CLK stays on", () => {
    const level = levelOf("D FLIP-FLOP");
    const latch: [string, string][] = [
      ["D", "second:0"],
      ["CLK", "second:1"],
      ["second", "Q"],
    ];
    expect(firstFailure(level, () => latch)).toBe(4);
    expect(level.steps![4]).toEqual({ inputs: [1, 1], expected: [0] });
  });
});

describe("the bit and the register", () => {
  test("the bit holds through a tick with LOAD off", () => {
    const steps: Row[] = [
      { inputs: [0, 1, 1], tick: true, expected: [] },
      { inputs: [0, 0, 0], tick: true, expected: [] },
      { inputs: [0, 1, 0], expected: [] },
      { inputs: [0, 1, 0], tick: true, expected: [] },
    ];
    expect(partPlays(levelOf("BIT"), steps)).toEqual([[1], [1], [1], [0]]);
  });

  test("the bit's timing table ticks with LOAD off", () => {
    expect(levelOf("BIT").steps!.some((step) => step.tick === true && step.inputs[1] === 0)).toBe(true);
  });

  test("the 2-bit register gives the register: CLK, LOAD and D[8] in, Q[8] out", () => {
    const register = kindOf(PARTS, "REGISTER");
    expect([0, 1, 2].map((i) => register.pinWidth("in", i, 1))).toEqual([1, 1, 8]);
    expect(register.pinWidth("out", 0, 1)).toBe(8);
    let state = register.next!([0, 1, 200], []);
    state = register.next!([1, 1, 200], state);
    state = register.next!([0, 0, 7], state);
    state = register.next!([1, 0, 7], state);
    expect(register.evaluate([1, 0, 7], 1, state)).toEqual([200]);
  });
});

describe("DEMUX4", () => {
  test("sends IN to the output SEL numbers, and keeps the rest off", () => {
    expect(truthTable(levelOf("DEMUX4"))).toEqual([
      { inputs: [0, 0], expected: [0, 0, 0, 0] },
      { inputs: [0, 1], expected: [0, 0, 0, 0] },
      { inputs: [0, 2], expected: [0, 0, 0, 0] },
      { inputs: [0, 3], expected: [0, 0, 0, 0] },
      { inputs: [1, 0], expected: [1, 0, 0, 0] },
      { inputs: [1, 1], expected: [0, 1, 0, 0] },
      { inputs: [1, 2], expected: [0, 0, 1, 0] },
      { inputs: [1, 3], expected: [0, 0, 0, 1] },
    ]);
  });
});

describe("the 4-way MUX8", () => {
  test("gives all 8 signals of the input SEL numbers", () => {
    const mux = kindOf(PARTS, "4-WAY MUX8");
    expect([0, 1, 2, 3].map((sel) => mux.evaluate([10, 20, 30, 255, sel], 1))).toEqual([[10], [20], [30], [255]]);
  });
});

const FILE = levelOf("2-REGISTER FILE");

describe("the register file", () => {
  test("the 2-register file gives the 4-register REGISTER FILE", () => {
    expect(FILE.gives).toMatchObject({ gate: "REGISTER FILE", widths: { WSEL: 2, ASEL: 2, BSEL: 2, DIN: 8 } });
    expect(FILE.widths).toMatchObject({ DIN: 8, A: 8, B: 8 });
    expect(FILE.widths).not.toHaveProperty("WSEL");
  });

  test("shows a register's old value on A until the tick that writes it", () => {
    const steps: Row[] = [
      { inputs: [0, 1, 1, 77, 1, 1], expected: [] },
      { inputs: [1, 1, 1, 77, 1, 1], expected: [] },
      { inputs: [0, 1, 0, 9, 1, 0], tick: true, expected: [] },
      { inputs: [0, 0, 0, 1, 0, 1], tick: true, expected: [] },
    ];
    expect(partPlays(FILE, steps)).toEqual([
      [0, 0],
      [77, 77],
      [77, 9],
      [9, 77],
    ]);
  });

  test("its timing table writes every register a different value, and shows the same register on A and B", () => {
    const writes = FILE.steps!.filter((step) => step.tick === true && step.inputs[1] === 1);
    expect(new Set(writes.map((step) => step.inputs[2])).size).toBe(2);
    expect(new Set(writes.map((step) => step.inputs[3])).size).toBe(writes.length);
    expect(FILE.steps!.some(({ inputs: [, , , , a, b] }) => a === b)).toBe(true);
  });

  test("with ASEL and BSEL swapped, it fails at the first step that reads two different registers", () => {
    const swapped: Record<string, string> = { ASEL: "BSEL", BSEL: "ASEL" };
    expect(firstFailure(FILE, (wires) => wires.map(([from, to]) => [swapped[from] ?? from, to]))).toBe(2);
  });
});

const RAM = levelOf("RAM");

describe("the RAM", () => {
  test("keeps 8 places of 8 signals, and DOUT shows place ADDR", () => {
    const values = [200, 1, 2, 3, 4, 5, 6, 255];
    const steps: Row[] = [
      ...values.map((value, addr) => ({ inputs: [0, 1, addr, value], tick: true, expected: [] })),
      { inputs: [0, 0, 5, 99], tick: true, expected: [] },
      ...values.map((_, addr) => ({ inputs: [0, 0, addr, 0], expected: [] })),
    ];
    expect(partPlays(RAM, steps).slice(8)).toEqual([[5], ...values.map((value) => [value])]);
  });

  test("its timing table writes a different value to every place, then reads them all back", () => {
    const writes = RAM.steps!.filter((step) => step.tick === true && step.inputs[1] === 1);
    const reads = RAM.steps!.filter((step) => step.tick !== true);
    expect(writes.map((step) => step.inputs[2])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(writes.map((step) => step.inputs[3])).size).toBe(8);
    expect(reads.map((step) => step.inputs[2])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test("ignoring ADDR's top signal, it fails at the first read", () => {
    expect(firstFailure(RAM, (wires) => wires.filter(([from]) => from !== "addr:0"))).toBe(8);
  });
});
