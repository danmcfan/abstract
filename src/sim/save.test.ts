import { expect, test } from "bun:test";
import { buildSolution, checkLevel, circuits, LEVELS, loadLevel, PARTS } from "./level";
import { loadBoard, memorySave, saveBoard } from "./save";

test("an ADD/SUB board saved when its output was OUT still solves", () => {
  const level = circuits(LEVELS).find((l) => l.gate === "ADD/SUB")!;
  const game = loadLevel(level);
  buildSolution(game, level);
  const board = saveBoard(game);
  for (const node of board.nodes) if (node.type === "OUTPUT" && node.label === "SUM") node.label = "OUT";
  const save = memorySave({ solved: {}, open: "ADD/SUB", boards: { "ADD/SUB": board }, flags: [] }).load();
  const old = save?.boards["ADD/SUB"];
  expect(old?.nodes.some((node) => node.label === "OUT")).toBe(false);
  expect(checkLevel(loadBoard(old!, PARTS), LEVELS.indexOf(level)).passed).toBe(true);
});

test("a program counter saved with a PC output loads with it named COUNT", () => {
  const level = circuits(LEVELS).find((l) => l.gate === "PROGRAM COUNTER")!;
  const game = loadLevel(level);
  buildSolution(game, level);
  const board = saveBoard(game);
  for (const node of board.nodes) if (node.label === "COUNT") node.label = "PC";
  const save = memorySave({ solved: {}, open: "PROGRAM COUNTER", boards: { "PROGRAM COUNTER": board }, flags: [] });
  const labels = save.load()?.boards["PROGRAM COUNTER"]?.nodes.map((node) => node.label);
  expect(labels).toContain("COUNT");
  expect(labels).not.toContain("PC");
});
