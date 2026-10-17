import { expect, test } from "bun:test";
import { LEVELS, levelId, type Level } from "../sim/level";
import { everyLine, help, intro, solved } from "./script";

const level = (gate: string): Level => LEVELS.find((l) => levelId(l) === gate)!;
const endOfFloor = (gate: string): boolean => solved(level(gate)).some((line) => line.text.includes("more floors"));

test("the end-of-floor lines play when DEMUX is solved, and only then", () => {
  expect(endOfFloor("DEMUX")).toBe(true);
  for (const other of LEVELS.filter((l) => levelId(l) !== "DEMUX")) expect(endOfFloor(levelId(other))).toBe(false);
});

test("every level has its own intro, hint and solved lines", () => {
  for (const l of LEVELS) {
    expect(intro(l).length).toBeGreaterThan(0);
    expect(solved(l).length).toBeGreaterThan(0);
    expect(help(l).length).toBeGreaterThan(1);
  }
});

test("every line takes in each level's intro, solved and hint lines", () => {
  const all = new Set(everyLine(LEVELS).map((line) => line.text));
  for (const l of LEVELS)
    for (const line of [...intro(l), ...solved(l), ...help(l)]) expect(all.has(line.text)).toBe(true);
});
