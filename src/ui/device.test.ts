import { expect, test } from "bun:test";
import { SMALL_TOUCH_QUERY, noticeDismissal, watchSmallTouch } from "./device";

type Listener = (event: { matches: boolean }) => void;

function fakeMedia(initial: boolean): {
  matchMedia: (query: string) => MediaQueryList;
  change: (matches: boolean) => void;
  queries: string[];
} {
  const listeners: Listener[] = [];
  const queries: string[] = [];
  const list = {
    matches: initial,
    addEventListener: (_: string, listener: Listener): void => void listeners.push(listener),
  };
  const matchMedia = (query: string): MediaQueryList => (queries.push(query), list as unknown as MediaQueryList);
  const change = (matches: boolean): void => {
    list.matches = matches;
    for (const listener of listeners) listener({ matches });
  };
  return { matchMedia, change, queries };
}

function fakeStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  items: Map<string, string>;
} {
  const items = new Map<string, string>();
  return {
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => void items.set(key, value),
    items,
  };
}

test("small touch needs a narrow window, a coarse pointer and no hover", () => {
  expect(SMALL_TOUCH_QUERY).toBe("(width < 900px) and (pointer: coarse) and (hover: none)");
});

test("small touch follows the media query live", () => {
  const media = fakeMedia(true);
  const smallTouch = watchSmallTouch(media.matchMedia);
  expect(media.queries).toEqual([SMALL_TOUCH_QUERY]);
  expect(smallTouch()).toBe(true);
  media.change(false);
  expect(smallTouch()).toBe(false);
  media.change(true);
  expect(smallTouch()).toBe(true);
});

test("dismissing the notice is remembered across loads", () => {
  const storage = fakeStorage();
  const first = noticeDismissal(() => storage);
  expect(first.dismissed()).toBe(false);
  first.dismiss();
  expect(first.dismissed()).toBe(true);
  expect(noticeDismissal(() => storage).dismissed()).toBe(true);
});

test("dismissal is kept apart from the save", () => {
  const storage = fakeStorage();
  noticeDismissal(() => storage).dismiss();
  expect([...storage.items.keys()]).not.toContain("abstract.save");
});

function broken(): never {
  throw new Error("blocked");
}

test("unreadable storage shows the notice and dismissing still works", () => {
  const notice = noticeDismissal(broken);
  expect(notice.dismissed()).toBe(false);
  notice.dismiss();
  expect(notice.dismissed()).toBe(true);
});
