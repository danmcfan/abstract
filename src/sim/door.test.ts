import { describe, expect, test } from "bun:test";
import { assembleProgram } from "./assembler";
import { DoorRun, referenceDoorProgram } from "./door";
import { REVERSED } from "./fixtures";
import { BITBOX_INSTRUCTION_SET, type InstructionSet } from "./instruction";

// Runs a program to its end with a name on the keypad.
function run(text: string, name: string, set: InstructionSet = BITBOX_INSTRUCTION_SET): DoorRun {
  const { words, errors } = assembleProgram(set, text);
  expect(errors).toEqual([]);
  const door = new DoorRun(set, words, name);
  while (door.outcome === "running" && door.ticks < 10_000) door.tick();
  return door;
}

describe("the door program", () => {
  test.each([
    ["Bitbox's", BITBOX_INSTRUCTION_SET],
    ["a reversed", REVERSED],
  ])("the reference program, in %s instruction set, opens the door for TURING", (_, set) => {
    const door = run(referenceDoorProgram(set), "TURING", set);
    expect(door.sent).toBe(217);
    expect(door.outcome).toBe("open");
  });

  test("any other name keeps the door shut and stops the program", () => {
    const door = run(referenceDoorProgram(BITBOX_INSTRUCTION_SET), "ENIGMA");
    expect(door.sent).toBe(177);
    expect(door.outcome).toBe("shut");
  });

  test("a program that halts without sending leaves the door shut", () => {
    expect(run("SET R0, 217\nHALT", "TURING").outcome).toBe("halted");
  });

  test("the keypad gives each letter in ASCII, then 0; the door gives 0", () => {
    const door = run("IN R0, KEYPAD\nIN R1, KEYPAD\nIN R2, KEYPAD\nSET R3, 9\nIN R3, DOOR\nHALT", "HI");
    expect(door.registers).toEqual([72, 73, 0, 0]);
  });

  test("each tick is half an instruction: fetch, then execute", () => {
    const { words } = assembleProgram(BITBOX_INSTRUCTION_SET, "SET R1, 5\nHALT");
    const door = new DoorRun(BITBOX_INSTRUCTION_SET, words, "");
    expect([door.programCounter, door.doing]).toEqual([0, null]);
    door.tick();
    expect([door.programCounter, door.doing, door.registers[1]]).toEqual([1, "SET R1, 5", 5]);
    door.tick();
    expect([door.programCounter, door.doing, door.ticks]).toEqual([1, "SET R1, 5", 2]);
  });
});
