import { describe, expect, test } from "bun:test";
import {
  edgeInto,
  moveNode,
  newGame,
  pinPosition,
  placeNode,
  removeNode,
  setInput,
  unwire,
  wire,
  type Game,
  type Pin,
} from "./circuit";
import { DEFAULT_GRID, overlaps } from "./grid";
import { PARTS } from "./level";
import type { NodeID, NodeType } from "./node";

const out = (node: NodeID): Pin => ({ node, side: "out", index: 0 });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });

function add(game: Game, type: NodeType, x: number, y: number): NodeID {
  return placeNode(game, type, { x, y })!.id;
}

const high = (game: Game, id: NodeID): boolean => game.nodes.get(id)!.isHigh;

describe("placeNode", () => {
  test("snaps the node onto the grid", () => {
    const node = placeNode(newGame(PARTS), "NAND", { x: 10.4, y: 10.4 })!;
    expect(node.rect).toEqual({ x: 7, y: 8, width: 6, height: 4 });
  });

  test("finds the nearest free spot when the centre is taken", () => {
    const game = newGame(PARTS);
    const a = placeNode(game, "AND", { x: 20, y: 20 })!;
    const b = placeNode(game, "AND", { x: 20, y: 20 })!;
    expect(overlaps(a.rect, b.rect)).toBe(false);
    expect(Math.max(Math.abs(b.rect.x - a.rect.x), Math.abs(b.rect.y - a.rect.y))).toBeLessThanOrEqual(5);
  });

  test("refuses when the board is full", () => {
    const game = newGame(PARTS);
    for (let i = 0; i < (DEFAULT_GRID.width * DEFAULT_GRID.height) / 16; i++) placeNode(game, "INPUT", { x: 0, y: 0 });
    expect(placeNode(game, "INPUT", { x: 20, y: 20 })).toBeNull();
  });

  test("a new gate settles: NAND with no wires is high", () => {
    const game = newGame(PARTS);
    expect(high(game, add(game, "NAND", 10, 10))).toBe(true);
  });
});

describe("moveNode", () => {
  test("refuses to overlap another node", () => {
    const game = newGame(PARTS);
    const a = placeNode(game, "AND", { x: 10, y: 10 })!;
    const b = add(game, "AND", 20, 10);
    expect(moveNode(game, b, a.rect.x + 1, a.rect.y)).toBe(false);
    expect(moveNode(game, b, a.rect.x, a.rect.y + 5)).toBe(true);
  });
});

describe("wire", () => {
  test("an input pin takes one wire, replacing the old one", () => {
    const game = newGame(PARTS);
    const a = add(game, "INPUT", 4, 10);
    const b = add(game, "INPUT", 4, 30);
    const o = add(game, "OUTPUT", 40, 20);
    wire(game, out(a), inp(o));
    wire(game, inp(o), out(b));
    expect(game.edges.size).toBe(1);
    expect(edgeInto(game, o, 0)!.from).toBe(b);
  });

  test("refuses loops and self wires", () => {
    const game = newGame(PARTS);
    const x = add(game, "NAND", 10, 10);
    const y = add(game, "NAND", 20, 10);
    expect(wire(game, out(x), inp(y))).not.toBeNull();
    expect(wire(game, out(y), inp(x))).toBeNull();
    expect(wire(game, out(x), inp(x))).toBeNull();
    expect(game.edges.size).toBe(1);
  });

  test("refuses out-to-out and in-to-in", () => {
    const game = newGame(PARTS);
    const x = add(game, "NAND", 10, 10);
    const y = add(game, "NAND", 20, 10);
    expect(wire(game, out(x), out(y))).toBeNull();
    expect(wire(game, inp(x), inp(y))).toBeNull();
  });
});

describe("removeNode", () => {
  test("unlinks its wires at both ends", () => {
    const game = newGame(PARTS);
    const a = add(game, "INPUT", 4, 10);
    const g = add(game, "NOT", 20, 10);
    const o = add(game, "OUTPUT", 40, 10);
    wire(game, out(a), inp(g));
    wire(game, out(g), inp(o));
    setInput(game, a, 0);
    expect(high(game, o)).toBe(true);
    removeNode(game, g);
    expect(game.edges.size).toBe(0);
    expect(edgeInto(game, o, 0)).toBeUndefined();
    expect(high(game, o)).toBe(false);
  });
});

describe("setInput", () => {
  test("settles everything downstream", () => {
    const game = newGame(PARTS);
    const a = add(game, "INPUT", 4, 10);
    const g = add(game, "NOT", 20, 10);
    const o = add(game, "OUTPUT", 40, 10);
    wire(game, out(a), inp(g));
    const edge = wire(game, out(g), inp(o))!;
    expect(high(game, o)).toBe(true);
    setInput(game, a, 1);
    expect(high(game, g)).toBe(false);
    expect(high(game, o)).toBe(false);
    expect(edge.value).toBe(0);
  });

  test("ignores non-INPUT nodes", () => {
    const game = newGame(PARTS);
    const o = add(game, "OUTPUT", 40, 10);
    setInput(game, o, 1);
    expect(high(game, o)).toBe(false);
  });
});

describe("unwire", () => {
  test("drops the wire into a pin and settles", () => {
    const game = newGame(PARTS);
    const a = add(game, "INPUT", 4, 10);
    const o = add(game, "OUTPUT", 40, 10);
    wire(game, out(a), inp(o));
    setInput(game, a, 1);
    expect(high(game, o)).toBe(true);
    unwire(game, inp(o));
    expect(game.edges.size).toBe(0);
    expect(high(game, o)).toBe(false);
  });
});

describe("a three-input part", () => {
  test("spaces its input pins evenly down its left edge, on grid cells", () => {
    const game = newGame(PARTS);
    const node = placeNode(game, "MUX", { x: 20, y: 20 })!;
    const ys = [0, 1, 2].map((i) => pinPosition(game, node, "in", i).y - node.rect.y);
    expect(ys).toEqual([1, 3, 5]);
    expect(pinPosition(game, node, "in", 2).x).toBe(node.rect.x);
  });

  test("settles from all three of its inputs", () => {
    const game = newGame(PARTS);
    const a = add(game, "INPUT", 4, 6);
    const b = add(game, "INPUT", 4, 16);
    const sel = add(game, "INPUT", 4, 26);
    const mux = add(game, "MUX", 20, 16);
    const o = add(game, "OUTPUT", 40, 16);
    wire(game, out(a), inp(mux, 0));
    wire(game, out(b), inp(mux, 1));
    wire(game, out(sel), inp(mux, 2));
    wire(game, out(mux), inp(o));
    setInput(game, b, 1);
    expect(high(game, o)).toBe(false);
    setInput(game, sel, 1);
    expect(high(game, o)).toBe(true);
  });
});
