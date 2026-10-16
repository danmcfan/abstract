import { describe, expect, test } from "bun:test";
import { assembleProgram } from "./assembler";
import { assemble } from "./cpu";
import { REVERSED } from "./fixtures";
import { BITBOX_INSTRUCTION_SET } from "./instruction";

const errors = (text: string): { line: number; problem: string }[] =>
  assembleProgram(BITBOX_INSTRUCTION_SET, text).errors;

describe("the assembler", () => {
  test("turns each line into an instruction in the player's set", () => {
    const { words, errors: found } = assembleProgram(REVERSED, "xb r1, 217\nXD R1, R2\nxa");
    expect(found).toEqual([]);
    expect(words).toEqual(assemble(REVERSED, [{ op: "set", r: 1, n: 217 }, { op: "add", r: 1, s: 2 }, { op: "halt" }]));
  });

  test("skips comments and blank lines, and reads hex", () => {
    const text = "; the door\n\n  SET R0, 0x1f ; 31\n   \nHALT";
    expect(assembleProgram(BITBOX_INSTRUCTION_SET, text)).toEqual({
      words: assemble(BITBOX_INSTRUCTION_SET, [{ op: "set", r: 0, n: 31 }, { op: "halt" }]),
      errors: [],
    });
  });

  test("jumps to labels, before or after the jump, and names devices", () => {
    const text = ["top: IN R1, KEYPAD", "JZ R1, done", "JMP top", "done:", "OUT R0, door"].join("\n");
    expect(assembleProgram(BITBOX_INSTRUCTION_SET, text).words).toEqual(
      assemble(BITBOX_INSTRUCTION_SET, [
        { op: "in", r: 1, n: 2 },
        { op: "jump if zero", r: 1, n: 3 },
        { op: "jump", n: 0 },
        { op: "out", r: 0, n: 1 },
      ]),
    );
  });

  test("marks each line with a mistake, by its line number", () => {
    expect(errors("PLUS R1, R2")).toEqual([{ line: 1, problem: "PLUS isn't in your instruction set." }]);
    expect(errors("SET R0, 1\nADD R1, R4")).toEqual([{ line: 2, problem: "R4 isn't a register: use R0 to R3." }]);
    expect(errors("ADD R1")).toEqual([{ line: 1, problem: "ADD takes 2 operands: R, S." }]);
    expect(errors("HALT R1")).toEqual([{ line: 1, problem: "HALT takes no operands." }]);
    expect(errors("JMP nowhere")).toEqual([{ line: 1, problem: "There's no label called nowhere." }]);
    expect(errors("SET R0, 256")).toEqual([{ line: 1, problem: "256 isn't a number from 0 to 255." }]);
    expect(errors("OUT R0, LAMP")).toEqual([{ line: 1, problem: "LAMP isn't a device: use DOOR or KEYPAD." }]);
    expect(errors("a: HALT\na: HALT")).toEqual([{ line: 2, problem: "The label a is used twice." }]);
  });

  test("refuses a program longer than program memory", () => {
    const text = Array.from({ length: 257 }, () => "HALT").join("\n");
    expect(errors(text)).toEqual([{ line: 257, problem: "Program memory holds only 256 instructions." }]);
  });

  test("refuses a label past the end of program memory", () => {
    const text = ["JMP end", ...Array.from({ length: 255 }, () => "HALT"), "end:"].join("\n");
    expect(errors(text)).toEqual([{ line: 257, problem: "The label end is past the end of program memory." }]);
  });
});
