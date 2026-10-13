import { describe, expect, test } from "bun:test";
import { evaluate } from "./node";

describe("evaluate", () => {
  test("NAND", () => {
    expect(evaluate("NAND", [1, 1])).toEqual([0]);
    expect(evaluate("NAND", [1, 0])).toEqual([1]);
  });

  test("XOR", () => {
    expect(evaluate("XOR", [1, 0])).toEqual([1]);
    expect(evaluate("XOR", [1, 1])).toEqual([0]);
  });

  test("a split gives a bus's signals high bit first, and a join takes them back", () => {
    expect(evaluate("SPLIT", [0b1010], 4)).toEqual([1, 0, 1, 0]);
    expect(evaluate("JOIN", [1, 0, 1, 0], 4)).toEqual([0b1010]);
  });
});
