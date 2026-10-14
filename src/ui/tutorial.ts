import { createEffect, createMemo, on } from "solid-js";
import { speak } from "./speech";
import { session } from "./state";

// The tutorial is the robot chiming in as you play: once when a level first
// opens, once when it's first solved, and the first time a test fails.
// Every later pass gets a happy face from him, without a line. The session
// decides which, and remembers it with story flags so a saved game doesn't
// repeat itself.
export function useTutorial(): void {
  // State readers rerun on every change; these only on a new level or result.
  const currentLevel = createMemo(() => session().level);
  const latest = createMemo(() => session().result);

  createEffect(
    on(currentLevel, () => {
      speak(session().introduce());
    }),
  );

  createEffect(
    on(latest, (r) => {
      if (r) speak(session().respond());
    }),
  );
}
