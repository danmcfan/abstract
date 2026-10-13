import { describe, expect, test } from "bun:test";
import { newGame, pinPosition, placeNode, setInput, wire, type Game, type Pin } from "./circuit";
import {
  checkLevel,
  floorAbove,
  LAYERS,
  layerLevels,
  layerState,
  LEVELS,
  loadLevel,
  matches,
  partsBin,
  truthTable,
  type Level,
} from "./level";
import { definePart, outputCount, partSpec, type Label, type NodeID, type NodeType } from "./node";

const out = (node: NodeID, index = 0): Pin => ({ node, side: "out", index });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });

function terminal(game: Game, type: NodeType, label: Label): NodeID {
  return [...game.nodes.values()].find((node) => node.type === type && node.label === label)?.id ?? -1;
}

let spot = 0;
function gate(game: Game, type: NodeType): NodeID {
  spot += 1;
  return placeNode(game, type, { x: 10 + (spot % 4) * 7, y: 5 + Math.floor(spot / 4) * 6 })!.id;
}

function levelGame(index: number): { game: Game; a: NodeID; b: NodeID; sel: NodeID; o: NodeID } {
  const game = loadLevel(LEVELS[index]!);
  return {
    game,
    a: terminal(game, "INPUT", "A"),
    b: terminal(game, "INPUT", "B"),
    sel: terminal(game, "INPUT", "SEL"),
    o: terminal(game, "OUTPUT", "OUT"),
  };
}

const levelIndex = (type: NodeType): number => LEVELS.findIndex((level) => level.gate === type);

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

  test("XOR from four NANDs", () => {
    const { game, a, b, o } = levelGame(4);
    const first = gate(game, "NAND");
    const left = gate(game, "NAND");
    const right = gate(game, "NAND");
    const last = gate(game, "NAND");
    wire(game, out(a), inp(first, 0));
    wire(game, out(b), inp(first, 1));
    wire(game, out(a), inp(left, 0));
    wire(game, out(first), inp(left, 1));
    wire(game, out(first), inp(right, 0));
    wire(game, out(b), inp(right, 1));
    wire(game, out(left), inp(last, 0));
    wire(game, out(right), inp(last, 1));
    wire(game, out(last), inp(o));
    expect(checkLevel(game, 4).passed).toBe(true);
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

test("XOR comes after OR and is on when exactly one input is on", () => {
  const index = LEVELS.findIndex((level) => level.gate === "XOR");
  expect(LEVELS[index - 1]!.gate).toBe("OR");
  expect(truthTable(LEVELS[index]!)).toEqual([
    { inputs: [0, 0], expected: [0] },
    { inputs: [0, 1], expected: [1] },
    { inputs: [1, 0], expected: [1] },
    { inputs: [1, 1], expected: [0] },
  ]);
});

describe("the MUX level", () => {
  const index = levelIndex("MUX");

  test("comes after the parts its solution needs", () => {
    for (const part of ["NOT", "AND", "OR"] as const) expect(partsBin(index)).toContain(part);
  });

  test("has three input terminals, A, B and SEL, top to bottom", () => {
    const { game, a, b, sel } = levelGame(index);
    const y = (id: NodeID): number => game.nodes.get(id)!.rect.y;
    expect([a, b, sel].every((id) => id >= 0)).toBe(true);
    expect(y(a)).toBeLessThan(y(b));
    expect(y(b)).toBeLessThan(y(sel));
  });

  test("its truth table has 8 rows: A when SEL is off, B when SEL is on", () => {
    const rows = truthTable(LEVELS[index]!);
    expect(rows.map((row) => row.inputs.map(Number).join(""))).toEqual([
      "000",
      "001",
      "010",
      "011",
      "100",
      "101",
      "110",
      "111",
    ]);
    expect(rows.map((row) => row.expected[0])).toEqual([0, 0, 0, 1, 1, 0, 1, 1]);
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
    expect(result.rows.every((row) => matches(row.actual, row.expected))).toBe(true);
    expect(result.forbidden).toEqual(["MUX"]);
  });
});

describe("the DEMUX level", () => {
  const index = levelIndex("DEMUX");

  test("comes straight after MUX, as the last level so far", () => {
    expect(LEVELS[index - 1]!.gate).toBe("MUX");
    expect(index).toBe(LEVELS.length - 1);
  });

  test("has inputs D and SEL and outputs Y0 and Y1", () => {
    const game = loadLevel(LEVELS[index]!);
    const labels = (type: NodeType): Label[] =>
      [...game.nodes.values()].filter((node) => node.type === type).map((node) => node.label);
    expect(labels("INPUT")).toEqual(["D", "SEL"]);
    expect(labels("OUTPUT")).toEqual(["Y0", "Y1"]);
  });

  test("its truth table sends D to Y0 when SEL is off and to Y1 when SEL is on", () => {
    expect(truthTable(LEVELS[index]!)).toEqual([
      { inputs: [0, 0], expected: [0, 0] },
      { inputs: [0, 1], expected: [0, 0] },
      { inputs: [1, 0], expected: [1, 0] },
      { inputs: [1, 1], expected: [0, 1] },
    ]);
  });

  test("D AND NOT SEL, and D AND SEL, passes", () => {
    const game = loadLevel(LEVELS[index]!);
    const d = terminal(game, "INPUT", "D");
    const sel = terminal(game, "INPUT", "SEL");
    const not = gate(game, "NOT");
    const and0 = gate(game, "AND");
    const and1 = gate(game, "AND");
    wire(game, out(sel), inp(not));
    wire(game, out(d), inp(and0, 0));
    wire(game, out(not), inp(and0, 1));
    wire(game, out(d), inp(and1, 0));
    wire(game, out(sel), inp(and1, 1));
    wire(game, out(and0), inp(terminal(game, "OUTPUT", "Y0")));
    wire(game, out(and1), inp(terminal(game, "OUTPUT", "Y1")));
    expect(checkLevel(game, index).passed).toBe(true);
  });

  test("once solved, DEMUX is a part with two output pins that does what its level asks", () => {
    expect(partsBin(index + 1)).toContain("DEMUX");
    expect(outputCount("DEMUX")).toBe(2);
    expect(partSpec("DEMUX")!.outputs).toEqual(["Y0", "Y1"]);
    const game = loadLevel(LEVELS[index]!);
    const demux = gate(game, "DEMUX");
    wire(game, out(terminal(game, "INPUT", "D")), inp(demux, 0));
    wire(game, out(terminal(game, "INPUT", "SEL")), inp(demux, 1));
    wire(game, out(demux, 0), inp(terminal(game, "OUTPUT", "Y0")));
    wire(game, out(demux, 1), inp(terminal(game, "OUTPUT", "Y1")));
    const result = checkLevel(game, index);
    expect(result.rows.every((row) => matches(row.actual, row.expected))).toBe(true);
    expect(result.forbidden).toEqual(["DEMUX"]);
  });
});

describe("checkLevel", () => {
  test("fails a wrong circuit and reports the failing rows", () => {
    const { game, a, o } = levelGame(1);
    wire(game, out(a), inp(o));
    const result = checkLevel(game, 1);
    expect(result.passed).toBe(false);
    expect(result.rows.map((row) => row.actual)).toEqual([[0], [1]]);
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
  expect(partsBin(5)).toEqual(["NAND", "NOT", "AND", "OR", "XOR"]);
});

test("checkLevel leaves the board's inputs alone", () => {
  const { game, a } = levelGame(1);
  checkLevel(game, 1);
  expect(game.nodes.get(a)!.isHigh).toBe(false);
});

// A two-output level after the four we have, built from their parts. Its
// part type doesn't exist yet, so the test names one.
const HALF_ADDER: Level = {
  gate: "HALF" as NodeType,
  goal: "SUM is on when exactly one input is on; COUT when both are.",
  layer: 3,
  inputs: ["A", "B"],
  outputs: ["SUM", "COUT"],
  target: ([a = 0, b = 0]) => [a ^ b, a & b],
};
const WITH_HALF = [...LEVELS, HALF_ADDER];
const HALF = WITH_HALF.length - 1;

// SUM is (A OR B) AND (A NAND B); COUT is A AND B.
function buildHalfAdder(game: Game, cout: NodeType = "AND"): void {
  const a = terminal(game, "INPUT", "A");
  const b = terminal(game, "INPUT", "B");
  const or = gate(game, "OR");
  const nand = gate(game, "NAND");
  const and = gate(game, "AND");
  const carry = gate(game, cout);
  for (const g of [or, nand, carry]) {
    wire(game, out(a), inp(g, 0));
    wire(game, out(b), inp(g, 1));
  }
  wire(game, out(or), inp(and, 0));
  wire(game, out(nand), inp(and, 1));
  wire(game, out(and), inp(terminal(game, "OUTPUT", "SUM")));
  wire(game, out(carry), inp(terminal(game, "OUTPUT", "COUT")));
}

describe("a level with two outputs", () => {
  test("places a named output terminal for each output, down the right edge", () => {
    const game = loadLevel(HALF_ADDER);
    const outputs = [...game.nodes.values()].filter((node) => node.type === "OUTPUT");
    expect(outputs.map((node) => node.label)).toEqual(["SUM", "COUT"]);
    expect(outputs[0]!.rect.x).toBe(outputs[1]!.rect.x);
    expect(outputs[0]!.rect.y).toBeLessThan(outputs[1]!.rect.y);
  });

  test("its truth table has one expected value per output", () => {
    expect(truthTable(HALF_ADDER).map((row) => row.expected)).toEqual([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ]);
  });

  test("a correct board passes", () => {
    const game = loadLevel(HALF_ADDER);
    buildHalfAdder(game);
    expect(checkLevel(game, HALF, WITH_HALF).passed).toBe(true);
  });

  test("one wrong output fails, and the failing row reports the actual bits", () => {
    const game = loadLevel(HALF_ADDER);
    buildHalfAdder(game, "OR");
    const result = checkLevel(game, HALF, WITH_HALF);
    expect(result.passed).toBe(false);
    expect(result.rows.map((row) => row.actual)).toEqual([
      [0, 0],
      [1, 1],
      [1, 1],
      [0, 1],
    ]);
  });

  test("its part settles each output pin when wired on a later board", () => {
    definePart(HALF_ADDER.gate, HALF_ADDER);
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 4, y: 10 }, "A")!.id;
    const b = placeNode(game, "INPUT", { x: 4, y: 20 }, "B")!.id;
    const lamp = placeNode(game, "OUTPUT", { x: 40, y: 10 }, "OUT")!.id;
    const half = placeNode(game, HALF_ADDER.gate, { x: 20, y: 20 })!;
    expect(half.signals).toEqual([0, 0]);
    expect(pinPosition(half, "out", 0).y).toBeLessThan(pinPosition(half, "out", 1).y);
    const not = gate(game, "NOT");
    wire(game, out(a), inp(half.id, 0));
    wire(game, out(b), inp(half.id, 1));
    wire(game, out(half.id, 1), inp(not));
    wire(game, out(half.id, 0), inp(lamp));
    const seen = [0, 1].flatMap((va) =>
      [0, 1].map((vb) => {
        setInput(game, a, va);
        setInput(game, b, vb);
        return half.signals.concat(Number(game.nodes.get(not)!.isHigh), Number(game.nodes.get(lamp)!.isHigh));
      }),
    );
    expect(seen).toEqual([
      [0, 0, 1, 0],
      [1, 0, 1, 1],
      [1, 0, 1, 1],
      [0, 1, 0, 0],
    ]);
  });
});

const stub = (layer: number): Level => ({ ...LEVELS[1]!, layer });

describe("the stack", () => {
  // Two levels on L1 and one on L2, so a layer can be part solved.
  const levels = [stub(1), stub(1), stub(2)];

  test("lists nine layers, L1 to L9, each with a floor", () => {
    expect(LAYERS.map((layer) => layer.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LAYERS[2]!.floor).toBe("adder assembly");
    expect(LAYERS[8]!.floor).toBe("the exit hall");
  });

  test("every level belongs to a layer, in order up the stack", () => {
    const layers = LEVELS.map((level) => level.layer);
    const sorted = [...layers];
    sorted.sort((p, q) => p - q);
    expect(layers).toEqual(sorted);
    expect(layers.every((n) => LAYERS.some((layer) => layer.number === n))).toBe(true);
    expect(layerLevels(1)).toEqual([0]);
  });

  test("a layer is in progress while its first level can be played", () => {
    expect(layerState(1, 0, levels)).toBe("in progress");
    expect(layerState(1, 1, levels)).toBe("in progress");
  });

  test("a layer is built once every level in it is solved", () => {
    expect(layerState(1, 2, levels)).toBe("built");
    expect(layerState(2, 3, levels)).toBe("built");
  });

  test("a layer is locked until its first level can be played", () => {
    expect(layerState(2, 0, levels)).toBe("locked");
    expect(layerState(2, 1, levels)).toBe("locked");
    expect(layerState(2, 2, levels)).toBe("in progress");
  });

  test("a layer with no levels in the game is locked, even with everything solved", () => {
    expect(layerState(3, 3, levels)).toBe("locked");
    expect(layerState(9, LEVELS.length)).toBe("locked");
  });

  test("only a layer's last level leads up a floor, and only to a layer with levels", () => {
    expect(floorAbove(0, levels)).toBeNull();
    expect(floorAbove(1, levels)?.floor).toBe("the logic line");
    expect(floorAbove(2, levels)).toBeNull();
    expect(floorAbove(0)?.number).toBe(2);
    expect(floorAbove(LEVELS.length - 1)).toBeNull();
  });
});
