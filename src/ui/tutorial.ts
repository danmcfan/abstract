import { createEffect, createMemo, on } from "solid-js";
import { respond } from "./respond";
import { react, say } from "./speech";
import * as script from "./script";
import { hasFlag, level, result, setFlag } from "./state";

// The tutorial is the robot chiming in as you play: once when a level first
// opens, once when it's first solved, and the first time a test fails.
// Every later pass gets a happy face from him, without a line.
// Flags remember what's been said, so a saved game doesn't repeat itself.
export function useTutorial(): void {
  const once = (flag: string, speak: () => void) => {
    if (hasFlag(flag)) return;
    setFlag(flag);
    speak();
  };

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
      const response = respond(r, currentLevel(), hasFlag);
      if (!response) return;
      if ("react" in response) return react(response.react);
      if (response.flag) setFlag(response.flag);
      say(response.say);
    }),
  );
}
