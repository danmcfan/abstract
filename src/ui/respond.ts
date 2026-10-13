import type { Expression } from "../robot/expression";
import type { CheckResult, Level } from "../sim/level";
import * as script from "./script";
import type { Line } from "./speech";

// What Bitbox does after a test run: says some lines, marking them heard
// with a story flag if they're only said once, or just pulls a face.
export type Response = { say: Line[]; flag?: string } | { react: Expression } | null;

// The first pass of a level gets the solved lines, and every later pass a
// happy face, so passing always gets a reaction. A failure is only talked
// through once; the ✗ marks say the rest. A forbidden part or an unstable
// board is explained every time, since no ✗ mark shows it.
export function respond(result: CheckResult, level: Level, heard: (flag: string) => boolean): Response {
  if (result.passed) {
    const flag = `solved:${level.gate}`;
    return heard(flag) ? { react: "happy" } : { say: script.solved(level), flag };
  }
  if (result.forbidden.length > 0) return { say: script.forbidden(result.forbidden) };
  if (result.unstable) return { say: script.unstable };
  const flag = `failed:${level.gate}`;
  return heard(flag) ? null : { say: script.failed, flag };
}
