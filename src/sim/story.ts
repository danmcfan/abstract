import type { CheckResult, Level } from "./level";
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
  | { react: "happy" };

// The story flag keys, one per thing Bitbox only says once.
export const flags = {
  intro: (level: Level): string => `intro:${level.gate}`,
  solved: (level: Level): string => `solved:${level.gate}`,
  failed: (level: Level): string => `failed:${level.gate}`,
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
