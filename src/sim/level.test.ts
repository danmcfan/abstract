import { describe, expect, test } from "bun:test";
import { newGame, pinPosition, placeNode, setInput, wire, type Game, type Pin } from "./circuit";
import { checkLevel, LEVELS, loadLevel, partsBin, truthTable, type Level } from "./level";
import { definePart, type Label, type NodeID, type NodeType } from "./node";

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

function levelGame(index: number) {
  const game = loadLevel(LEVELS[index]!);
  return { game, a: terminal(game, "INPUT", "A"), b: terminal(game, "INPUT", "B"), o: terminal(game, "OUTPUT", "OUT") };
}

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
});

describe("checkLevel", () => {
  test("fails a wrong circuit and reports the failing rows", () => {
    const { game, a, o } = levelGame(1);
    wire(game, out(a), inp(o));
    const result = checkLevel(game, 1);
    expect(result.passed).toBe(false);
    expect(result.rows.map((row) => row.actual)).toEqual([[false], [true]]);
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

// A two-output level after the four we have, built from their parts. Its
// part type doesn't exist yet, so the test names one.
const HALF_ADDER: Level = {
  gate: "HALF" as NodeType,
  goal: "SUM is on when exactly one input is on; COUT when both are.",
  inputs: ["A", "B"],
  outputs: ["SUM", "COUT"],
  target: ([a, b]) => [a !== b, !!(a && b)],
};
const WITH_HALF = [...LEVELS, HALF_ADDER];
const HALF = WITH_HALF.length - 1;

// SUM is (A OR B) AND (A NAND B); COUT is A AND B.
function buildHalfAdder(game: Game, cout: NodeType = "AND") {
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
      [false, false],
      [true, false],
      [true, false],
      [false, true],
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
      [false, false],
      [true, true],
      [true, true],
      [false, true],
    ]);
  });

  test("its part settles each output pin when wired on a later board", () => {
    definePart(HALF_ADDER.gate, HALF_ADDER);
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 4, y: 10 }, "A")!.id;
    const b = placeNode(game, "INPUT", { x: 4, y: 20 }, "B")!.id;
    const lamp = placeNode(game, "OUTPUT", { x: 40, y: 10 }, "OUT")!.id;
    const half = placeNode(game, HALF_ADDER.gate, { x: 20, y: 20 })!;
    expect(half.signals).toEqual([false, false]);
    expect(pinPosition(half, "out", 0).y).toBeLessThan(pinPosition(half, "out", 1).y);
    const not = gate(game, "NOT");
    wire(game, out(a), inp(half.id, 0));
    wire(game, out(b), inp(half.id, 1));
    wire(game, out(half.id, 1), inp(not));
    wire(game, out(half.id, 0), inp(lamp));
    const seen = [false, true].flatMap((va) =>
      [false, true].map((vb) => {
        setInput(game, a, va);
        setInput(game, b, vb);
        return [...half.signals, game.nodes.get(not)!.isHigh, game.nodes.get(lamp)!.isHigh];
      }),
    );
    expect(seen).toEqual([
      [false, false, true, false],
      [true, false, true, true],
      [true, false, true, true],
      [false, true, false, false],
    ]);
  });
});
