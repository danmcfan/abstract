import { createEffect, createMemo, on } from "solid-js";
import { say } from "./speech";
import * as script from "./script";
import { level, once, result } from "./state";

// The tutorial is the robot chiming in as you play: once when a level first
// opens, once when it's first solved, and the first time a test fails.
// Flags remember what's been said, so a saved game doesn't repeat itself.
export function useTutorial(): void {
  // State readers rerun on every change; these only on a new level or result.
  const currentLevel = createMemo(level);
  const latest = createMemo(result);

  createEffect(
    on(currentLevel, (l) => {
      once(`intro:${l.gate}`, () => say(script.intro(l)));
    }),
  );

  createEffect(
    on(latest, (r) => {
      if (!r) return;
      const l = currentLevel();
      if (r.passed) once(`solved:${l.gate}`, () => say(script.solved(l)));
      else if (r.forbidden.length > 0) say(script.forbidden(r.forbidden));
      else once(`failed:${l.gate}`, () => say(script.failed));
    }),
  );
}
