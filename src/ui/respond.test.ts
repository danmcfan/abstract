import { describe, expect, test } from "bun:test";
import { LEVELS, type CheckResult } from "../sim/level";
import { respond } from "./respond";
import * as script from "./script";

const NOT = LEVELS[1]!;
const passed: CheckResult = { rows: [], forbidden: [], hidden: { checked: 0, failed: [] }, passed: true };
const failed: CheckResult = { rows: [], forbidden: [], hidden: { checked: 0, failed: [] }, passed: false };
const forbidden: CheckResult = { rows: [], forbidden: ["NOT"], hidden: { checked: 0, failed: [] }, passed: false };

// Responds to a run of results in order, keeping story flags the way the
// tutorial does.
function play(results: CheckResult[]) {
  const flags = new Set<string>();
  return results.map((r) => {
    const response = respond(r, NOT, (flag) => flags.has(flag));
    if (response && "flag" in response && response.flag) flags.add(response.flag);
    return response;
  });
}

describe("Bitbox's response to a test run", () => {
  test("the first pass of a level plays the solved lines", () => {
    expect(play([passed])).toEqual([{ say: script.solved(NOT), flag: "solved:NOT" }]);
  });

  test("a later pass shows happy with no line", () => {
    expect(play([passed, passed, passed]).slice(1)).toEqual([{ react: "happy" }, { react: "happy" }]);
  });

  test("a pass after failing still plays the solved lines first", () => {
    expect(play([failed, passed])[1]).toEqual({ say: script.solved(NOT), flag: "solved:NOT" });
  });

  test("a failed run adds no new reaction", () => {
    const [first, second] = play([failed, failed]);
    expect(first).toEqual({ say: script.failed, flag: "failed:NOT" });
    expect(second).toBeNull();
    expect(play([passed, failed])[1]).toEqual({ say: script.failed, flag: "failed:NOT" });
  });

  test("a forbidden part gets its line every time", () => {
    expect(play([forbidden, forbidden])).toEqual([
      { say: script.forbidden(["NOT"]) },
      { say: script.forbidden(["NOT"]) },
    ]);
  });
});
