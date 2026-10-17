import { describe, expect, test } from "bun:test";
import { newGame, pinPosition, placeNode, setInput, terminalNamed, tick, wire, type Game, type Pin } from "./circuit";
import {
  buildSolution,
  checkLevel,
  floorAbove,
  hasClock,
  circuits,
  LAYERS,
  layerLevels,
  levelAt,
  levelId,
  revisionOf,
  partGiven,
  solvedCount,
  layerState,
  LEVELS,
  loadLevel,
  matches,
  partsBin,
  PARTS,
  solutionWires,
  testTable,
  truthTable,
  wiring,
  type Level,
  circuitAt,
  partsOf,
} from "./level";
import { kindOf } from "./kind";
import { loadBoard, saveBoard } from "./save";
import type { Label, NodeID, NodeType } from "./node";

const out = (node: NodeID, index = 0): Pin => ({ node, side: "out", index });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });

function terminal(game: Game, type: NodeType, label: Label): NodeID {
  return terminalNamed(game, type === "INPUT" ? "input" : "output", label)?.id ?? -1;
}

let spot = 0;
function gate(game: Game, type: NodeType): NodeID {
  spot += 1;
  return placeNode(game, type, { x: 10 + (spot % 4) * 7, y: 5 + Math.floor(spot / 4) * 6 })!.id;
}

function levelGame(index: number): { game: Game; a: NodeID; b: NodeID; sel: NodeID; o: NodeID } {
  const game = loadLevel(circuitAt(index));
  return {
    game,
    a: terminal(game, "INPUT", "A"),
    b: terminal(game, "INPUT", "B"),
    sel: terminal(game, "INPUT", "SEL"),
    o: terminal(game, "OUTPUT", "OUT"),
  };
}

const levelIndex = (type: NodeType): number => LEVELS.findIndex((level) => levelId(level) === type);

describe("each level's intended solution", () => {
  const unbuilt = LEVELS.flatMap((level, index) =>
    level.kind !== undefined || level.prebuilt === true ? [] : [{ level, index }],
  );

  // The NAND sheet is the one Bitbox remembers; every later level is built.
  test("only the first level comes pre-wired", () => {
    expect(
      LEVELS.flatMap((level, index) => (level.kind === undefined && level.prebuilt === true ? [index] : [])),
    ).toEqual([0]);
  });

  test("every level the player builds has one", () => {
    expect(unbuilt.filter(({ level }) => level.solution === undefined).map(({ level }) => levelId(level))).toEqual([]);
  });

  // Every node the solution places counts, and every wire, terminals' too (ADR 11).
  // Levels still over the limit while #72 redesigns them; each PR there
  // removes its level from this list.
  const overLimit = ["CPU"];
  test.each(unbuilt.map(({ level }) => [levelId(level), level] as const))(
    "%s keeps within 7 nodes and 20 wires unless listed over the limit",
    (id, level) => {
      const nodes = level.solution?.nodes.length ?? 0;
      const wires = level.solution?.wires.length ?? 0;
      expect({ nodes, wires, within: nodes <= 7 && wires <= 20 }).toMatchObject({
        within: !overLimit.includes(id),
      });
    },
  );

  test("every over-limit level is a level", () => {
    expect(overLimit.filter((id) => !unbuilt.some(({ level }) => levelId(level) === id))).toEqual([]);
  });

  // Passing includes using only the parts bin and the level's Wiring (ADR 5).
  test.each(unbuilt.map(({ level, index }) => [levelId(level), index] as const))(
    "%s builds onto its board and passes",
    (_, index) => {
      const game = loadLevel(circuitAt(index));
      buildSolution(game, circuitAt(index));
      const result = checkLevel(game, index);
      expect(result.forbidden).toEqual([]);
      expect(result.passed).toBe(true);
    },
  );

  // A memory part starts at 0 however the player left the switches (#73).
  test.each(unbuilt.map(({ level, index }) => [levelId(level), index] as const))(
    "%s passes with every switch left on",
    (_, index) => {
      const level = circuitAt(index);
      const game = loadLevel(level);
      buildSolution(game, level);
      for (const label of level.inputs) {
        const node = terminalNamed(game, "input", label)!;
        setInput(game, node.id, 2 ** node.width - 1);
      }
      expect(checkLevel(game, index).passed).toBe(true);
    },
  );

  test("a wire names a terminal by its label and a placed node by its name, with :n for its nth pin", () => {
    const level: Level = {
      ...circuitAt(1),
      solution: {
        nodes: [{ name: "nand", type: "NAND", x: 22, y: 20 }],
        wires: [
          ["A", "nand"],
          ["A", "nand:1"],
          ["nand", "OUT"],
        ],
      },
    };
    const game = loadLevel(level);
    const nand = placeNode(game, "NAND", { x: 22, y: 20 })!.id;
    const a = terminal(game, "INPUT", "A");
    expect(solutionWires(game, level, [nand])).toEqual([
      { from: out(a), to: inp(nand, 0) },
      { from: out(a), to: inp(nand, 1) },
      { from: out(nand), to: inp(terminal(game, "OUTPUT", "OUT")) },
    ]);
  });
});

describe("solutions", () => {
  test("the NAND level comes wired and passes as is", () => {
    const { game } = levelGame(0);
    expect([...game.nodes.values()].map((node) => node.type)).toContain("NAND");
    expect(game.edges.size).toBe(3);
    expect(checkLevel(game, 0).passed).toBe(true);
  });
});

test("XOR comes after OR and is on when exactly one input is on", () => {
  const index = LEVELS.findIndex((level) => levelId(level) === "XOR");
  expect(levelId(LEVELS[index - 1]!)).toBe("OR");
  expect(truthTable(circuitAt(index))).toEqual([
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
    const rows = truthTable(circuitAt(index));
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

  test("comes straight after MUX, as the last level on the logic line", () => {
    expect(levelId(LEVELS[index - 1]!)).toBe("MUX");
    expect(floorAbove(index)?.floor).toBe("adder assembly");
  });

  test("has inputs D and SEL and outputs Y0 and Y1", () => {
    const game = loadLevel(circuitAt(index));
    const labels = (type: NodeType): Label[] =>
      [...game.nodes.values()].filter((node) => node.type === type).map((node) => node.label);
    expect(labels("INPUT")).toEqual(["D", "SEL"]);
    expect(labels("OUTPUT")).toEqual(["Y0", "Y1"]);
  });

  test("its truth table sends D to Y0 when SEL is off and to Y1 when SEL is on", () => {
    expect(truthTable(circuitAt(index))).toEqual([
      { inputs: [0, 0], expected: [0, 0] },
      { inputs: [0, 1], expected: [0, 0] },
      { inputs: [1, 0], expected: [1, 0] },
      { inputs: [1, 1], expected: [0, 1] },
    ]);
  });

  test("once solved, DEMUX is a part with two output pins that does what its level asks", () => {
    expect(partsBin(index + 1)).toContain("DEMUX");
    expect(kindOf(PARTS, "DEMUX").outputCount(1)).toBe(2);
    expect(kindOf(PARTS, "DEMUX").look).toMatchObject({ inputs: ["D", "SEL"], outputs: ["Y0", "Y1"] });
    const game = loadLevel(circuitAt(index));
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

// The half adder: the first level with two outputs.
const HALF = levelIndex("HALF ADDER");
const HALF_ADDER = circuitAt(HALF);

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

describe("the adder levels", () => {
  const full = levelIndex("FULL ADDER");

  test("open L3 straight after DEMUX, half adder then full adder", () => {
    expect(HALF).toBe(levelIndex("DEMUX") + 1);
    expect(full).toBe(HALF + 1);
    expect(layerLevels(3).slice(0, 2)).toEqual([HALF, full]);
  });

  test("the half adder's SUM is A XOR B and its COUT is A AND B", () => {
    expect(HALF_ADDER.inputs).toEqual(["A", "B"]);
    expect(HALF_ADDER.outputs).toEqual(["SUM", "COUT"]);
    expect(truthTable(HALF_ADDER)).toEqual([
      { inputs: [0, 0], expected: [0, 0] },
      { inputs: [0, 1], expected: [1, 0] },
      { inputs: [1, 0], expected: [1, 0] },
      { inputs: [1, 1], expected: [0, 1] },
    ]);
  });

  test("the full adder adds A, B and CIN into SUM and COUT", () => {
    const level = circuitAt(full);
    expect(level.inputs).toEqual(["A", "B", "CIN"]);
    expect(level.outputs).toEqual(["SUM", "COUT"]);
    expect(truthTable(level).map((row) => row.expected)).toEqual(
      [0, 1, 1, 2, 1, 2, 2, 3].map((total) => [total & 1, total >> 1]),
    );
  });
});

// The 2-bit adder: the first level with buses, and the last on L3.
const ADD2 = levelIndex("2-BIT ADDER");

// A ripple-carry adder: split A and B into bits, chain two full adders from
// the low bit (the split's bottom pin) up, and join the sums. A missing
// carry leaves the high bit's full adder without its CIN wire.
function buildRippleAdder(game: Game, missingCarry = false): void {
  const place = (type: NodeType, x: number, y: number, width = 1): NodeID =>
    placeNode(game, type, { x, y }, "", width)!.id;
  const splitA = place("SPLIT", 12, 8, 2);
  const splitB = place("SPLIT", 12, 30, 2);
  const join = place("JOIN", 34, 15, 2);
  wire(game, out(terminal(game, "INPUT", "A")), inp(splitA));
  wire(game, out(terminal(game, "INPUT", "B")), inp(splitB));
  let carry = out(terminal(game, "INPUT", "CIN"));
  for (let bit = 0; bit < 2; bit++) {
    const pin = 1 - bit;
    const full = place("FULL ADDER", 22, 28 - bit * 14);
    wire(game, out(splitA, pin), inp(full, 0));
    wire(game, out(splitB, pin), inp(full, 1));
    if (!(missingCarry && bit === 1)) wire(game, carry, inp(full, 2));
    wire(game, out(full, 0), inp(join, pin));
    carry = out(full, 1);
  }
  wire(game, out(join), inp(terminal(game, "OUTPUT", "SUM")));
  wire(game, carry, inp(terminal(game, "OUTPUT", "COUT")));
}

describe("the 2-bit adder level", () => {
  const level = circuitAt(ADD2);

  test("comes after the full adder, as the last level of L3", () => {
    expect(ADD2).toBe(levelIndex("FULL ADDER") + 1);
    expect(layerLevels(3).at(-1)).toBe(ADD2);
  });

  test("adds bus A and B and a single CIN into bus SUM and a single COUT", () => {
    const game = loadLevel(level);
    const widths = [...game.nodes.values()].map((node) => [node.type, node.label, node.width]);
    expect(widths).toEqual([
      ["INPUT", "A", 2],
      ["INPUT", "B", 2],
      ["INPUT", "CIN", 1],
      ["OUTPUT", "SUM", 2],
      ["OUTPUT", "COUT", 1],
    ]);
  });

  test("supplies a 2-bit split and join in the Wiring section", () => {
    expect(wiring(level)).toEqual([
      { type: "SPLIT", width: 2 },
      { type: "JOIN", width: 2 },
    ]);
  });

  test("shows exactly its five named cases, as numbers", () => {
    expect(truthTable(level)).toEqual([
      { inputs: [0, 0, 0], expected: [0, 0] },
      { inputs: [1, 1, 0], expected: [2, 0] },
      { inputs: [2, 1, 0], expected: [3, 0] },
      { inputs: [3, 1, 0], expected: [0, 1] },
      { inputs: [3, 3, 1], expected: [3, 1] },
    ]);
  });

  test("a ripple-carry adder of two full adders passes", () => {
    const game = loadLevel(level);
    buildRippleAdder(game);
    const result = checkLevel(game, ADD2);
    expect(result.forbidden).toEqual([]);
    expect(result.hidden).toEqual({ checked: 32 - 5, failed: [] });
    expect(result.passed).toBe(true);
  });

  test("with the carry between the full adders missing, it fails, and the failing rows are in the result", () => {
    const game = loadLevel(level);
    buildRippleAdder(game, true);
    const result = checkLevel(game, ADD2);
    expect(result.passed).toBe(false);
    const wrong = result.rows.filter((row) => !matches(row.actual, row.expected));
    expect(wrong).toEqual([
      { inputs: [1, 1, 0], expected: [2, 0], actual: [0, 0] },
      { inputs: [3, 1, 0], expected: [0, 1], actual: [2, 0] },
      { inputs: [3, 3, 1], expected: [3, 1], actual: [1, 1] },
    ]);
    expect(result.hidden.failed.length).toBeGreaterThan(0);
  });

  test("once solved, it gives the 8-bit adder, not the 2-bit one", () => {
    expect(partsBin(ADD2 + 1)).toContain("8-BIT ADDER");
    expect(partsBin(ADD2 + 1)).not.toContain("2-BIT ADDER");
    const add = kindOf(PARTS, "8-BIT ADDER");
    expect([0, 1, 2].map((i) => add.pinWidth("in", i, 1))).toEqual([8, 8, 1]);
    expect([0, 1].map((i) => add.pinWidth("out", i, 1))).toEqual([8, 1]);
    expect(add.evaluate([200, 100, 1], 1)).toEqual([45, 1]);
  });
});

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
    expect(checkLevel(game, HALF).passed).toBe(true);
  });

  test("one wrong output fails, and the failing row reports the actual bits", () => {
    const game = loadLevel(HALF_ADDER);
    buildHalfAdder(game, "OR");
    const result = checkLevel(game, HALF);
    expect(result.passed).toBe(false);
    expect(result.rows.map((row) => row.actual)).toEqual([
      [0, 0],
      [1, 1],
      [1, 1],
      [0, 1],
    ]);
  });

  test("its part settles each output pin when wired on a later board", () => {
    const game = newGame(PARTS);
    const a = placeNode(game, "INPUT", { x: 4, y: 10 }, "A")!.id;
    const b = placeNode(game, "INPUT", { x: 4, y: 20 }, "B")!.id;
    const lamp = placeNode(game, "OUTPUT", { x: 40, y: 10 }, "OUT")!.id;
    const half = placeNode(game, HALF_ADDER.gate, { x: 20, y: 20 })!;
    expect(half.signals).toEqual([0, 0]);
    expect(pinPosition(game, half, "out", 0).y).toBeLessThan(pinPosition(game, half, "out", 1).y);
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

const stub = (layer: number): Level => ({ ...circuitAt(1), layer });

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
  });

  test("only a layer's last level leads up a floor, and only to a layer with levels", () => {
    expect(floorAbove(0, levels)).toBeNull();
    expect(floorAbove(1, levels)?.floor).toBe("the logic line");
    expect(floorAbove(2, levels)).toBeNull();
    expect(floorAbove(0)?.number).toBe(2);
    expect(floorAbove(LEVELS.length - 1)).toBeNull();
  });
});

// A memory level: a D flip-flop takes in D when CLK turns on. Its part
// keeps Q and the clock it last saw as its state.
const FLIP_FLOP: Level = {
  gate: "DFF",
  goal: "Q takes D's value when the clock turns on, and keeps it until the next tick.",
  layer: 5,
  inputs: ["D", "CLK"],
  outputs: ["Q"],
  memory: {
    next: ([d = 0, clk = 0], [q = 0, seen = 0]) => [clk && !seen ? d : q, clk],
    outputs: ([q = 0]) => [q],
  },
  steps: [
    { inputs: [1, 0], expected: [0] },
    { inputs: [1, 0], tick: true, expected: [1] },
    { inputs: [0, 0], expected: [1] },
    { inputs: [0, 0], tick: true, expected: [0] },
  ],
  prebuilt: true,
};

describe("a memory level", () => {
  const levels = [...LEVELS, FLIP_FLOP];
  const index = levels.length - 1;
  const parts = partsOf(levels);

  test("has a clock and shows its timing table", () => {
    expect(hasClock(FLIP_FLOP)).toBe(true);
    expect(hasClock(circuitAt(1))).toBe(false);
    expect(testTable(FLIP_FLOP)).toEqual(FLIP_FLOP.steps);
    expect(truthTable(FLIP_FLOP)).toEqual([]);
  });

  test("its timing table passes a correct board", () => {
    const result = checkLevel(loadLevel(FLIP_FLOP, parts), index, levels);
    expect(result.rows.map((row) => row.actual)).toEqual([[0], [1], [1], [0]]);
    expect(result.passed).toBe(true);
  });

  test("a wrong board fails at the step where it goes wrong", () => {
    // D straight to Q matches until D changes without a tick.
    const game = loadLevel({ ...FLIP_FLOP, prebuilt: false }, parts);
    wire(game, out(terminal(game, "INPUT", "D")), inp(terminal(game, "OUTPUT", "Q")));
    const result = checkLevel(game, index, levels);
    expect(result.passed).toBe(false);
    expect(result.rows.findIndex((row) => !matches(row.actual, row.expected))).toBe(0);
    expect(result.rows.map((row) => matches(row.actual, row.expected))).toEqual([false, true, false, true]);
  });

  test("every memory part starts at 0 on every test run, even after a run left it at 1", () => {
    const game = loadLevel(FLIP_FLOP, parts);
    const d = terminal(game, "INPUT", "D");
    const ff = [...game.nodes.values()].find((node) => node.type === "DFF")!;
    setInput(game, d, 1);
    tick(game, terminal(game, "INPUT", "CLK"));
    expect(ff.state[0]).toBe(1);
    const first = checkLevel(game, index, levels);
    const second = checkLevel(game, index, levels);
    expect(first.passed).toBe(true);
    expect(second).toEqual(first);
  });

  test("its state is 0 once the board loads from a save", () => {
    const game = loadLevel(FLIP_FLOP, parts);
    setInput(game, terminal(game, "INPUT", "D"), 1);
    tick(game, terminal(game, "INPUT", "CLK"));
    const loaded = loadBoard(saveBoard(game), parts);
    expect([...loaded.nodes.values()].find((node) => node.type === "DFF")!.state.some(Boolean)).toBe(false);
    expect(loaded.nodes.get(terminal(loaded, "OUTPUT", "Q"))!.isHigh).toBe(false);
  });
});

describe("an unstable board", () => {
  test("fails its test run with unstable set, whatever its outputs", () => {
    const game = loadLevel(circuitAt(1));
    const not = gate(game, "NAND");
    wire(game, out(terminal(game, "INPUT", "A")), inp(not, 0));
    wire(game, out(not), inp(not, 1));
    wire(game, out(not), inp(terminal(game, "OUTPUT", "OUT")));
    const result = checkLevel(game, 1);
    expect(result.unstable).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe("the instruction set level", () => {
  const index = LEVELS.findIndex((level) => level.kind === "instruction set");

  test("is the first level of L7, straight after the stepper", () => {
    expect(layerLevels(7)).toEqual([index]);
    expect(levelId(LEVELS[index - 1]!)).toBe("STEPPER");
    expect(floorAbove(index - 1)?.number).toBe(7);
  });

  test("adds no part to the parts bin", () => {
    expect(partGiven(levelAt(index))).toBeNull();
    expect(partsBin(index + 1)).toEqual(partsBin(index));
  });

  test("is solved by its own identifier", () => {
    expect(levelId(levelAt(index))).toBe("INSTRUCTION SET");
    const solved = Object.fromEntries(LEVELS.slice(0, index + 1).map((level) => [levelId(level), revisionOf(level)]));
    expect(solvedCount(solved)).toBe(index + 1);
  });
});

test("the adders and ADD/SUB name their outputs SUM and COUT", () => {
  for (const name of ["HALF ADDER", "FULL ADDER", "2-BIT ADDER", "ADD/SUB"]) {
    const level = circuits(LEVELS).find((l) => l.gate === name);
    expect(level?.outputs).toEqual(["SUM", "COUT"]);
  }
});
