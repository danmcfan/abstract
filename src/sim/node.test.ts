import { describe, expect, test } from "bun:test";
import { evaluate } from "./node";

describe("evaluate", () => {
  test("NAND", () => {
    expect(evaluate("NAND", true, true)).toBe(false);
    expect(evaluate("NAND", true, false)).toBe(true);
  });

  test("XOR", () => {
    expect(evaluate("XOR", true, false)).toBe(true);
    expect(evaluate("XOR", true, true)).toBe(false);
  });
});
