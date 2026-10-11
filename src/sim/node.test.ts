import { describe, expect, test } from "bun:test";
import { addNode, evaluate, moveNode, newGame } from "./node";

describe("addNode", () => {
  test("snaps the node onto the grid", () => {
    const game = newGame();
    const node = addNode(game, "NAND", { x: 10.4, y: 10.4 });
    expect(node.rect).toEqual({ x: 7, y: 8, width: 6, height: 4 });
  });
});

describe("moveNode", () => {
  test("refuses to overlap another node", () => {
    const game = newGame();
    const a = addNode(game, "AND", { x: 10, y: 10 });
    const b = addNode(game, "AND", { x: 20, y: 10 });
    expect(moveNode(game, b.id, a.rect.x + 1, a.rect.y)).toBe(false);
    expect(moveNode(game, b.id, a.rect.x, a.rect.y + 5)).toBe(true);
  });
});

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
