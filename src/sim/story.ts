import type { LineError } from "./assembler";
import { shownProblems, type InstructionSetCheck } from "./instruction";
import { levelId, type CheckResult, type Level } from "./level";
import type { NodeType } from "./node";

// Something Bitbox reacts to. The sim decides when he speaks and which story
// flag that sets; the UI's script picks his words for each cue.
export type Cue =
  | { say: "intro"; level: Level }
  | { say: "welcome back"; level: Level }
  | { say: "floor"; layer: number }
  | { say: "solved"; level: Level }
  | { say: "failed" }
  | { say: "forbidden"; parts: NodeType[] }
  | { say: "unstable" }
  | { say: "error" }
  | { say: "program error"; error: LineError }
  | { say: "program empty" }
  | { say: "door open" }
  | { say: "door shut"; sent: number }
  | { say: "door halted" }
  | { react: "happy" };

// The story flag keys, one per thing Bitbox only says once.
export const flags = {
  intro: (level: Level): string => `intro:${levelId(level)}`,
  solved: (level: Level): string => `solved:${levelId(level)}`,
  failed: (level: Level): string => `failed:${levelId(level)}`,
  floor: (layer: number): string => `floor:${layer}`,
};

// What Bitbox does after a test run, with the story flag to set if it's
// only said once. The first pass of a level gets the solved lines, and
// every later pass a happy face, so passing always gets a reaction. A
// failure is only talked through once; the ✗ marks say the rest. A
// forbidden part or an unstable board is explained every time, since no ✗
// mark shows it.
export function respond(
  result: CheckResult,
  level: Level,
  heard: (flag: string) => boolean,
): { cue: Cue; flag?: string } | null {
  if (result.passed) {
    const flag = flags.solved(level);
    return heard(flag) ? { cue: { react: "happy" } } : { cue: { say: "solved", level }, flag };
  }
  if (result.forbidden.length > 0) return { cue: { say: "forbidden", parts: result.forbidden } };
  if (result.unstable) return { cue: { say: "unstable" } };
  const flag = flags.failed(level);
  return heard(flag) ? null : { cue: { say: "failed" }, flag };
}

// What Bitbox does after an edit to the instruction set, which is checked
// as the player types. A table that turns good gets the solved lines the
// first time and a happy face after, but an edit to a table already good
// gets nothing, or every keystroke would; the first row that goes bad gets one warning. A row
// still blank isn't bad, since the table starts blank.
export function respondToTable(
  before: InstructionSetCheck,
  check: InstructionSetCheck,
  level: Level,
  heard: (flag: string) => boolean,
): { cue: Cue; flag?: string } | null {
  if (check.solved) {
    if (before.solved) return null;
    const flag = flags.solved(level);
    return heard(flag) ? { cue: { react: "happy" } } : { cue: { say: "solved", level }, flag };
  }
  const bad = Object.values(check.rows).some((row) => {
    const { mnemonic, opcode } = shownProblems(row);
    return [mnemonic, opcode].some((problem) => problem !== null && problem !== "needed");
  });
  const flag = flags.failed(level);
  return bad && !heard(flag) ? { cue: { say: "error" }, flag } : null;
}
