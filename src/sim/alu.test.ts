import { describe, expect, test } from "bun:test";
import { placeNode, wire, type Game, type Pin } from "./circuit";
import { kindOf } from "./kind";
import { checkLevel, layerLevels, LEVELS, loadLevel, matches, PARTS, partsBin, truthTable, wiring } from "./level";
import type { Label, NodeID, NodeType, Value } from "./node";

const out = (node: NodeID, index = 0): Pin => ({ node, side: "out", index });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });
const levelIndex = (type: NodeType): number => LEVELS.findIndex((level) => level.gate === type);

function terminal(game: Game, type: NodeType, label: Label): Pin {
  const id = [...game.nodes.values()].find((node) => node.type === type && node.label === label)?.id ?? -1;
  return type === "INPUT" ? out(id) : inp(id);
}

function placer(game: Game): (type: NodeType, x: number, y: number, width?: number) => NodeID {
  return (type, x, y, width = 1) => {
    const node = placeNode(game, type, { x, y }, "", width);
    if (node === null) throw new Error(`No room for ${type} at ${x}, ${y}`);
    return node.id;
  };
}

// A one-signal sum, as OUT and COUT.
const carried = (x: Value): Value[] => [x & 1, x >> 1];

// The table in the issue, one row per OP: what OUT and COUT should be.
function sliceTable(a: Value, b: Value, cin: Value, op: Value): Value[] {
  return (
    [carried(a + b + cin), carried(a + (1 - b) + cin), [a & b, 0], [a | b, 0], [a ^ b, 0], [1 - a, 0]][op] ?? [0, 0]
  );
}

describe("the L4 parts", () => {
  test("open L4 after the 2-bit adder, in order, with the ALU last", () => {
    const first = levelIndex("2-BIT ADDER") + 1;
    expect(layerLevels(4)).toEqual([first, first + 1, first + 2, first + 3]);
    expect(layerLevels(4).map((i) => LEVELS[i]!.gate)).toEqual(["2-BIT MUX", "ZERO TEST", "ALU SLICE", "2-BIT ALU"]);
  });

  test("MUX8 gives A when SEL is off and B when it's on", () => {
    const mux = kindOf(PARTS, "MUX8");
    for (const [a, b] of [
      [0, 255],
      [170, 85],
      [12, 200],
    ] as const) {
      expect(mux.evaluate([a, b, 0], 1)).toEqual([a]);
      expect(mux.evaluate([a, b, 1], 1)).toEqual([b]);
    }
  });

  test("the zero test is on only when every signal of A is off", () => {
    const zero = kindOf(PARTS, "ZERO TEST");
    for (let a = 0; a < 256; a++) expect(zero.evaluate([a], 1)).toEqual([a === 0 ? 1 : 0]);
  });

  test("the ALU slice matches the OP table on every row, with OP 6 and 7 giving 0", () => {
    const slice = kindOf(PARTS, "ALU SLICE");
    for (let op = 0; op < 8; op++)
      for (const a of [0, 1])
        for (const b of [0, 1])
          for (const cin of [0, 1]) expect(slice.evaluate([a, b, cin, op], 1)).toEqual(sliceTable(a, b, cin, op));
    for (const op of [6, 7]) expect(slice.evaluate([1, 1, 1, op], 1)).toEqual([0, 0]);
  });

  test("the ALU does each operation on whole buses, wrapping add and subtract, and ZERO tests A alone", () => {
    const alu = kindOf(PARTS, "ALU");
    const op = (a: Value, b: Value, code: Value): Value[] => alu.evaluate([a, b, code], 1);
    expect(op(100, 55, 0)).toEqual([155, 0]);
    expect(op(200, 100, 0)).toEqual([44, 0]);
    expect(op(9, 4, 1)).toEqual([5, 0]);
    expect(op(3, 5, 1)).toEqual([254, 0]);
    expect(op(12, 10, 2)).toEqual([8, 0]);
    expect(op(12, 10, 3)).toEqual([14, 0]);
    expect(op(12, 10, 4)).toEqual([6, 0]);
    expect(op(12, 10, 5)).toEqual([243, 0]);
    expect(op(12, 10, 6)).toEqual([0, 0]);
    expect(op(12, 10, 7)).toEqual([0, 0]);
    expect(op(0, 7, 0)).toEqual([7, 1]);
    expect(op(5, 5, 1)).toEqual([0, 0]);
  });

  test("once solved, the 2-bit levels give the 8-bit parts, and the others their own", () => {
    const last = layerLevels(4).at(-1)!;
    expect(partsBin(last + 1).slice(-4)).toEqual(["MUX8", "ZERO TEST", "ALU SLICE", "ALU"]);
  });
});

// The 2-bit MUX's intended solution: split A and B, a MUX for each signal
// with SEL on both, and join the outputs.
function buildMux2(game: Game): void {
  const place = placer(game);
  const splitA = place("SPLIT", 12, 9, 2);
  const splitB = place("SPLIT", 12, 22, 2);
  const join = place("JOIN", 34, 18, 2);
  wire(game, terminal(game, "INPUT", "A"), inp(splitA));
  wire(game, terminal(game, "INPUT", "B"), inp(splitB));
  for (let pin = 0; pin < 2; pin++) {
    const mux = place("MUX", 24, 12 + pin * 12);
    wire(game, out(splitA, pin), inp(mux, 0));
    wire(game, out(splitB, pin), inp(mux, 1));
    wire(game, terminal(game, "INPUT", "SEL"), inp(mux, 2));
    wire(game, out(mux), inp(join, pin));
  }
  wire(game, out(join), terminal(game, "OUTPUT", "OUT"));
}

describe("the 2-bit MUX level", () => {
  const index = levelIndex("2-BIT MUX");
  const level = LEVELS[index]!;

  test("chooses between 2-signal buses with one SEL, using a 2-bit split and join", () => {
    expect(level.widths).toEqual({ A: 2, B: 2, OUT: 2 });
    expect(wiring(level)).toEqual([
      { type: "SPLIT", width: 2 },
      { type: "JOIN", width: 2 },
    ]);
  });

  test("two MUXes between a split and a join pass", () => {
    const game = loadLevel(level);
    buildMux2(game);
    const result = checkLevel(game, index);
    expect(result.forbidden).toEqual([]);
    expect(result.hidden.failed).toEqual([]);
    expect(result.passed).toBe(true);
  });
});

// The zero test's intended solution: split A, OR the signals together in
// pairs down to one, and NOT that.
function buildZeroTest(game: Game): void {
  const place = placer(game);
  const split = place("SPLIT", 14, 22, 8);
  wire(game, terminal(game, "INPUT", "A"), inp(split));
  let signals = Array.from({ length: 8 }, (_, pin) => out(split, pin));
  let x = 22;
  while (signals.length > 1) {
    const next: Pin[] = [];
    for (let i = 0; i < signals.length; i += 2) {
      // Each OR sits level with the pair of signals it takes.
      const spacing = 16 / signals.length;
      const or = place("OR", x, 22 + (i + 0.5 - signals.length / 2) * spacing);
      wire(game, signals[i]!, inp(or, 0));
      wire(game, signals[i + 1]!, inp(or, 1));
      next.push(out(or));
    }
    signals = next;
    x += 7;
  }
  const not = place("NOT", x, 22);
  wire(game, signals[0]!, inp(not));
  wire(game, out(not), terminal(game, "OUTPUT", "ZERO"));
}

describe("the zero test level", () => {
  const index = levelIndex("ZERO TEST");
  const level = LEVELS[index]!;

  test("shows the named cases 0, 1, 128 and 255", () => {
    const shown = truthTable(level).map((row) => row.inputs[0]);
    for (const a of [0, 1, 128, 255]) expect(shown).toContain(a);
  });

  test("an OR tree with a NOT on the end passes", () => {
    const game = loadLevel(level);
    buildZeroTest(game);
    const result = checkLevel(game, index);
    expect(result.forbidden).toEqual([]);
    expect(result.passed).toBe(true);
  });
});

// The ALU slice's intended solution. The full adder adds A to B, flipped by
// OP's ones signal, so it subtracts on OP 1. MUXes on OP's three signals pick
// the result, and COUT is the carry only while OP's top two signals are off.
function buildSlice(game: Game): void {
  const place = placer(game);
  const a = terminal(game, "INPUT", "A");
  const b = terminal(game, "INPUT", "B");
  const split = place("SPLIT", 12, 44, 3);
  wire(game, terminal(game, "INPUT", "OP"), inp(split));
  // A split gives the high signal first, so pin 2 is the ones place.
  const [o2, o1, o0] = [out(split, 0), out(split, 1), out(split, 2)];

  const flip = place("XOR", 14, 22);
  wire(game, b, inp(flip, 0));
  wire(game, o0, inp(flip, 1));
  const adder = place("FULL ADDER", 22, 18);
  wire(game, a, inp(adder, 0));
  wire(game, out(flip), inp(adder, 1));
  wire(game, terminal(game, "INPUT", "CIN"), inp(adder, 2));

  const two = (type: NodeType, x: number, y: number, p: Pin, q: Pin): Pin => {
    const g = place(type, x, y);
    wire(game, p, inp(g, 0));
    wire(game, q, inp(g, 1));
    return out(g);
  };
  const mux = (x: number, y: number, p: Pin, q: Pin, sel: Pin): Pin => {
    const g = place("MUX", x, y);
    wire(game, p, inp(g, 0));
    wire(game, q, inp(g, 1));
    wire(game, sel, inp(g, 2));
    return out(g);
  };
  const not = (x: number, y: number, p: Pin): Pin => {
    const g = place("NOT", x, y);
    wire(game, p, inp(g));
    return out(g);
  };

  const and = two("AND", 22, 26, a, b);
  const or = two("OR", 22, 31, a, b);
  const xor = two("XOR", 22, 36, a, b);
  const notA = not(22, 41, a);
  const pick23 = mux(30, 28, and, or, o0);
  const pick45 = mux(30, 38, xor, notA, o0);
  const low = mux(38, 22, out(adder, 0), pick23, o1);
  const high = two("AND", 38, 38, pick45, not(30, 46, o1));
  const result = mux(46, 30, low, high, o2);
  wire(game, result, terminal(game, "OUTPUT", "OUT"));

  const neither = not(38, 52, two("OR", 30, 52, o1, o2));
  wire(game, two("AND", 46, 14, out(adder, 1), neither), terminal(game, "OUTPUT", "COUT"));
}

describe("the ALU slice level", () => {
  const index = levelIndex("ALU SLICE");
  const level = LEVELS[index]!;

  test("takes a 3-signal OP bus, with a 3-bit split and join", () => {
    expect(level.widths).toEqual({ OP: 3 });
    expect(wiring(level)).toEqual([
      { type: "SPLIT", width: 3 },
      { type: "JOIN", width: 3 },
    ]);
  });

  test("shows a case for every OP, unused ones included", () => {
    const ops = new Set(truthTable(level).map((row) => row.inputs[3]));
    expect(ops).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
  });

  test("a full adder and MUXes on OP pass", () => {
    const game = loadLevel(level);
    buildSlice(game);
    const result = checkLevel(game, index);
    expect(result.forbidden).toEqual([]);
    expect(result.hidden.failed).toEqual([]);
    expect(result.passed).toBe(true);
  });
});

// The 2-bit ALU's intended solution: two ALU slices in a chain, the ones
// place at the bottom, the low COUT into the high CIN. The first CIN is OP's
// ones signal, so it's on for subtract (and only matters for add and
// subtract). ZERO is NOT (A's two signals ORed), the zero test at 2 bits.
function buildAlu(game: Game, missingSubtractCarry = false): void {
  const place = placer(game);
  const a = terminal(game, "INPUT", "A");
  const splitA = place("SPLIT", 13, 8, 2);
  const splitB = place("SPLIT", 13, 22, 2);
  const splitOp = place("SPLIT", 13, 36, 3);
  const join = place("JOIN", 34, 16, 2);
  wire(game, a, inp(splitA));
  wire(game, terminal(game, "INPUT", "B"), inp(splitB));
  wire(game, terminal(game, "INPUT", "OP"), inp(splitOp));
  let carry: Pin | null = missingSubtractCarry ? null : out(splitOp, 2);
  for (let bit = 0; bit < 2; bit++) {
    const pin = 1 - bit;
    const slice = place("ALU SLICE", 24, 10 + pin * 12);
    wire(game, out(splitA, pin), inp(slice, 0));
    wire(game, out(splitB, pin), inp(slice, 1));
    if (carry !== null) wire(game, carry, inp(slice, 2));
    wire(game, terminal(game, "INPUT", "OP"), inp(slice, 3));
    wire(game, out(slice, 0), inp(join, pin));
    carry = out(slice, 1);
  }
  wire(game, out(join), terminal(game, "OUTPUT", "OUT"));
  const any = place("OR", 24, 3);
  const none = place("NOT", 33, 3);
  wire(game, out(splitA, 0), inp(any, 0));
  wire(game, out(splitA, 1), inp(any, 1));
  wire(game, out(any), inp(none));
  wire(game, out(none), terminal(game, "OUTPUT", "ZERO"));
}

describe("the 2-bit ALU level", () => {
  const index = levelIndex("2-BIT ALU");
  const level = LEVELS[index]!;

  test("is the last level of L4", () => {
    expect(layerLevels(4).at(-1)).toBe(index);
  });

  test("shows a case for each operation, with overflow and borrow", () => {
    const rows = truthTable(level).map((row) => row.inputs.concat(row.expected));
    expect(rows).toContainEqual([3, 1, 0, 0, 0]);
    expect(rows).toContainEqual([1, 2, 1, 3, 0]);
    expect(rows).toContainEqual([0, 2, 0, 2, 1]);
    for (const op of [0, 1, 2, 3, 4, 5, 6, 7]) expect(rows.some((row) => row[2] === op)).toBe(true);
  });

  test("two ALU slices in a chain, with ZERO from an OR and a NOT, pass", () => {
    const game = loadLevel(level);
    buildAlu(game);
    const result = checkLevel(game, index);
    expect(result.forbidden).toEqual([]);
    expect(result.hidden.failed).toEqual([]);
    expect(result.passed).toBe(true);
  });

  test("with the subtract CIN missing, it fails, and the failing rows are in the result", () => {
    const game = loadLevel(level);
    buildAlu(game, true);
    const result = checkLevel(game, index);
    expect(result.passed).toBe(false);
    const wrong = result.rows.filter((row) => !matches(row.actual, row.expected));
    expect(wrong).toEqual([
      { inputs: [3, 1, 1], expected: [2, 0], actual: [1, 0] },
      { inputs: [1, 2, 1], expected: [3, 0], actual: [2, 0] },
    ]);
  });
});
