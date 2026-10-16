import { describe, expect, test } from "bun:test";
import { kindOf } from "./kind";
import { placeNode, restart, setInputs, terminalNamed, tick, wire } from "./circuit";
import {
  buildSolution,
  PARTS,
  checkLevel,
  floorAbove,
  layerLevels,
  LEVELS,
  loadLevel,
  partsBin,
  truthTable,
  wiring,
  circuitAt,
  levelId,
  type CircuitLevel,
} from "./level";
import type { NodeType, Value } from "./node";

const levelIndex = (type: NodeType): number => LEVELS.findIndex((level) => levelId(level) === type);
const levelOf = (type: NodeType): CircuitLevel => circuitAt(levelIndex(type));

const wiringOf = (gate: NodeType): NodeType[] => wiring(levelOf(gate)).map((w) => w.type);

const L6 = ["PROGRAM COUNTER", "3-TO-8 DECODER", "4-BIT ZERO TEST", "NONE", "SEQUENCER", "STEPPER"];

// The level's own part, wired straight between its terminals, ticked with
// the given inputs (CLK left off) and read after each tick.
function ticks(gate: NodeType, inputs: Value[][]): Value[][] {
  const level = levelOf(gate);
  const game = loadLevel({ ...level, prebuilt: true });
  const clock = terminalNamed(game, "input", "CLK")!.id;
  const lamps = level.outputs.map((label) => terminalNamed(game, "output", label)!);
  const switches = level.inputs.map((label) => terminalNamed(game, "input", label)!.id);
  return inputs.map((values) => {
    setInputs(game, new Map(switches.flatMap((id, i) => (id === clock ? [] : [[id, values[i] ?? 0] as const]))));
    tick(game, clock);
    return lamps.map((lamp) => [...game.edges.values()].find((edge) => edge.to === lamp.id)!.value);
  });
}

describe("the L6 levels", () => {
  test("follow RAM, in order, with the stepper last", () => {
    const first = levelIndex("RAM") + 1;
    expect(layerLevels(6).map((i) => levelId(LEVELS[i]!))).toEqual(L6);
    expect(layerLevels(6)[0]).toBe(first);
    expect(floorAbove(levelIndex("RAM"))?.floor).toBe("the clock tower");
  });

  test.each(L6.filter((gate) => gate !== "4-BIT ZERO TEST" && gate !== "3-TO-8 DECODER"))(
    "%s puts its part in the parts bin once solved",
    (gate) => {
      expect(partsBin(levelIndex(gate) + 1)).toContain(gate);
      expect(partsBin(levelIndex(gate))).not.toContain(gate);
    },
  );

  test("the program counter, the sequencer and the stepper have timing tables, and the rest truth tables", () => {
    expect(L6.filter((gate) => levelOf(gate).steps !== undefined)).toEqual(["PROGRAM COUNTER", "SEQUENCER", "STEPPER"]);
  });
});

describe("the constant node", () => {
  test("is in the Wiring section from L6 on, and not before", () => {
    expect(wiringOf("RAM")).not.toContain("ON");
    for (const gate of L6) expect(wiringOf(gate)).toContain("ON");
    for (const gate of L6) expect(wiringOf(gate)).toContain("OFF");
  });

  test("doesn't fail the parts-bin rule", () => {
    const index = levelIndex("SEQUENCER");
    const game = loadLevel(levelOf("SEQUENCER"));
    placeNode(game, "ON", { x: 20, y: 10 });
    placeNode(game, "OFF", { x: 20, y: 30 });
    expect(checkLevel(game, index).forbidden).toEqual([]);
  });

  test("ON always gives 1 and OFF always 0", () => {
    const game = loadLevel(levelOf("SEQUENCER"));
    const on = placeNode(game, "ON", { x: 20, y: 10 })!;
    const off = placeNode(game, "OFF", { x: 20, y: 30 })!;
    restart(game);
    expect(on.signals).toEqual([1]);
    expect(off.signals).toEqual([0]);
  });
});

describe("the program counter", () => {
  test("counts 0, 1, 2 from 0, one a tick", () => {
    expect(
      ticks("PROGRAM COUNTER", [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toEqual([[1], [2], [3]]);
  });

  test("takes ADDR on a tick with LOAD on, and counts on from there", () => {
    expect(
      ticks("PROGRAM COUNTER", [
        [0, 1, 200],
        [0, 0, 7],
        [0, 0, 7],
      ]),
    ).toEqual([[200], [201], [202]]);
  });

  test("wraps from 255 to 0", () => {
    expect(
      ticks("PROGRAM COUNTER", [
        [0, 1, 255],
        [0, 0, 0],
      ]),
    ).toEqual([[255], [0]]);
  });

  test("its timing table loads and wraps", () => {
    const steps = levelOf("PROGRAM COUNTER").steps!;
    expect(steps.some((step) => step.inputs[1] === 1 && step.tick === true)).toBe(true);
    expect(steps.some((step) => step.expected[0] === 0 && step.tick === true && step.inputs[1] === 0)).toBe(true);
  });
});

describe("the 3-to-8 decoder", () => {
  test("turns on only D's signal S numbers", () => {
    expect(truthTable(levelOf("3-TO-8 DECODER")).map((row) => row.expected)).toEqual([
      [0b00000001],
      [0b00000010],
      [0b00000100],
      [0b00001000],
      [0b00010000],
      [0b00100000],
      [0b01000000],
      [0b10000000],
    ]);
  });

  test("gives the 4-to-16 decoder, not its own 3-to-8 one", () => {
    const index = levelIndex("3-TO-8 DECODER");
    expect(partsBin(index + 1)).toContain("4-TO-16 DECODER");
    expect(partsBin(index + 1)).not.toContain("3-TO-8 DECODER");
  });

  test("the part it gives has exactly one of its 16 signals on, the one S numbers", () => {
    const decoder = kindOf(PARTS, "4-TO-16 DECODER");
    for (let s = 0; s < 16; s++) {
      const [lo = 0, hi = 0] = decoder.evaluate([s], 1);
      expect(lo | (hi << 8)).toBe(2 ** s);
    }
  });
});

test("the 2-to-4 decoder is no longer a level", () => {
  expect(levelIndex("2-TO-4 DECODER")).toBe(-1);
});

describe("none", () => {
  test("turns OUT on only when all of A to H are off", () => {
    const rows = truthTable(levelOf("NONE"));
    expect(levelOf("NONE").inputs).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(rows).toHaveLength(256);
    expect(rows.filter((row) => row.expected[0] === 1).map((row) => row.inputs)).toEqual([[0, 0, 0, 0, 0, 0, 0, 0]]);
  });

  test("comes straight after the 4-bit zero test", () => {
    expect(levelIndex("NONE")).toBe(levelIndex("4-BIT ZERO TEST") + 1);
  });
});

describe("the zero test", () => {
  test("turns ZERO on only when every signal of a 4-signal A is off", () => {
    const rows = truthTable(levelOf("4-BIT ZERO TEST"));
    expect(rows).toHaveLength(16);
    for (const [a, { expected }] of rows.entries()) expect(expected).toEqual([a === 0 ? 1 : 0]);
  });

  test("gives the 8-signal zero test, not its own 4-signal one", () => {
    const index = levelIndex("4-BIT ZERO TEST");
    expect(partsBin(index + 1)).toContain("ZERO TEST");
    expect(partsBin(index + 1)).not.toContain("4-BIT ZERO TEST");
    expect(partsBin(index)).not.toContain("ZERO TEST");
  });

  test("the part it gives tests all 8 signals of A", () => {
    const zero = kindOf(PARTS, "ZERO TEST");
    expect(zero.evaluate([0], 1)).toEqual([1]);
    expect(zero.evaluate([128], 1)).toEqual([0]);
    expect(zero.evaluate([16], 1)).toEqual([0]);
  });
});

describe("the sequencer", () => {
  test("gives off, on, off, on over four ticks", () => {
    expect(ticks("SEQUENCER", [[0], [0], [0], [0]])).toEqual([[1], [0], [1], [0]]);
  });

  test("starts off, and its timing table goes off, on, off, on", () => {
    const steps = levelOf("SEQUENCER").steps!;
    expect(steps.map((step) => step.expected[0])).toEqual([0, 1, 0, 1, 0]);
  });

  test("is off again at the start of every test run", () => {
    const level = levelOf("SEQUENCER");
    const game = loadLevel(level);
    buildSolution(game, level);
    tick(game, terminalNamed(game, "input", "CLK")!.id);
    expect(terminalNamed(game, "output", "EXEC")!.isHigh).toBe(true);
    const index = levelIndex("SEQUENCER");
    expect(checkLevel(game, index).passed).toBe(true);
    expect(checkLevel(game, index).rows[0]!.actual).toEqual([0]);
  });
});

describe("the stepper", () => {
  test("comes straight after the sequencer", () => {
    expect(levelIndex("STEPPER")).toBe(levelIndex("SEQUENCER") + 1);
  });

  test("toggles like the sequencer while HALT is off", () => {
    expect(
      ticks("STEPPER", [
        [0, 0],
        [0, 0],
        [0, 0],
      ]),
    ).toEqual([[1], [0], [1]]);
  });

  test("still toggles when HALT is on during fetch, then holds on execute", () => {
    expect(
      ticks("STEPPER", [
        [0, 1],
        [0, 1],
        [0, 1],
      ]),
    ).toEqual([[1], [1], [1]]);
    expect(
      ticks("STEPPER", [
        [0, 0],
        [0, 1],
        [0, 1],
        [0, 1],
      ]),
    ).toEqual([[1], [1], [1], [1]]);
  });

  test("its timing table toggles, then holds once HALT is on while EXEC is on", () => {
    const steps = levelOf("STEPPER").steps!;
    expect(steps.map((step) => step.expected[0])).toEqual([0, 1, 0, 1, 1, 1]);
    expect(steps.map((step) => step.inputs[1])).toEqual([0, 0, 0, 1, 1, 1]);
  });
});

test("a NOT fed back into a flip-flop is a sequencer", () => {
  const level = levelOf("SEQUENCER");
  const game = loadLevel(level);
  const ff = placeNode(game, "D FLIP-FLOP", { x: 24, y: 20 })!.id;
  const not = placeNode(game, "NOT", { x: 14, y: 30 })!.id;
  const clk = terminalNamed(game, "input", "CLK")!.id;
  const exec = terminalNamed(game, "output", "EXEC")!.id;
  wire(game, { node: ff, side: "out", index: 0 }, { node: not, side: "in", index: 0 });
  wire(game, { node: not, side: "out", index: 0 }, { node: ff, side: "in", index: 0 });
  wire(game, { node: clk, side: "out", index: 0 }, { node: ff, side: "in", index: 1 });
  wire(game, { node: ff, side: "out", index: 0 }, { node: exec, side: "in", index: 0 });
  expect(checkLevel(game, levelIndex("SEQUENCER")).passed).toBe(true);
});
