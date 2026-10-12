import { describe, expect, test } from "bun:test";
import { progress } from "./timeline";

describe("progress", () => {
  test("clamps outside the span", () => {
    expect(progress(0, 1, 3)).toBe(0);
    expect(progress(2, 1, 3)).toBe(0.5);
    expect(progress(5, 1, 3)).toBe(1);
  });

  test("an empty span is a step", () => {
    expect(progress(0.9, 1, 1)).toBe(0);
    expect(progress(1, 1, 1)).toBe(1);
  });
});
