import { describe, expect, test } from "bun:test";
import { edgeInto, newGame, placeNode, setInput, switchAt, widthOf, wire, type Game, type Pin } from "./circuit";
import { createGestures } from "./gesture";
import { checkLevel, LEVELS, loadLevel, rowCount, truthTable, wiring, type Level } from "./level";
import { definePart, type Label, type NodeID, type NodeType } from "./node";
import { loadBoard, saveBoard, type SavedBoard } from "./save";

const out = (node: NodeID, index = 0): Pin => ({ node, side: "out", index });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });

function terminal(game: Game, type: NodeType, label: Label): NodeID {
  return [...game.nodes.values()].find((node) => node.type === type && node.label === label)!.id;
}

// A full adder, as a level before the adders below would define it. Its part
// type doesn't exist yet, so the test names one.
const FULL_ADDER: Level = {
  gate: "FULL" as NodeType,
  goal: "SUM is the low bit of A + B + CIN; COUT is the high bit.",
  layer: 3,
  inputs: ["A", "B", "CIN"],
  outputs: ["SUM", "COUT"],
  target: ([a = 0, b = 0, cin = 0]) => [a ^ b ^ cin, (a & b) | (cin & (a ^ b))],
};
definePart(FULL_ADDER.gate, FULL_ADDER);

// An adder of the given width with a few named cases, on a board large
// enough to build it.
function adder(width: number, cases: number[][]): Level {
  return {
    gate: `ADD${width}` as NodeType,
    goal: "SUM and COUT are A + B + CIN.",
    layer: 3,
    inputs: ["A", "B", "CIN"],
    outputs: ["SUM", "COUT"],
    widths: { A: width, B: width, SUM: width },
    target: ([a = 0, b = 0, cin = 0]) => [(a + b + cin) % 2 ** width, Math.floor((a + b + cin) / 2 ** width)],
    cases,
    grid: { width: 70, height: 70 },
  };
}

const ADD4 = adder(4, [
  [0, 0, 0],
  [1, 1, 0],
  [15, 1, 0],
  [10, 5, 0],
]);
const ADD8 = adder(8, [
  [0, 0, 0],
  [1, 1, 0],
  [255, 1, 0],
  [100, 55, 0],
]);
const levelsWith = (level: Level): Level[] => [...LEVELS, FULL_ADDER, level];

// A ripple-carry adder: split A and B into bits, chain a full adder per bit
// from the low bit up, and join the sums. With a glitch, COUT is also forced
// off when every input signal is on, which only one row of the table sees.
function buildAdder(game: Game, width: number, glitch = false): void {
  const a = terminal(game, "INPUT", "A");
  const b = terminal(game, "INPUT", "B");
  const cin = terminal(game, "INPUT", "CIN");
  const place = (type: NodeType, x: number, y: number, w = 1): NodeID => placeNode(game, type, { x, y }, "", w)!.id;
  const splitA = place("SPLIT", 16, 15, width);
  const splitB = place("SPLIT", 16, 45, width);
  const join = place("JOIN", 55, 30, width);
  wire(game, out(a), inp(splitA));
  wire(game, out(b), inp(splitB));
  let carry = out(cin);
  const bits: Pin[] = [carry];
  for (let bit = 0; bit < width; bit++) {
    const pin = width - 1 - bit;
    const full = place(FULL_ADDER.gate, 35, 60 - bit * 7);
    wire(game, out(splitA, pin), inp(full, 0));
    wire(game, out(splitB, pin), inp(full, 1));
    wire(game, carry, inp(full, 2));
    wire(game, out(full, 0), inp(join, pin));
    bits.push(out(splitA, pin), out(splitB, pin));
    carry = out(full, 1);
  }
  wire(game, out(join), inp(terminal(game, "OUTPUT", "SUM")));
  const cout = terminal(game, "OUTPUT", "COUT");
  if (!glitch) {
    wire(game, carry, inp(cout));
    return;
  }
  // AND every input signal together, then let COUT through only when that's off.
  let all = bits[0]!;
  for (const next of bits.slice(1)) {
    const and = place("AND", 25, 5);
    wire(game, all, inp(and, 0));
    wire(game, next, inp(and, 1));
    all = out(and);
  }
  const not = place("NOT", 45, 5);
  const gateOut = place("AND", 55, 5);
  wire(game, all, inp(not));
  wire(game, carry, inp(gateOut, 0));
  wire(game, out(not), inp(gateOut, 1));
  wire(game, out(gateOut), inp(cout));
}

describe("buses", () => {
  test("a wire between pins of different widths is refused", () => {
    const game = newGame();
    const bus = placeNode(game, "INPUT", { x: 5, y: 10 }, "A", 8)!.id;
    const narrow = placeNode(game, "OUTPUT", { x: 40, y: 10 }, "OUT", 4)!.id;
    const single = placeNode(game, "NOT", { x: 20, y: 30 })!.id;
    expect(wire(game, out(bus), inp(narrow))).toBeNull();
    expect(wire(game, out(bus), inp(single))).toBeNull();
    expect(wire(game, out(single), inp(narrow))).toBeNull();
    expect(game.edges.size).toBe(0);
    const wide = placeNode(game, "OUTPUT", { x: 40, y: 30 }, "SUM", 8)!.id;
    expect(wire(game, out(bus), inp(wide))).not.toBeNull();
  });

  test("a bus carries its whole value and is lit when any signal is on", () => {
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 5, y: 10 }, "A", 8)!.id;
    const lamp = placeNode(game, "OUTPUT", { x: 40, y: 10 }, "OUT", 8)!.id;
    const edge = wire(game, out(a), inp(lamp))!;
    expect(game.nodes.get(lamp)!.isHigh).toBe(false);
    setInput(game, a, 0b1000_0000);
    expect(edge.value).toBe(128);
    expect(game.nodes.get(lamp)!.isHigh).toBe(true);
    // Only as many bits as the terminal has.
    setInput(game, a, 0x1ff);
    expect(edge.value).toBe(255);
  });

  test("split, then single wires, then join gives back the same 8-bit value", () => {
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 5, y: 20 }, "A", 8)!.id;
    const split = placeNode(game, "SPLIT", { x: 18, y: 20 }, "", 8)!;
    const join = placeNode(game, "JOIN", { x: 28, y: 20 }, "", 8)!;
    const lamp = placeNode(game, "OUTPUT", { x: 40, y: 20 }, "OUT", 8)!.id;
    expect([widthOf(split, inp(0)), widthOf(split, out(0)), widthOf(join, inp(0)), widthOf(join, out(0))]).toEqual([
      8, 1, 1, 8,
    ]);
    wire(game, out(a), inp(split.id));
    for (let i = 0; i < 8; i++) expect(wire(game, out(split.id, i), inp(join.id, i))).not.toBeNull();
    wire(game, out(join.id), inp(lamp));
    for (let value = 0; value < 256; value++) {
      setInput(game, a, value);
      expect(edgeInto(game, lamp, 0)!.value).toBe(value);
    }
  });

  test("a split's top pin carries the high bit", () => {
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 5, y: 20 }, "A", 4)!.id;
    const split = placeNode(game, "SPLIT", { x: 20, y: 20 }, "", 4)!;
    wire(game, out(a), inp(split.id));
    setInput(game, a, 0b1000);
    expect(split.signals).toEqual([1, 0, 0, 0]);
  });
});

describe("a bus input terminal", () => {
  test("is a row of switches, high bit first; clicking one flips that bit", () => {
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 10, y: 10 }, "A", 4)!;
    const g = createGestures({
      game: () => game,
      edit: (change) => {
        change(game);
      },
      locked: () => false,
    });
    const click = (bit: number): void => {
      const p = { x: a.rect.x + 1.5 + (3 - bit), y: a.rect.y + a.rect.height / 2 };
      expect(switchAt(a, p.x, p.y)).toBe(bit);
      g.down(p, 0);
      g.up(p);
    };
    click(3);
    expect(a.signals).toEqual([0b1000]);
    click(0);
    expect(a.signals).toEqual([0b1001]);
    click(3);
    expect(a.signals).toEqual([0b0001]);
    // Away from the switches, a click flips nothing.
    const label = { x: a.rect.x + a.rect.width - 2, y: a.rect.y + 2 };
    expect(switchAt(a, label.x, label.y)).toBeNull();
    g.down(label, 0);
    g.up(label);
    expect(a.signals).toEqual([0b0001]);
  });
});

describe("a level with buses", () => {
  test("places bus terminals as wide as it says, on the board size it asks for", () => {
    const game = loadLevel(ADD8);
    expect(game.grid).toEqual({ width: 70, height: 70 });
    const widths = [...game.nodes.values()].map((node) => [node.label, node.width]);
    expect(widths).toEqual([
      ["A", 8],
      ["B", 8],
      ["CIN", 1],
      ["SUM", 8],
      ["COUT", 1],
    ]);
  });

  test("its truth table shows only its named cases, as numbers", () => {
    expect(rowCount(ADD8)).toBe(131_072);
    expect(truthTable(ADD8)).toEqual([
      { inputs: [0, 0, 0], expected: [0, 0] },
      { inputs: [1, 1, 0], expected: [2, 0] },
      { inputs: [255, 1, 0], expected: [0, 1] },
      { inputs: [100, 55, 0], expected: [155, 0] },
    ]);
  });

  test("offers a split and a join for each bus width; single-signal levels offer none", () => {
    expect(wiring(ADD8)).toEqual([
      { type: "SPLIT", width: 8 },
      { type: "JOIN", width: 8 },
    ]);
    for (const level of LEVELS) expect(wiring(level)).toEqual([]);
  });

  test("a 4-bit adder built from full adders with split and join passes", () => {
    const levels = levelsWith(ADD4);
    const game = loadLevel(ADD4);
    buildAdder(game, 4);
    const result = checkLevel(game, levels.length - 1, levels);
    expect(result.forbidden).toEqual([]);
    expect(result.rows.map((row) => row.actual)).toEqual(result.rows.map((row) => row.expected));
    expect(result.hidden).toEqual({ checked: 512 - 4, failed: [] });
    expect(result.passed).toBe(true);
  });

  test("a board wrong only on a row outside the named cases fails, and that row is in the result", () => {
    const levels = levelsWith(ADD4);
    const game = loadLevel(ADD4);
    buildAdder(game, 4, true);
    const result = checkLevel(game, levels.length - 1, levels);
    expect(result.rows.every((row) => row.actual.join() === row.expected.join())).toBe(true);
    expect(result.hidden.failed).toEqual([{ inputs: [15, 15, 1], expected: [15, 1], actual: [15, 0] }]);
    expect(result.passed).toBe(false);
  });

  test("split and join fail the parts-bin rule on a level without buses", () => {
    const game = loadLevel(LEVELS[1]!);
    placeNode(game, "SPLIT", { x: 20, y: 20 }, "", 2);
    expect(checkLevel(game, 1).forbidden).toEqual(["SPLIT"]);
  });

  test("a test run over 131,072 rows is quick", () => {
    const levels = levelsWith(ADD8);
    const game = loadLevel(ADD8);
    buildAdder(game, 8);
    const start = performance.now();
    const result = checkLevel(game, levels.length - 1, levels);
    const ms = performance.now() - start;
    expect(result.hidden.checked).toBe(131_072 - 4);
    expect(result.passed).toBe(true);
    expect(ms).toBeLessThan(1000);
  });

  test("a level too long to check in full checks the same seeded sample every run", () => {
    // 2^20 rows, past the full check: a wrong board fails on the same rows.
    const wide: Level = {
      ...adder(8, [[0, 0, 0]]),
      inputs: ["A", "B", "C"],
      widths: { A: 8, B: 8, C: 4, SUM: 8 },
      target: ([a = 0, b = 0, c = 0]) => [(a + b + c) % 256, 0],
    };
    const levels = [...LEVELS, wide];
    const game = loadLevel(wide);
    wire(game, out(terminal(game, "INPUT", "A")), inp(terminal(game, "OUTPUT", "SUM")));
    const first = checkLevel(game, levels.length - 1, levels);
    const second = checkLevel(game, levels.length - 1, levels);
    expect(first.passed).toBe(false);
    expect(first.hidden.failed.length).toBeGreaterThan(0);
    expect(second.hidden).toEqual(first.hidden);
  });
});

describe("a part with bus pins", () => {
  test("has bus pins as wide as its level's terminals, and settles on a later board", () => {
    definePart(ADD8.gate, ADD8);
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 6, y: 5 }, "A", 8)!.id;
    const b = placeNode(game, "INPUT", { x: 6, y: 15 }, "B", 8)!.id;
    const cin = placeNode(game, "INPUT", { x: 6, y: 25 }, "CIN")!.id;
    const sum = placeNode(game, "OUTPUT", { x: 40, y: 5 }, "SUM", 8)!.id;
    const cout = placeNode(game, "OUTPUT", { x: 40, y: 25 }, "COUT")!.id;
    const add = placeNode(game, ADD8.gate, { x: 22, y: 15 })!;
    expect([0, 1, 2].map((i) => widthOf(add, inp(0, i)))).toEqual([8, 8, 1]);
    expect([0, 1].map((i) => widthOf(add, out(0, i)))).toEqual([8, 1]);
    wire(game, out(a), inp(add.id, 0));
    wire(game, out(b), inp(add.id, 1));
    wire(game, out(cin), inp(add.id, 2));
    wire(game, out(add.id, 0), inp(sum));
    wire(game, out(add.id, 1), inp(cout));
    const read = (): number[] => [edgeInto(game, sum, 0)!.value, edgeInto(game, cout, 0)!.value];
    setInput(game, a, 100);
    setInput(game, b, 55);
    expect(read()).toEqual([155, 0]);
    setInput(game, b, 200);
    setInput(game, cin, 1);
    expect(read()).toEqual([45, 1]);
  });

  test("a board with buses saves and loads with its widths and size", () => {
    const game = loadLevel(ADD4);
    setInput(game, terminal(game, "INPUT", "A"), 9);
    const loaded = loadBoard(JSON.parse(JSON.stringify(saveBoard(game))) as SavedBoard);
    expect(loaded.grid).toEqual(ADD4.grid!);
    expect(loaded.nodes.get(terminal(game, "INPUT", "A"))).toEqual(game.nodes.get(terminal(game, "INPUT", "A")));
  });
});
