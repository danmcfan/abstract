import { describe, expect, test } from "bun:test";
import {
  edgeInto,
  moveNode,
  newGame,
  pinPosition,
  placeNode,
  removeNode,
  restart,
  setInput,
  setInputs,
  simulate,
  terminalNamed,
  tick,
  unwire,
  wire,
  type Game,
  type Pin,
} from "./circuit";
import { DEFAULT_GRID, overlaps } from "./grid";
import { partsFrom } from "./kind";
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

describe("terminalNamed", () => {
  test("finds an input or output terminal by its label, and nothing else", () => {
    const game = newGame(PARTS);
    const a = placeNode(game, "INPUT", { x: 5, y: 5 }, "A")!.id;
    const output = placeNode(game, "OUTPUT", { x: 40, y: 5 }, "A")!.id;
    expect(terminalNamed(game, "input", "A")?.id).toBe(a);
    expect(terminalNamed(game, "output", "A")?.id).toBe(output);
    expect(terminalNamed(game, "input", "B")).toBeUndefined();
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

  test("accepts a wire that forms a loop", () => {
    const game = newGame(PARTS);
    const x = add(game, "NAND", 10, 10);
    const y = add(game, "NAND", 20, 10);
    expect(wire(game, out(x), inp(y))).not.toBeNull();
    expect(wire(game, out(y), inp(x))).not.toBeNull();
    expect(game.edges.size).toBe(2);
    expect(game.stable).toBe(true);
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

// S and R are active low: turning S off sets Q, turning R off resets it,
// and with both on the latch holds whatever it last had.
function srLatch(game: Game): { s: NodeID; r: NodeID; q: NodeID; nq: NodeID } {
  const s = add(game, "INPUT", 4, 10);
  const r = add(game, "INPUT", 4, 30);
  const top = add(game, "NAND", 20, 10);
  const bottom = add(game, "NAND", 20, 30);
  const q = add(game, "OUTPUT", 40, 10);
  const nq = add(game, "OUTPUT", 40, 30);
  wire(game, out(s), inp(top, 0));
  wire(game, out(bottom), inp(top, 1));
  wire(game, out(r), inp(bottom, 1));
  wire(game, out(top), inp(bottom, 0));
  wire(game, out(top), inp(q));
  wire(game, out(bottom), inp(nq));
  setInputs(
    game,
    new Map([
      [s, 1],
      [r, 1],
    ]),
  );
  return { s, r, q, nq };
}

describe("loops", () => {
  test("a NOT gate wired to itself is unstable, and unwiring it settles", () => {
    const game = newGame(PARTS);
    const not = add(game, "NOT", 10, 10);
    expect(wire(game, out(not), inp(not))).not.toBeNull();
    expect(game.stable).toBe(false);
    unwire(game, inp(not));
    expect(game.stable).toBe(true);
  });

  test("a NOT wired to itself through a second gate is unstable, and unwiring it settles", () => {
    const game = newGame(PARTS);
    const x = add(game, "NOT", 10, 10);
    const y = add(game, "AND", 20, 10);
    const one = add(game, "INPUT", 4, 20);
    setInput(game, one, 1);
    wire(game, out(x), inp(y, 0));
    wire(game, out(one), inp(y, 1));
    wire(game, out(y), inp(x));
    expect(game.stable).toBe(false);
    unwire(game, inp(x));
    expect(game.stable).toBe(true);
  });

  test("two cross-coupled NANDs set, hold and reset", () => {
    const game = newGame(PARTS);
    const { s, r, q, nq } = srLatch(game);
    setInput(game, s, 0);
    expect([high(game, q), high(game, nq)]).toEqual([true, false]);
    setInput(game, s, 1);
    expect([high(game, q), high(game, nq)]).toEqual([true, false]);
    setInput(game, r, 0);
    expect([high(game, q), high(game, nq)]).toEqual([false, true]);
    setInput(game, r, 1);
    expect([high(game, q), high(game, nq)]).toEqual([false, true]);
    setInput(game, s, 0);
    expect([high(game, q), high(game, nq)]).toEqual([true, false]);
    expect(game.stable).toBe(true);
  });

  test("simulate holds a latch's value from one set of inputs to the next", () => {
    const game = newGame(PARTS);
    const { s, r, q } = srLatch(game);
    const run = simulate(game, [s, r], [q]);
    expect(run([0, 1])).toEqual({ outputs: [1], stable: true });
    expect(run([1, 1])).toEqual({ outputs: [1], stable: true });
    expect(run([1, 0])).toEqual({ outputs: [0], stable: true });
    expect(run([1, 1])).toEqual({ outputs: [0], stable: true });
  });
});

// A part that keeps its own state: D is taken in when CLK turns on. Its
// state is Q and the clock it last saw.
const FLIP_FLOP = partsFrom([
  {
    gate: "DFF",
    inputs: ["D", "CLK"],
    outputs: ["Q"],
    memory: {
      next: ([d = 0, clk = 0], [q = 0, seen = 0]): number[] => [clk && !seen ? d : q, clk],
      outputs: ([q = 0]): number[] => [q],
    },
  },
]);

// Eight places of 8 signals, more than one number can hold, read at ADDR.
const PLACES = partsFrom([
  {
    gate: "PLACES",
    inputs: ["CLK", "ADDR", "DIN"],
    outputs: ["DOUT"],
    widths: { ADDR: 3, DIN: 8, DOUT: 8 },
    memory: {
      next: ([clk = 0, addr = 0, din = 0], [seen = 0, ...places]): number[] => [
        clk,
        ...Array.from({ length: 8 }, (_, i) => (clk && !seen && i === addr ? din : (places[i] ?? 0))),
      ],
      outputs: ([, ...places], [, addr = 0]): number[] => [places[addr] ?? 0],
    },
  },
]);

function flipFlop(): { game: Game; d: NodeID; clk: NodeID; ff: NodeID; q: NodeID } {
  const game = newGame(FLIP_FLOP);
  const d = add(game, "INPUT", 4, 10);
  const clk = add(game, "INPUT", 4, 30);
  const ff = add(game, "DFF", 20, 20);
  const q = add(game, "OUTPUT", 40, 20);
  wire(game, out(d), inp(ff, 0));
  wire(game, out(clk), inp(ff, 1));
  wire(game, out(ff), inp(q));
  return { game, d, clk, ff, q };
}

describe("memory parts", () => {
  test("take in a value only when the clock turns on", () => {
    const { game, d, clk, q } = flipFlop();
    setInput(game, d, 1);
    expect(high(game, q)).toBe(false);
    tick(game, clk);
    expect(high(game, q)).toBe(true);
    setInput(game, d, 0);
    expect(high(game, q)).toBe(true);
    setInput(game, clk, 1);
    expect(high(game, q)).toBe(false);
  });

  test("restart puts every memory part's state back to 0", () => {
    const { game, d, clk, ff, q } = flipFlop();
    setInput(game, d, 1);
    tick(game, clk);
    expect(high(game, q)).toBe(true);
    restart(game);
    expect(game.nodes.get(ff)!.state.some(Boolean)).toBe(false);
    expect(high(game, q)).toBe(false);
  });

  test("keep a state wider than one number, and can give outputs that read their inputs", () => {
    const game = newGame(PLACES);
    const clk = placeNode(game, "INPUT", { x: 4, y: 8 })!.id;
    const addr = placeNode(game, "INPUT", { x: 4, y: 20 }, "", 3)!.id;
    const din = placeNode(game, "INPUT", { x: 4, y: 32 }, "", 8)!.id;
    const places = add(game, "PLACES", 22, 20);
    const dout = placeNode(game, "OUTPUT", { x: 40, y: 20 }, "", 8)!.id;
    wire(game, out(clk), inp(places, 0));
    wire(game, out(addr), inp(places, 1));
    wire(game, out(din), inp(places, 2));
    wire(game, out(places), inp(dout));
    for (let i = 0; i < 8; i++) {
      setInputs(
        game,
        new Map([
          [addr, i],
          [din, 255 - i],
        ]),
      );
      tick(game, clk);
    }
    const read = (i: number): number => {
      setInput(game, addr, i);
      return game.nodes.get(places)!.signals[0] ?? -1;
    };
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => read(i))).toEqual([255, 254, 253, 252, 251, 250, 249, 248]);
  });
});
