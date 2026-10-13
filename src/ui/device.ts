import { createSignal, type Accessor } from "solid-js";

// The layout switches between narrow and wide at this window width: the
// board fits beside the level panel at or above it, below it under it. The
// HUD's and Dialogue's Tailwind classes repeat it as min-[900px] and max-[899px].
export const WIDE_MIN_WIDTH = 900;

// A narrow window on a touch-only device. On one of these the board is
// squeezed below the level panel and too cramped to build on with a finger.
// A narrow desktop window, a wide touch laptop and a tablet with a trackpad
// all still count as fine to play on.
export const SMALL_TOUCH_QUERY = `(width < ${WIDE_MIN_WIDTH}px) and (pointer: coarse) and (hover: none)`;

type MatchMedia = (query: string) => Pick<MediaQueryList, "matches" | "addEventListener">;

// Tracks the query live, so rotating a tablet to landscape or resizing the
// window changes the answer without a reload.
export function watchSmallTouch(matchMedia: MatchMedia): Accessor<boolean> {
  const query = matchMedia(SMALL_TOUCH_QUERY);
  const [matches, setMatches] = createSignal(query.matches);
  query.addEventListener("change", (event) => {
    setMatches(event.matches);
  });
  return matches;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

// The player's choice to play on a small touch device anyway. It has its own
// key, apart from the save, so New Game doesn't bring the notice back.
const DISMISSED_KEY = "abstract.desktop-notice-dismissed";

export function noticeDismissal(storage: () => Storage): { dismissed: Accessor<boolean>; dismiss: () => void } {
  const read = (): boolean => {
    try {
      return storage().getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  };
  const [dismissed, setDismissed] = createSignal(read());
  const dismiss = (): void => {
    setDismissed(true);
    try {
      storage().setItem(DISMISSED_KEY, "1");
    } catch {}
  };
  return { dismissed, dismiss };
}
