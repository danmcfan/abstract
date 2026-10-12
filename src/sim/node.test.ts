import { describe, expect, test } from "bun:test";
import { evaluate } from "./node";

describe("evaluate", () => {
  test("NAND", () => {
    expect(evaluate("NAND", [true, true])).toEqual([false]);
    expect(evaluate("NAND", [true, false])).toEqual([true]);
  });

  test("XOR", () => {
    expect(evaluate("XOR", [true, false])).toEqual([true]);
    expect(evaluate("XOR", [true, true])).toEqual([false]);
  });
});
