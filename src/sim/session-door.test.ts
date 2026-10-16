import { describe, expect, test } from "bun:test";
import { referenceDoorProgram } from "./door";
import { Driver, type Scheduler } from "./driver";
import { BITBOX_INSTRUCTION_SET } from "./instruction";
import { layerLevels, LEVELS, levelId, partGiven, revisionOf } from "./level";
import { memorySave, type SaveStore } from "./save";
import { Session } from "./session";
import type { Cue } from "./story";

const L9 = LEVELS.length - 1;
const PROGRAM = referenceDoorProgram(BITBOX_INSTRUCTION_SET);

// A session open on the door program, with every level before it solved.
function atTheDoor(store: SaveStore = memorySave()): Session {
  const before = Object.fromEntries(LEVELS.slice(0, L9).map((level) => [levelId(level), revisionOf(level)]));
  store.save({
    solved: before,
    open: "DOOR PROGRAM",
    boards: {},
    flags: [],
    validInstructionSet: BITBOX_INSTRUCTION_SET,
  });
  const session = new Session(store);
  session.resume();
  return session;
}

// Ticks the door program until its run ends, giving what Bitbox says.
function runToEnd(session: Session): Cue | null {
  for (let i = 0; i < 10_000; i++) {
    const { ticked, cue } = session.tickDoor();
    if (!ticked) return cue;
    if (cue) return cue;
  }
  return null;
}

// A scheduler the test fires by hand, which remembers each task's pace.
function manual(): Scheduler & { fire: () => void; ms: number[] } {
  const tasks: (() => void)[] = [];
  const ms: number[] = [];
  return {
    ms,
    every: (each, task) => {
      tasks.push(task);
      ms.push(each);
      return () => {
        tasks.splice(tasks.indexOf(task), 1);
      };
    },
    fire: () => {
      for (const task of tasks.slice()) task();
    },
  };
}

describe("the door program level", () => {
  test("is the last level and the only one in L9, and gives no part", () => {
    expect(layerLevels(9)).toEqual([L9]);
    expect(levelId(LEVELS[L9]!)).toBe("DOOR PROGRAM");
    expect(partGiven(LEVELS[L9]!)).toBeNull();
  });

  test("keeps the program text in the save", () => {
    const store = memorySave();
    atTheDoor(store).editDoorProgram(PROGRAM);
    const again = new Session(store);
    again.resume();
    expect(again.doorProgram).toBe(PROGRAM);
  });

  test("marks the program's mistakes and won't run it, and Bitbox says what's wrong", () => {
    const session = atTheDoor();
    session.editDoorProgram("SET R0, 1\nPLUS R0, R1");
    expect(session.assembly.errors).toEqual([{ line: 2, problem: "PLUS isn't in your instruction set." }]);
    expect(session.beginDoorRun()).toEqual({
      say: "program error",
      error: { line: 2, problem: "PLUS isn't in your instruction set." },
    });
    expect(session.door).toBeNull();
  });

  test("an empty program has nothing to run", () => {
    const session = atTheDoor();
    expect(session.beginDoorRun()).toEqual({ say: "program empty" });
    expect(session.door).toBeNull();
  });

  test("ENIGMA keeps the door shut, and Bitbox says the code doesn't match", () => {
    const session = atTheDoor();
    session.editDoorProgram(PROGRAM);
    session.typeName("enigma");
    expect(session.keypad).toBe("ENIGMA");
    expect(session.beginDoorRun()).toBeNull();
    expect(runToEnd(session)).toEqual({ say: "door shut", sent: 177 });
    expect(session.door?.outcome).toBe("shut");
    expect(session.next).toBeNull();
  });

  test("TURING opens the door, which solves the level and finishes the game", () => {
    const store = memorySave();
    const session = atTheDoor(store);
    session.editDoorProgram(PROGRAM);
    session.typeName("TURING");
    session.beginDoorRun();
    expect(runToEnd(session)).toEqual({ say: "door open" });
    expect(session.solved).toBe(LEVELS.length);
    expect(session.next).toEqual({ to: "end" });
    expect(session.finished).toBe(true);
    expect(store.load()?.finished).toBe(true);
  });

  test("the keypad takes letters only, and nothing while the program runs", () => {
    const session = atTheDoor();
    session.typeName("Tu-r1ing!");
    expect(session.keypad).toBe("TURING");
    session.editDoorProgram(PROGRAM);
    session.beginDoorRun();
    session.typeName("ENIGMA");
    expect(session.keypad).toBe("TURING");
  });
});

describe("the door program's clock", () => {
  test("Step does one tick", () => {
    const session = atTheDoor();
    session.editDoorProgram(PROGRAM);
    const driver = new Driver(session, manual(), () => {});
    driver.tick();
    expect(session.door?.ticks).toBe(1);
    driver.tick();
    expect(session.door?.ticks).toBe(2);
  });

  test("Run ticks at the gauge's speed until the door opens, and Bitbox speaks", () => {
    const session = atTheDoor();
    session.editDoorProgram(PROGRAM);
    session.typeName("TURING");
    session.setClockSpeed(16);
    const said: Cue[] = [];
    const scheduler = manual();
    const driver = new Driver(
      session,
      scheduler,
      () => {},
      (cue) => {
        said.push(cue);
      },
    );
    driver.toggleClock();
    expect(scheduler.ms).toEqual([1000 / 16]);
    for (let i = 0; i < 1000 && driver.running; i++) scheduler.fire();
    expect(driver.running).toBe(false);
    expect(said).toEqual([{ say: "door open" }]);
  });

  test("a program with a mistake doesn't start, and Bitbox says why", () => {
    const session = atTheDoor();
    session.editDoorProgram("JMP nowhere");
    const said: Cue[] = [];
    const driver = new Driver(
      session,
      manual(),
      () => {},
      (cue) => {
        said.push(cue);
      },
    );
    driver.toggleClock();
    expect(driver.running).toBe(false);
    expect(said).toEqual([{ say: "program error", error: { line: 1, problem: "There's no label called nowhere." } }]);
  });
});

const at = (gate: string): number => LEVELS.findIndex((level) => levelId(level) === gate);

// A session open on a sheet, solved or not, with every level before it solved.
function on(gate: string, solved: boolean): Session {
  const index = at(gate);
  const store = memorySave();
  const upTo = LEVELS.slice(0, solved ? index + 1 : index);
  store.save({
    solved: Object.fromEntries(upTo.map((level) => [levelId(level), revisionOf(level)])),
    open: gate,
    boards: {},
    flags: [],
  });
  const session = new Session(store);
  session.resume();
  return session;
}

describe("the clues", () => {
  test.each([
    ["NAND", 1],
    ["DEMUX", 2],
    ["2-BIT ADDER", 3],
    ["2-BIT ALU", 4],
    ["RAM", 5],
    ["SEQUENCER", 6],
  ])("the last sheet of a layer, %s, shows layer %i's clue once it's solved", (gate, layer) => {
    expect(on(gate, false).clue).toBeNull();
    expect(on(gate, true).clue).toBe(layer);
  });

  test("other sheets have none", () => {
    expect(on("NOT", true).clue).toBeNull();
  });
});

describe("a run that goes wrong", () => {
  test("a program that loops forever is stopped, as halted", () => {
    const session = atTheDoor();
    session.editDoorProgram("top: JMP top");
    expect(runToEnd(session)).toEqual({ say: "door halted" });
  });

  test("once the door has opened, another tick does nothing", () => {
    const session = atTheDoor();
    session.editDoorProgram(PROGRAM);
    session.typeName("TURING");
    runToEnd(session);
    expect(session.tickDoor()).toEqual({ ticked: false, cue: null });
  });

  test("the program can't be edited during a run", () => {
    const session = atTheDoor();
    session.editDoorProgram(PROGRAM);
    session.tickDoor();
    session.editDoorProgram("HALT");
    expect(session.doorProgram).toBe(PROGRAM);
  });
});
