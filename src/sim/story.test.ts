import { describe, expect, test } from "bun:test";
import { LEVELS, type CheckResult } from "./level";
import { respond, type Cue } from "./story";

const NOT = LEVELS[1]!;
const passed: CheckResult = {
  rows: [],
  forbidden: [],
  hidden: { checked: 0, failed: [] },
  unstable: false,
  endless: false,
  passed: true,
};
const failed: CheckResult = {
  rows: [],
  forbidden: [],
  hidden: { checked: 0, failed: [] },
  unstable: false,
  endless: false,
  passed: false,
};
const forbidden: CheckResult = {
  rows: [],
  forbidden: ["NOT"],
  hidden: { checked: 0, failed: [] },
  unstable: false,
  endless: false,
  passed: false,
};

const unstable: CheckResult = { ...failed, unstable: true };

// Responds to a run of results in order, keeping story flags the way the
// tutorial does.
function play(results: CheckResult[]): (Cue | null)[] {
  const flags = new Set<string>();
  return results.map((r) => {
    const response = respond(r, NOT, (flag) => flags.has(flag));
    if (response?.flag !== undefined) flags.add(response.flag);
    return response?.cue ?? null;
  });
}

describe("Bitbox's response to a test run", () => {
  test("the first pass of a level plays the solved lines", () => {
    expect(play([passed])).toEqual([{ say: "solved", level: NOT }]);
  });

  test("a later pass shows happy with no line", () => {
    expect(play([passed, passed, passed]).slice(1)).toEqual([{ react: "happy" }, { react: "happy" }]);
  });

  test("a pass after failing still plays the solved lines first", () => {
    expect(play([failed, passed])[1]).toEqual({ say: "solved", level: NOT });
  });

  test("a failed run adds no new reaction", () => {
    const [first, second] = play([failed, failed]);
    expect(first).toEqual({ say: "failed" });
    expect(second).toBeNull();
    expect(play([passed, failed])[1]).toEqual({ say: "failed" });
  });

  test("a forbidden part gets its line every time", () => {
    expect(play([forbidden, forbidden])).toEqual([
      { say: "forbidden", parts: ["NOT"] },
      { say: "forbidden", parts: ["NOT"] },
    ]);
  });

  test("an unstable board gets its line every time", () => {
    expect(play([unstable, unstable])).toEqual([{ say: "unstable" }, { say: "unstable" }]);
  });
});
