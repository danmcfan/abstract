import { describe, expect, test } from "bun:test";
import { BITBOX_INSTRUCTION_SET } from "./instruction";
import { LEVELS, levelId, revisionOf } from "./level";
import { memorySave, type SaveStore } from "./save";
import { Session } from "./session";

const L7 = LEVELS.findIndex((level) => level.kind === "instruction set");

// A session open on L7, with every level before it solved.
function atTypingPool(store: SaveStore = memorySave({ solved: {}, open: "NAND", boards: {}, flags: [] })): Session {
  const before = Object.fromEntries(LEVELS.slice(0, L7).map((level) => [levelId(level), revisionOf(level)]));
  store.save({ solved: before, open: "INSTRUCTION SET", boards: {}, flags: [] });
  const session = new Session(store);
  session.resume();
  return session;
}

describe("the instruction set level", () => {
  test("opens on a blank table with nothing to test", () => {
    const session = atTypingPool();
    expect(session.levelIndex).toBe(L7);
    expect(session.instructionSet.add).toBeUndefined();
    expect(session.instructionCheck.good).toBe(0);
    expect(session.beginTest()).toBe(false);
    expect(session.next).toBeNull();
  });

  test("is solved as soon as every row is good, with Bitbox's lines the first time", () => {
    const session = atTypingPool();
    const cue = session.editInstructions(BITBOX_INSTRUCTION_SET);
    expect(cue).toEqual({ say: "solved", level: session.level });
    expect(session.editInstructions({ add: { mnemonic: "PLUS", opcode: 3 } })).toBeNull();
    expect(session.solved).toBe(L7 + 1);
    expect(session.next).toEqual({ to: "end" });
    expect(session.validInstructionSet?.add).toEqual({ mnemonic: "PLUS", opcode: 3 });
  });

  test("keeps typed names in capitals", () => {
    const session = atTypingPool();
    session.editInstructions({ add: { mnemonic: "plus", opcode: 3 } });
    expect(session.instructionSet.add).toEqual({ mnemonic: "PLUS", opcode: 3 });
  });

  test("warns once, the first time a row goes bad", () => {
    const session = atTypingPool();
    expect(session.editInstructions({ add: { mnemonic: "ADD", opcode: 3 } })).toBeNull();
    expect(session.editInstructions({ set: { mnemonic: "ADD", opcode: 1 } })).toEqual({ say: "error" });
    expect(session.editInstructions({ copy: { mnemonic: "ADD", opcode: 2 } })).toBeNull();
  });

  test("an invalid edit after solving keeps the level solved and the last valid table", () => {
    const session = atTypingPool();
    session.editInstructions(BITBOX_INSTRUCTION_SET);
    session.editInstructions({ add: { mnemonic: "SET", opcode: 3 } });
    expect(session.solved).toBe(L7 + 1);
    expect(session.instructionCheck.solved).toBe(false);
    expect(session.validInstructionSet).toEqual(BITBOX_INSTRUCTION_SET);
    expect(session.next).toBeNull();
  });

  test("a change survives a reload, and solving again later only gives a happy face", () => {
    const store = memorySave();
    const session = atTypingPool(store);
    session.introduce();
    session.editInstructions(BITBOX_INSTRUCTION_SET);
    session.editInstructions({ add: { mnemonic: "PLUS", opcode: 15 } });

    const reloaded = new Session(store);
    reloaded.resume();
    expect(reloaded.levelIndex).toBe(L7);
    expect(reloaded.instructionSet.add).toEqual({ mnemonic: "PLUS", opcode: 15 });
    expect(reloaded.validInstructionSet?.add).toEqual({ mnemonic: "PLUS", opcode: 15 });
    expect(reloaded.welcome()).toEqual({ say: "welcome back", level: reloaded.level });
    expect(reloaded.editInstructions({ add: { mnemonic: "ADD", opcode: 4 } })).toEqual({ say: "error" });
    expect(reloaded.editInstructions({ add: { mnemonic: "ADD", opcode: 3 } })).toEqual({ react: "happy" });
  });

  test("changing an opcode keeps every level solved", () => {
    const session = atTypingPool();
    session.editInstructions(BITBOX_INSTRUCTION_SET);
    const solved = session.solved;
    session.editInstructions({ add: { mnemonic: "ADD", opcode: 15 } });
    expect(session.solved).toBe(solved);
  });

  test("starting over blanks the table", () => {
    const session = atTypingPool();
    session.editInstructions(BITBOX_INSTRUCTION_SET);
    session.reset();
    expect(session.instructionSet).toEqual({});
    expect(session.validInstructionSet).toBeNull();
  });
});
