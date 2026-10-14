import { describe, expect, test } from "bun:test";
import { kindOf, kinds, partsFrom, pinOffset } from "./kind";
import { PARTS } from "./level";
import type { NodeType, Value } from "./node";

// What each kind the game uses should be, at one width (1 unless given):
// its pin widths in order, its size, and some inputs with the outputs they
// give.
interface Expected {
  width?: number;
  ins: number[];
  outs: number[];
  size: [number, number];
  cases: [Value[], Value[]][];
}

const EXPECTED: Record<NodeType, Expected[]> = {
  INPUT: [
    { ins: [], outs: [1], size: [4, 4], cases: [] },
    { width: 8, ins: [], outs: [8], size: [13, 4], cases: [] },
  ],
  OUTPUT: [
    { ins: [1], outs: [], size: [4, 4], cases: [] },
    { width: 4, ins: [4], outs: [], size: [9, 4], cases: [] },
  ],
  SPLIT: [
    {
      width: 4,
      ins: [4],
      outs: [1, 1, 1, 1],
      size: [3, 8],
      // A split gives a bus's signals high bit first.
      cases: [[[0b1010], [1, 0, 1, 0]]],
    },
  ],
  JOIN: [{ width: 4, ins: [1, 1, 1, 1], outs: [4], size: [3, 8], cases: [[[1, 0, 1, 0], [0b1010]]] }],
  NAND: [
    {
      ins: [1, 1],
      outs: [1],
      size: [6, 4],
      cases: [
        [[1, 1], [0]],
        [[1, 0], [1]],
      ],
    },
  ],
  NOT: [{ ins: [1], outs: [1], size: [6, 4], cases: [[[0], [1]]] }],
  AND: [{ ins: [1, 1], outs: [1], size: [5, 4], cases: [[[1, 1], [1]]] }],
  OR: [{ ins: [1, 1], outs: [1], size: [5, 4], cases: [[[0, 1], [1]]] }],
  XOR: [
    {
      ins: [1, 1],
      outs: [1],
      size: [5, 4],
      cases: [
        [[1, 0], [1]],
        [[1, 1], [0]],
      ],
    },
  ],
  MUX: [{ ins: [1, 1, 1], outs: [1], size: [6, 6], cases: [[[0, 1, 1], [1]]] }],
  DEMUX: [
    {
      ins: [1, 1],
      outs: [1, 1],
      size: [6, 4],
      cases: [
        [
          [1, 1],
          [0, 1],
        ],
      ],
    },
  ],
  "HALF ADDER": [
    {
      ins: [1, 1],
      outs: [1, 1],
      size: [6, 4],
      cases: [
        [
          [1, 1],
          [0, 1],
        ],
      ],
    },
  ],
  "FULL ADDER": [
    {
      ins: [1, 1, 1],
      outs: [1, 1],
      size: [6, 6],
      cases: [
        [
          [1, 0, 1],
          [0, 1],
        ],
      ],
    },
  ],
  "2-BIT ADDER": [
    {
      ins: [2, 2, 1],
      outs: [2, 1],
      size: [6, 6],
      cases: [
        [
          [3, 1, 0],
          [0, 1],
        ],
      ],
    },
  ],
  "8-BIT ADDER": [
    {
      ins: [8, 8, 1],
      outs: [8, 1],
      size: [6, 6],
      cases: [
        [
          [255, 1, 0],
          [0, 1],
        ],
      ],
    },
  ],
  "2-BIT MUX": [{ ins: [2, 2, 1], outs: [2], size: [6, 6], cases: [[[1, 2, 1], [2]]] }],
  "2-BIT ALU": [
    {
      ins: [2, 2, 3],
      outs: [2],
      size: [6, 6],
      cases: [[[1, 2, 1], [3]]],
    },
  ],
  MUX8: [
    {
      ins: [8, 8, 1],
      outs: [8],
      size: [6, 6],
      cases: [
        [[12, 200, 0], [12]],
        [[12, 200, 1], [200]],
      ],
    },
  ],
  MUX4: [
    {
      ins: [1, 1, 1, 1, 2],
      outs: [1],
      size: [6, 10],
      cases: [
        [[0, 0, 1, 0, 2], [1]],
        [[1, 1, 0, 1, 2], [0]],
      ],
    },
  ],
  "ADD/SUB": [
    {
      ins: [1, 1, 1, 1],
      outs: [1, 1],
      size: [6, 8],
      cases: [
        [
          [1, 1, 0, 0],
          [0, 1],
        ],
        [
          [1, 1, 1, 1],
          [0, 1],
        ],
      ],
    },
  ],
  "LOGIC UNIT": [
    {
      ins: [1, 1, 2],
      outs: [1],
      size: [6, 6],
      cases: [
        [[1, 0, 1], [1]],
        [[1, 1, 2], [0]],
      ],
    },
  ],
  "ALU SLICE": [
    {
      ins: [1, 1, 1, 3],
      outs: [1, 1],
      size: [6, 8],
      cases: [
        [
          [1, 1, 0, 0],
          [0, 1],
        ],
      ],
    },
  ],
  ALU: [
    {
      ins: [8, 8, 3],
      outs: [8],
      size: [6, 6],
      cases: [[[3, 5, 1], [254]]],
    },
  ],
};

describe("every kind the game uses", () => {
  for (const kind of kinds(PARTS)) {
    test(kind.type, () => {
      const expected = EXPECTED[kind.type];
      expect(expected).toBeDefined();
      for (const { width = 1, ins, outs, size, cases } of expected ?? []) {
        expect(Array.from({ length: kind.inputCount(width) }, (_, i) => kind.pinWidth("in", i, width))).toEqual(ins);
        expect(Array.from({ length: kind.outputCount(width) }, (_, i) => kind.pinWidth("out", i, width))).toEqual(outs);
        expect(kind.size(width)).toEqual({ width: size[0], height: size[1] });
        for (const [inputs, outputs] of cases) expect(kind.evaluate(inputs, width)).toEqual(outputs);
      }
    });
  }
});

test("only terminals can't be removed, and only an input can be clicked", () => {
  const fixed = kinds(PARTS).filter((kind) => !kind.removable);
  expect(fixed.map((kind) => kind.terminal)).toEqual(["input", "output"]);
  expect(kinds(PARTS).filter((kind) => kind.clickable)).toEqual([kindOf(PARTS, "INPUT")]);
});

describe("a registry made from levels", () => {
  const parts = partsFrom([
    {
      gate: "ADD2",
      inputs: ["A", "B"],
      outputs: ["SUM", "COUT"],
      widths: { A: 2, B: 2, SUM: 2 },
      target: ([a = 0, b = 0]): Value[] => [a + b, (a + b) >> 2],
    },
  ]);

  test("holds a part for each level, with its pin widths, masking each output to its pin", () => {
    const add = kindOf(parts, "ADD2");
    expect([add.pinWidth("in", 0, 1), add.pinWidth("in", 1, 1), add.pinWidth("out", 1, 1)]).toEqual([2, 2, 1]);
    expect(add.evaluate([3, 3], 1)).toEqual([0b10, 1]);
    expect(add.look).toEqual({ shape: "box", inputs: ["A", "B"], outputs: ["SUM", "COUT"], flare: 0 });
  });

  test("knows only its own parts, beside terminals and wiring", () => {
    expect(kinds(parts).map((kind) => kind.type)).toEqual(["INPUT", "OUTPUT", "SPLIT", "JOIN", "ADD2"]);
    expect(() => kindOf(parts, "NAND")).toThrow();
  });

  test("spaces a side's pins two cells apart, centred on the edge", () => {
    const add = kindOf(parts, "ADD2");
    expect([pinOffset(add, "in", 0), pinOffset(add, "in", 1)]).toEqual([1, 3]);
  });
});
