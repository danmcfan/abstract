import { expect, test } from "bun:test";
import { isTyping } from "./keys";

const el = (tagName: string, isContentEditable = false): object => ({ tagName, isContentEditable });

test("keys pressed in a text field, select or editable element are typing", () => {
  for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) expect(isTyping(el(tag))).toBe(true);
  expect(isTyping(el("DIV", true))).toBe(true);
});

test("keys pressed on the page or a button are not typing", () => {
  for (const tag of ["BODY", "DIV", "BUTTON"]) expect(isTyping(el(tag))).toBe(false);
  expect(isTyping(null)).toBe(false);
});
