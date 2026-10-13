import { expect, test } from "bun:test";
import { LEVELS, type Level } from "../sim/level";
import { help, intro, solved } from "./script";

const level = (gate: string): Level => LEVELS.find((l) => l.gate === gate)!;
const endOfFloor = (gate: string): boolean => solved(level(gate)).some((line) => line.text.includes("more floors"));

test("the end-of-floor lines play when DEMUX is solved, and only then", () => {
  expect(endOfFloor("DEMUX")).toBe(true);
  for (const other of LEVELS.filter((l) => l.gate !== "DEMUX")) expect(endOfFloor(other.gate)).toBe(false);
});

test("every level has its own intro, hint and solved lines", () => {
  for (const l of LEVELS) {
    expect(intro(l).length).toBeGreaterThan(0);
    expect(solved(l).length).toBeGreaterThan(0);
    expect(help(l).length).toBeGreaterThan(1);
  }
});
