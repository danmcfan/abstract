import { expect, test } from "bun:test";
import { SMALL_TOUCH_QUERY, noticeDismissal, watchSmallTouch } from "./device";

function fakeMedia(initial: boolean) {
  const listeners: ((event: { matches: boolean }) => void)[] = [];
  const queries: string[] = [];
  const list = {
    matches: initial,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => void listeners.push(listener),
  };
  const matchMedia = (query: string) => (queries.push(query), list as unknown as MediaQueryList);
  const change = (matches: boolean) => {
    list.matches = matches;
    for (const listener of listeners) listener({ matches });
  };
  return { matchMedia, change, queries };
}

function fakeStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), items };
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

test("unreadable storage shows the notice and dismissing still works", () => {
  const broken = () => {
    throw new Error("blocked");
  };
  const notice = noticeDismissal(broken);
  expect(notice.dismissed()).toBe(false);
  notice.dismiss();
  expect(notice.dismissed()).toBe(true);
});
