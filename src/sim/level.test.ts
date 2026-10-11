import { describe, expect, test } from "bun:test";
import { placeNode, wire, type Game, type Pin } from "./circuit";
import { checkLevel, LEVELS, loadLevel, toolbox } from "./level";
import type { Label, NodeID, NodeType } from "./node";

const out = (node: NodeID): Pin => ({ node, side: "out", index: 0 });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });

function terminal(game: Game, type: NodeType, label: Label = "NONE"): NodeID {
  return [...game.nodes.values()].find((node) => node.type === type && node.label === label)?.id ?? -1;
}

let spot = 0;
function gate(game: Game, type: NodeType): NodeID {
  spot += 1;
  return placeNode(game, type, { x: 10 + (spot % 4) * 7, y: 5 + Math.floor(spot / 4) * 6 })!.id;
}

function levelGame(index: number) {
  const game = loadLevel(LEVELS[index]!);
  return { game, a: terminal(game, "INPUT", "ALPHA"), b: terminal(game, "INPUT", "BETA"), o: terminal(game, "OUTPUT") };
}

describe("solutions", () => {
  test("NOT from one NAND", () => {
    const { game, a, o } = levelGame(0);
    const nand = gate(game, "NAND");
    wire(game, out(a), inp(nand, 0));
    wire(game, out(a), inp(nand, 1));
    wire(game, out(nand), inp(o));
    expect(checkLevel(game, 0).passed).toBe(true);
  });

  test("AND from NAND then NOT", () => {
    const { game, a, b, o } = levelGame(1);
    const nand = gate(game, "NAND");
    const not = gate(game, "NOT");
    wire(game, out(a), inp(nand, 0));
    wire(game, out(b), inp(nand, 1));
    wire(game, out(nand), inp(not));
    wire(game, out(not), inp(o));
    expect(checkLevel(game, 1).passed).toBe(true);
  });

  test("OR from two NOTs into a NAND", () => {
    const { game, a, b, o } = levelGame(2);
    const notA = gate(game, "NOT");
    const notB = gate(game, "NOT");
    const nand = gate(game, "NAND");
    wire(game, out(a), inp(notA));
    wire(game, out(b), inp(notB));
    wire(game, out(notA), inp(nand, 0));
    wire(game, out(notB), inp(nand, 1));
    wire(game, out(nand), inp(o));
    expect(checkLevel(game, 2).passed).toBe(true);
  });
});

describe("checkLevel", () => {
  test("fails a wrong circuit and reports the failing rows", () => {
    const { game, a, o } = levelGame(0);
    wire(game, out(a), inp(o));
    const result = checkLevel(game, 0);
    expect(result.passed).toBe(false);
    expect(result.rows.map((row) => row.actual)).toEqual([false, true]);
  });

  test("fails when a gate outside the toolbox is used", () => {
    const { game, a, o } = levelGame(0);
    const not = gate(game, "NOT");
    wire(game, out(a), inp(not));
    wire(game, out(not), inp(o));
    const result = checkLevel(game, 0);
    expect(result.forbidden).toEqual(["NOT"]);
    expect(result.passed).toBe(false);
  });
});

test("each solved level adds its gate to the toolbox", () => {
  expect(toolbox(0)).toEqual(["NAND"]);
  expect(toolbox(2)).toEqual(["NAND", "NOT", "AND"]);
});

test("checkLevel leaves the board's inputs alone", () => {
  const { game, a } = levelGame(0);
  checkLevel(game, 0);
  expect(game.nodes.get(a)!.isHigh).toBe(false);
});
