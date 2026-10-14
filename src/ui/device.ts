import { createSignal, type Accessor } from "solid-js";

// The game plays only on a desktop (docs/adr/0010-desktop-only.md): the
// sheet's layout needs at least this much window, and building a board
// means dragging wires with a mouse.
export const MIN_WIDTH = 1100;
export const MIN_HEIGHT = 700;

export const SMALL_QUERY = `(width < ${MIN_WIDTH}px) or (height < ${MIN_HEIGHT}px)`;
// A touch-first device, phone or tablet, at any size.
export const TOUCH_QUERY = "(pointer: coarse)";

// Where the game is running: a desktop it plays on, a touch device it never
// plays on, or a desktop window too small until the player makes it bigger.
export type Screen = "desktop" | "touch" | "small";

type MatchMedia = (query: string) => Pick<MediaQueryList, "matches" | "addEventListener">;

// Tracks the queries live, so resizing the window changes the answer
// without a reload.
export function watchScreen(matchMedia: MatchMedia): Accessor<Screen> {
  const touch = watch(matchMedia(TOUCH_QUERY));
  const small = watch(matchMedia(SMALL_QUERY));
  return () => {
    if (touch()) return "touch";
    return small() ? "small" : "desktop";
  };
}

function watch(query: Pick<MediaQueryList, "matches" | "addEventListener">): Accessor<boolean> {
  const [matches, setMatches] = createSignal(query.matches);
  query.addEventListener("change", (event) => {
    setMatches(event.matches);
  });
  return matches;
}
