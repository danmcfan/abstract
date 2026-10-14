import { describe, expect, test } from "bun:test";
import { placeNode, wire, type Game, type Pin } from "./circuit";
import { hasKind, kindOf } from "./kind";
import {
  checkLevel,
  layerLevels,
  LEVELS,
  loadLevel,
  matches,
  PARTS,
  partsBin,
  revisionOf,
  truthTable,
  type Level,
  wiring,
} from "./level";
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

// The OP table in ADR 9, one row per OP: what OUT and COUT should be.
function sliceTable(a: Value, b: Value, cin: Value, op: Value): Value[] {
  const arithmetic: Value[][] = [carried(a + b + cin), carried(a + (1 - b) + cin), [0, 0], [0, 0]];
  const logic: Value[][] = [
    [a & b, 0],
    [a | b, 0],
    [a ^ b, 0],
    [1 - a, 0],
  ];
  return [...arithmetic, ...logic][op]!;
}

// The parts a solution places, not counting splits and joins.
const partCount = (level: Level): number =>
  (level.solution?.nodes ?? []).filter((node) => node.type !== "SPLIT" && node.type !== "JOIN").length;

describe("the L4 parts", () => {
  test("open L4 after the 2-bit adder, in order, with the ALU last", () => {
    const first = levelIndex("2-BIT ADDER") + 1;
    expect(layerLevels(4)).toEqual([first, first + 1, first + 2, first + 3, first + 4, first + 5]);
    expect(layerLevels(4).map((i) => LEVELS[i]!.gate)).toEqual([
      "2-BIT MUX",
      "MUX4",
      "ADD/SUB",
      "LOGIC UNIT",
      "ALU SLICE",
      "2-BIT ALU",
    ]);
  });

  test("the zero test is gone", () => {
    expect(levelIndex("ZERO TEST")).toBe(-1);
    expect(hasKind(PARTS, "ZERO TEST")).toBe(false);
  });

  test("the ALU slice's Wiring has a 2-bit join for the logic unit's SEL, besides OP's 3-bit split and join", () => {
    expect(wiring(LEVELS[levelIndex("ALU SLICE")]!)).toEqual([
      { type: "SPLIT", width: 3 },
      { type: "JOIN", width: 3 },
      { type: "SPLIT", width: 2 },
      { type: "JOIN", width: 2 },
    ]);
  });

  test("no L4 solution places more than 10 parts", () => {
    for (const i of layerLevels(4)) expect(partCount(LEVELS[i]!)).toBeLessThanOrEqual(10);
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

  test("MUX4 gives the input SEL numbers", () => {
    const mux = kindOf(PARTS, "MUX4");
    for (let sel = 0; sel < 4; sel++)
      for (let ins = 0; ins < 16; ins++) {
        const signals = [3, 2, 1, 0].map((bit) => (ins >> bit) & 1);
        expect(mux.evaluate([...signals, sel], 1)).toEqual([signals[sel]!]);
      }
  });

  test("ADD/SUB adds B, or subtracts it when SUB is on", () => {
    const unit = kindOf(PARTS, "ADD/SUB");
    for (const a of [0, 1])
      for (const b of [0, 1])
        for (const cin of [0, 1]) {
          expect(unit.evaluate([a, b, cin, 0], 1)).toEqual(carried(a + b + cin));
          expect(unit.evaluate([a, b, cin, 1], 1)).toEqual(carried(a + (1 - b) + cin));
        }
  });

  test("the logic unit does and, or, xor and not A by SEL", () => {
    const unit = kindOf(PARTS, "LOGIC UNIT");
    for (const a of [0, 1])
      for (const b of [0, 1])
        expect([0, 1, 2, 3].map((sel) => unit.evaluate([a, b, sel], 1)[0])).toEqual([a & b, a | b, a ^ b, 1 - a]);
  });

  test("the ALU slice matches the OP table on every row, with OP 2 and 3 giving 0", () => {
    const slice = kindOf(PARTS, "ALU SLICE");
    for (let op = 0; op < 8; op++)
      for (const a of [0, 1])
        for (const b of [0, 1])
          for (const cin of [0, 1]) expect(slice.evaluate([a, b, cin, op], 1)).toEqual(sliceTable(a, b, cin, op));
    for (const op of [2, 3]) expect(slice.evaluate([1, 1, 1, op], 1)).toEqual([0, 0]);
  });

  test("the ALU does each operation on whole buses, wrapping add and subtract, with OUT only", () => {
    const alu = kindOf(PARTS, "ALU");
    const op = (a: Value, b: Value, code: Value): Value[] => alu.evaluate([a, b, code], 1);
    expect(op(100, 55, 0)).toEqual([155]);
    expect(op(200, 100, 0)).toEqual([44]);
    expect(op(9, 4, 1)).toEqual([5]);
    expect(op(3, 5, 1)).toEqual([254]);
    expect(op(12, 10, 2)).toEqual([0]);
    expect(op(12, 10, 3)).toEqual([0]);
    expect(op(12, 10, 4)).toEqual([8]);
    expect(op(12, 10, 5)).toEqual([14]);
    expect(op(12, 10, 6)).toEqual([6]);
    expect(op(12, 10, 7)).toEqual([243]);
  });

  test("the ALU SLICE and 2-BIT ALU levels changed, so they're at revision 2", () => {
    expect(revisionOf(LEVELS[levelIndex("ALU SLICE")]!)).toBe(2);
    expect(revisionOf(LEVELS[levelIndex("2-BIT ALU")]!)).toBe(2);
  });

  test("once solved, the 2-bit levels give the 8-bit parts, and the others their own", () => {
    const last = layerLevels(4).at(-1)!;
    expect(partsBin(last + 1).slice(-6)).toEqual(["MUX8", "MUX4", "ADD/SUB", "LOGIC UNIT", "ALU SLICE", "ALU"]);
  });
});

// The 2-bit ALU's intended solution: two ALU slices in a chain, the ones
// place at the bottom, the low COUT into the high CIN. The first CIN is OP's
// ones signal, so it's on for subtract (and only matters for add and
// subtract).
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
}

describe("the 2-bit ALU level", () => {
  const index = levelIndex("2-BIT ALU");
  const level = LEVELS[index]!;

  test("is the last level of L4", () => {
    expect(layerLevels(4).at(-1)).toBe(index);
  });

  test("shows a case for each operation, with overflow and borrow", () => {
    const rows = truthTable(level).map((row) => row.inputs.concat(row.expected));
    expect(rows).toContainEqual([3, 1, 0, 0]);
    expect(rows).toContainEqual([1, 2, 1, 3]);
    for (const op of [0, 1, 2, 3, 4, 5, 6, 7]) expect(rows.some((row) => row[2] === op)).toBe(true);
  });

  test("two ALU slices in a chain pass", () => {
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
      { inputs: [3, 1, 1], expected: [2], actual: [1] },
      { inputs: [1, 2, 1], expected: [3], actual: [2] },
    ]);
  });
});
