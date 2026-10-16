import { expect, test } from "bun:test";
import { tabStops, wrapTab } from "./trap";

const items = ["a", "b", "c"];

test("Tab on the last stop wraps to the first", () => {
  expect(wrapTab(items, "c", false)).toBe("a");
});

test("Shift+Tab on the first stop wraps to the last", () => {
  expect(wrapTab(items, "a", true)).toBe("c");
});

test("Tab between stops is left to the browser", () => {
  expect(wrapTab(items, "a", false)).toBeNull();
  expect(wrapTab(items, "b", true)).toBeNull();
});

test("focus outside the stops is pulled back in", () => {
  expect(wrapTab(items, "elsewhere", false)).toBe("a");
  expect(wrapTab(items, "elsewhere", true)).toBe("c");
});

test("no stops leaves focus alone", () => {
  expect(wrapTab([], "a", false)).toBeNull();
});

test("tabStops lists enabled buttons in each root, skipping missing roots", () => {
  const live = {} as unknown as HTMLElement;
  const root = {
    querySelectorAll: () => [live],
  } as unknown as Element;
  expect(tabStops([null, root])).toEqual([live]);
});
