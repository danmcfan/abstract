import { expect, test } from "bun:test";
import { MIN_HEIGHT, MIN_WIDTH, SMALL_QUERY, TOUCH_QUERY, watchScreen } from "./device";

type Listener = (event: { matches: boolean }) => void;

// A matchMedia whose queries can be flipped, one at a time.
function fakeMedia(initial: Record<string, boolean>): {
  matchMedia: (query: string) => MediaQueryList;
  change: (query: string, matches: boolean) => void;
} {
  const lists = new Map<string, { matches: boolean; listeners: Listener[] }>();
  const list = (query: string): { matches: boolean; listeners: Listener[] } => {
    let found = lists.get(query);
    if (!found) {
      found = { matches: initial[query] ?? false, listeners: [] };
      lists.set(query, found);
    }
    return found;
  };
  const matchMedia = (query: string): MediaQueryList => {
    const l = list(query);
    return {
      get matches() {
        return l.matches;
      },
      addEventListener: (_: string, listener: Listener): void => void l.listeners.push(listener),
    } as unknown as MediaQueryList;
  };
  const change = (query: string, matches: boolean): void => {
    const l = list(query);
    l.matches = matches;
    for (const listener of l.listeners) listener({ matches });
  };
  return { matchMedia, change };
}

test("the game needs a window at least 1100 by 700", () => {
  expect([MIN_WIDTH, MIN_HEIGHT]).toEqual([1100, 700]);
  expect(SMALL_QUERY).toBe("(width < 1100px) or (height < 700px)");
});

test("a touch-first device is blocked whatever its size", () => {
  expect(TOUCH_QUERY).toBe("(pointer: coarse)");
  const media = fakeMedia({ [TOUCH_QUERY]: true });
  expect(watchScreen(media.matchMedia)()).toBe("touch");
});

test("a big desktop window plays", () => {
  expect(watchScreen(fakeMedia({}).matchMedia)()).toBe("desktop");
});

test("a desktop window follows its size live", () => {
  const media = fakeMedia({ [SMALL_QUERY]: true });
  const screen = watchScreen(media.matchMedia);
  expect(screen()).toBe("small");
  media.change(SMALL_QUERY, false);
  expect(screen()).toBe("desktop");
  media.change(SMALL_QUERY, true);
  expect(screen()).toBe("small");
});

test("touch wins over a small window", () => {
  const media = fakeMedia({ [TOUCH_QUERY]: true, [SMALL_QUERY]: true });
  expect(watchScreen(media.matchMedia)()).toBe("touch");
});
