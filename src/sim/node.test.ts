import { describe, expect, test } from "bun:test";
import { evaluate, inputCount, terminalName } from "./node";

describe("evaluate", () => {
  test("NAND", () => {
    expect(evaluate("NAND", [true, true])).toBe(false);
    expect(evaluate("NAND", [true, false])).toBe(true);
  });

  test("XOR", () => {
    expect(evaluate("XOR", [true, false])).toBe(true);
    expect(evaluate("XOR", [true, true])).toBe(false);
  });

  test("MUX passes A when SEL is off and B when SEL is on", () => {
    expect(inputCount("MUX")).toBe(3);
    expect(evaluate("MUX", [true, false, false])).toBe(true);
    expect(evaluate("MUX", [false, true, false])).toBe(false);
    expect(evaluate("MUX", [true, false, true])).toBe(false);
    expect(evaluate("MUX", [false, true, true])).toBe(true);
  });
});

test("terminals show their short names", () => {
  expect(terminalName("ALPHA")).toBe("A");
  expect(terminalName("BETA")).toBe("B");
  expect(terminalName("SEL")).toBe("SEL");
});
