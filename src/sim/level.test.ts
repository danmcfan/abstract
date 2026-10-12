import { describe, expect, test } from "bun:test";
import { placeNode, wire, type Game, type Pin } from "./circuit";
import { checkLevel, LEVELS, loadLevel, partsBin, truthTable } from "./level";
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
  return {
    game,
    a: terminal(game, "INPUT", "ALPHA"),
    b: terminal(game, "INPUT", "BETA"),
    sel: terminal(game, "INPUT", "SEL"),
    o: terminal(game, "OUTPUT"),
  };
}

const levelIndex = (type: NodeType) => LEVELS.findIndex((level) => level.gate === type);

describe("solutions", () => {
  test("the NAND level comes wired and passes as is", () => {
    const { game } = levelGame(0);
    expect([...game.nodes.values()].map((node) => node.type)).toContain("NAND");
    expect(game.edges.size).toBe(3);
    expect(checkLevel(game, 0).passed).toBe(true);
  });

  test("NOT from one NAND", () => {
    const { game, a, o } = levelGame(1);
    const nand = gate(game, "NAND");
    wire(game, out(a), inp(nand, 0));
    wire(game, out(a), inp(nand, 1));
    wire(game, out(nand), inp(o));
    expect(checkLevel(game, 1).passed).toBe(true);
  });

  test("AND from NAND then NOT", () => {
    const { game, a, b, o } = levelGame(2);
    const nand = gate(game, "NAND");
    const not = gate(game, "NOT");
    wire(game, out(a), inp(nand, 0));
    wire(game, out(b), inp(nand, 1));
    wire(game, out(nand), inp(not));
    wire(game, out(not), inp(o));
    expect(checkLevel(game, 2).passed).toBe(true);
  });

  test("OR from two NOTs into a NAND", () => {
    const { game, a, b, o } = levelGame(3);
    const notA = gate(game, "NOT");
    const notB = gate(game, "NOT");
    const nand = gate(game, "NAND");
    wire(game, out(a), inp(notA));
    wire(game, out(b), inp(notB));
    wire(game, out(notA), inp(nand, 0));
    wire(game, out(notB), inp(nand, 1));
    wire(game, out(nand), inp(o));
    expect(checkLevel(game, 3).passed).toBe(true);
  });

  test("MUX from A AND NOT SEL, OR B AND SEL", () => {
    const index = levelIndex("MUX");
    const { game, a, b, sel, o } = levelGame(index);
    const not = gate(game, "NOT");
    const andA = gate(game, "AND");
    const andB = gate(game, "AND");
    const or = gate(game, "OR");
    wire(game, out(sel), inp(not));
    wire(game, out(a), inp(andA, 0));
    wire(game, out(not), inp(andA, 1));
    wire(game, out(b), inp(andB, 0));
    wire(game, out(sel), inp(andB, 1));
    wire(game, out(andA), inp(or, 0));
    wire(game, out(andB), inp(or, 1));
    wire(game, out(or), inp(o));
    expect(checkLevel(game, index).passed).toBe(true);
  });
});

describe("the MUX level", () => {
  const index = levelIndex("MUX");

  test("comes after the parts its solution needs", () => {
    expect(partsBin(index)).toEqual(expect.arrayContaining(["NOT", "AND", "OR"]));
  });

  test("has three input terminals, A, B and SEL, top to bottom", () => {
    const { game, a, b, sel } = levelGame(index);
    const y = (id: NodeID) => game.nodes.get(id)!.rect.y;
    expect([a, b, sel].every((id) => id >= 0)).toBe(true);
    expect(y(a)).toBeLessThan(y(b));
    expect(y(b)).toBeLessThan(y(sel));
  });

  test("its truth table has 8 rows: A when SEL is off, B when SEL is on", () => {
    const rows = truthTable(LEVELS[index]!);
    expect(rows.map((row) => row.inputs.map(Number).join(""))).toEqual(["000", "001", "010", "011", "100", "101", "110", "111"]);
    expect(rows.map((row) => row.expected)).toEqual([false, false, false, true, true, false, true, true]);
  });

  test("the MUX part does what its level asks", () => {
    const { game, a, b, sel, o } = levelGame(index);
    const mux = gate(game, "MUX");
    wire(game, out(a), inp(mux, 0));
    wire(game, out(b), inp(mux, 1));
    wire(game, out(sel), inp(mux, 2));
    wire(game, out(mux), inp(o));
    // It isn't in its own level's parts bin, but its rows must still match.
    const result = checkLevel(game, index);
    expect(result.rows.every((row) => row.actual === row.expected)).toBe(true);
    expect(result.forbidden).toEqual(["MUX"]);
  });
});

describe("checkLevel", () => {
  test("fails a wrong circuit and reports the failing rows", () => {
    const { game, a, o } = levelGame(1);
    wire(game, out(a), inp(o));
    const result = checkLevel(game, 1);
    expect(result.passed).toBe(false);
    expect(result.rows.map((row) => row.actual)).toEqual([false, true]);
  });

  test("fails when a gate outside the parts bin is used", () => {
    const { game, a, o } = levelGame(1);
    const not = gate(game, "NOT");
    wire(game, out(a), inp(not));
    wire(game, out(not), inp(o));
    const result = checkLevel(game, 1);
    expect(result.forbidden).toEqual(["NOT"]);
    expect(result.passed).toBe(false);
  });
});

test("each solved level adds its gate to the parts bin", () => {
  expect(partsBin(0)).toEqual([]);
  expect(partsBin(1)).toEqual(["NAND"]);
  expect(partsBin(3)).toEqual(["NAND", "NOT", "AND"]);
});

test("checkLevel leaves the board's inputs alone", () => {
  const { game, a } = levelGame(1);
  checkLevel(game, 1);
  expect(game.nodes.get(a)!.isHigh).toBe(false);
});
