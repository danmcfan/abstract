import { describe, expect, test } from "bun:test";
import { REVERSED } from "./fixtures";
import { BITBOX_INSTRUCTION_SET, type InstructionSet } from "./instruction";
import { describeInstruction, encode, executeUnit, runOnSpec, type Instruction } from "./cpu";
import { TEST_PROGRAMS } from "./level";
import type { State, Value } from "./node";

describe("the encoder", () => {
  test("puts the opcode high, then the two registers, then the number", () => {
    // Bitbox's set numbers add 3 and out 14.
    expect(encode(BITBOX_INSTRUCTION_SET, { op: "add", r: 1, s: 2 })).toEqual([0x36, 0]);
    expect(encode(BITBOX_INSTRUCTION_SET, { op: "out", r: 3, n: 1 })).toEqual([0xec, 1]);
    expect(encode(BITBOX_INSTRUCTION_SET, { op: "halt" })).toEqual([0, 0]);
  });
});

// Runs instructions on the execute unit's spec, one tick each, from all 0,
// giving its outputs after each: JUMP, ADDR, OUT, DOUT, DEV, IN, HALT.
function execute(set: InstructionSet, program: (Instruction & { din?: Value })[]): Value[][] {
  const unit = executeUnit(set);
  let state: State = [];
  return program.map((instruction) => {
    const [i, n] = encode(set, instruction);
    const inputs = (clk: Value): Value[] => [clk, i, n, instruction.din ?? 0];
    state = unit.next(inputs(1), unit.next(inputs(0), state));
    state = unit.next(inputs(0), state);
    return unit.outputs(state, inputs(0));
  });
}

const r1 = (value: Value): Instruction => ({ op: "set", r: 1, n: value });
const r2 = (value: Value): Instruction => ({ op: "set", r: 2, n: value });

describe.each([
  ["Bitbox's", BITBOX_INSTRUCTION_SET],
  ["a reversed", REVERSED],
])("the execute unit, with %s instruction set", (_, set) => {
  const outs = (program: (Instruction & { din?: Value })[]): Value[][] => execute(set, program);
  const last = (program: (Instruction & { din?: Value })[]): Value[] => outs(program).at(-1) ?? [];

  test("set puts n in R, and DOUT shows R", () => {
    expect(last([r1(5)])).toEqual([0, 5, 0, 5, 5, 0, 0]);
  });
  test.each([
    ["copy", [r2(7), { op: "copy", r: 1, s: 2 }], 7],
    ["add wraps at 256", [r1(200), r2(100), { op: "add", r: 1, s: 2 }], 44],
    ["subtract wraps below 0", [r1(3), r2(5), { op: "subtract", r: 1, s: 2 }], 254],
    ["and", [r1(12), r2(10), { op: "and", r: 1, s: 2 }], 8],
    ["or", [r1(12), r2(10), { op: "or", r: 1, s: 2 }], 14],
    ["xor", [r1(12), r2(10), { op: "xor", r: 1, s: 2 }], 6],
    ["not", [r1(12), { op: "not", r: 1 }], 243],
  ] satisfies [string, Instruction[], Value][])("%s leaves R as expected", (_name, program, value) => {
    expect(last(program)[3]).toBe(value);
  });
  test("write, then read back into another register", () => {
    expect(last([r1(42), { op: "write", r: 1, n: 6 }, { op: "read", r: 3, n: 5 }])[3]).toBe(0);
    expect(last([r1(42), { op: "write", r: 1, n: 6 }, { op: "read", r: 3, n: 6 }])[3]).toBe(42);
  });
  test("jump is on, with its address", () => {
    expect(last([{ op: "jump", n: 9 }])).toEqual([1, 9, 0, 0, 9, 0, 0]);
  });
  test("jump if zero jumps only when R is 0", () => {
    expect(last([{ op: "jump if zero", r: 1, n: 9 }]).slice(0, 2)).toEqual([1, 9]);
    expect(last([r1(1), { op: "jump if zero", r: 1, n: 9 }]).slice(0, 2)).toEqual([0, 9]);
  });
  test("in takes DIN into R and says so", () => {
    expect(last([{ op: "in", r: 2, n: 2, din: 77 }])).toEqual([0, 2, 0, 77, 2, 1, 0]);
  });
  test("out sends R to device d", () => {
    expect(last([r1(8), { op: "out", r: 1, n: 1 }])).toEqual([0, 1, 1, 8, 1, 0, 0]);
  });
  test("halt says so, and changes nothing", () => {
    expect(outs([r1(8), { op: "halt" }, { op: "out", r: 1, n: 1 }])).toEqual([
      [0, 8, 0, 8, 8, 0, 0],
      [0, 0, 0, 0, 0, 0, 1],
      [0, 1, 1, 8, 1, 0, 0],
    ]);
  });
});

describe.each([
  ["Bitbox's", BITBOX_INSTRUCTION_SET],
  ["a reversed", REVERSED],
])("the CPU, with %s instruction set", (_, set) => {
  const run = (program: Instruction[], device: Value[] = [], limit = 1000): ReturnType<typeof runOnSpec> =>
    runOnSpec(set, program, device, limit);

  test("runs a countdown loop and stops at HALT", () => {
    expect(run(TEST_PROGRAMS[0]?.program ?? [])).toEqual({ outs: [3, 2, 1], halted: true });
  });

  test("reads the device until it gives 0", () => {
    const sum: Instruction[] = [
      { op: "in", r: 1, n: 2 },
      { op: "jump if zero", r: 1, n: 4 },
      { op: "add", r: 0, s: 1 },
      { op: "jump", n: 0 },
      { op: "out", r: 0, n: 1 },
      { op: "halt" },
    ];
    expect(run(sum, [4, 9, 2, 0])).toEqual({ outs: [15], halted: true });
  });

  test("a program that never halts runs out of ticks", () => {
    expect(
      run(
        [
          { op: "out", r: 0, n: 1 },
          { op: "jump", n: 0 },
        ],
        [],
        20,
      ),
    ).toEqual({
      outs: [0, 0, 0, 0, 0],
      halted: false,
    });
  });
});

const words = (instruction: Instruction): string => describeInstruction(REVERSED, ...encode(REVERSED, instruction));

describe("an instruction written out", () => {
  test("names it with the player's mnemonic, then its operands", () => {
    expect(words({ op: "set", r: 1, n: 5 })).toBe("XB R1, 5");
    expect(words({ op: "copy", r: 0, s: 3 })).toBe("XC R0, R3");
    expect(words({ op: "not", r: 2 })).toBe("XI R2");
    expect(words({ op: "jump", n: 7 })).toBe("XL 7");
    expect(words({ op: "out", r: 2, n: 1 })).toBe("XO R2, DOOR");
    expect(words({ op: "in", r: 2, n: 2 })).toBe("XN R2, KEYPAD");
    expect(words({ op: "halt" })).toBe("XA");
    expect(describeInstruction(REVERSED, 0, 0)).toBe("opcode 0, spare");
  });
});
