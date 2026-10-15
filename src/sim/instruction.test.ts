import { describe, expect, test } from "bun:test";
import { BITBOX_INSTRUCTION_SET, checkInstructionSet, type InstructionSet } from "./instruction";

const edited = (changes: Partial<InstructionSet>): InstructionSet => ({ ...BITBOX_INSTRUCTION_SET, ...changes });

describe("checkInstructionSet", () => {
  test("accepts Bitbox's table, leaving opcode 15 spare", () => {
    const check = checkInstructionSet(BITBOX_INSTRUCTION_SET);
    expect(check.solved).toBe(true);
    expect(check.good).toBe(15);
    expect(check.spare).toEqual([15]);
    expect(Object.values(check.rows).every((row) => row.mnemonic === null && row.opcode === null)).toBe(true);
  });

  test("marks both rows of a mnemonic used twice", () => {
    const check = checkInstructionSet(edited({ add: { mnemonic: "SET", opcode: 3 } }));
    expect(check.solved).toBe(false);
    expect(check.rows.add.mnemonic).toBe("used twice");
    expect(check.rows.set.mnemonic).toBe("used twice");
    expect(check.good).toBe(13);
  });

  test("marks both rows of an opcode used twice", () => {
    const check = checkInstructionSet(edited({ add: { mnemonic: "ADD", opcode: 1 } }));
    expect(check.rows.add.opcode).toBe("used twice");
    expect(check.rows.set.opcode).toBe("used twice");
    expect(check.spare).toEqual([3, 15]);
    expect(check.solved).toBe(false);
  });

  test("rejects names with anything but letters", () => {
    expect(checkInstructionSet(edited({ add: { mnemonic: "ADD2", opcode: 3 } })).rows.add.mnemonic).toBe(
      "letters only",
    );
  });

  test("rejects names over six letters", () => {
    expect(checkInstructionSet(edited({ add: { mnemonic: "ADDITION", opcode: 3 } })).rows.add.mnemonic).toBe(
      "too long",
    );
  });

  test("needs every name and number", () => {
    const check = checkInstructionSet(edited({ add: { mnemonic: "", opcode: null } }));
    expect(check.rows.add).toEqual({ mnemonic: "needed", opcode: "needed", blank: true });
    expect(check.solved).toBe(false);
  });

  test("reads names in any case as the same name", () => {
    expect(checkInstructionSet(edited({ add: { mnemonic: "set", opcode: 3 } })).rows.add.mnemonic).toBe("used twice");
  });
});
