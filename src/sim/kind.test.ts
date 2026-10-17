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
  // A constant gives its signal whatever happens.
  ON: [{ ins: [], outs: [1], size: [4, 4], cases: [[[], [1]]] }],
  OFF: [{ ins: [], outs: [1], size: [4, 4], cases: [[[], [0]]] }],
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
  // A memory part's outputs come from its state, all 0 before a tick.
  "SR LATCH": [{ ins: [1, 1], outs: [1], size: [6, 4], cases: [[[1, 0], [0]]] }],
  "D LATCH": [{ ins: [1, 1], outs: [1], size: [6, 4], cases: [[[1, 1], [0]]] }],
  "D FLIP-FLOP": [{ ins: [1, 1], outs: [1], size: [6, 4], cases: [[[1, 1], [0]]] }],
  BIT: [{ ins: [1, 1, 1], outs: [1], size: [6, 6], cases: [[[1, 1, 1], [0]]] }],
  "2-BIT REGISTER": [{ ins: [1, 1, 2], outs: [2], size: [6, 6], cases: [[[1, 1, 3], [0]]] }],
  REGISTER: [{ ins: [1, 1, 8], outs: [8], size: [6, 6], cases: [[[1, 1, 200], [0]]] }],
  DEMUX4: [
    {
      ins: [1, 2],
      outs: [1, 1, 1, 1],
      size: [6, 8],
      cases: [
        [
          [1, 2],
          [0, 0, 1, 0],
        ],
      ],
    },
  ],
  "4-WAY MUX8": [
    {
      ins: [8, 8, 8, 8, 2],
      outs: [8],
      size: [6, 10],
      cases: [[[10, 20, 30, 40, 2], [30]]],
    },
  ],
  "2-REGISTER FILE": [
    {
      ins: [1, 1, 1, 8, 1, 1],
      outs: [8, 8],
      size: [6, 12],
      cases: [
        [
          [1, 1, 1, 200, 1, 0],
          [0, 0],
        ],
      ],
    },
  ],
  "REGISTER FILE": [
    {
      ins: [1, 1, 2, 8, 2, 2],
      outs: [8, 8],
      size: [6, 12],
      cases: [
        [
          [1, 1, 0, 200, 0, 0],
          [0, 0],
        ],
      ],
    },
  ],
  RAM: [{ ins: [1, 1, 8, 8], outs: [8], size: [6, 8], cases: [[[1, 1, 7, 200], [0]]] }],
  "PROGRAM COUNTER": [{ ins: [1, 1, 8], outs: [8], size: [6, 6], cases: [[[1, 1, 200], [0]]] }],
  "3-TO-8 DECODER": [{ ins: [3], outs: [8], size: [6, 4], cases: [[[5], [32]]] }],
  "4-BIT ZERO TEST": [
    {
      ins: [4],
      outs: [1],
      size: [6, 4],
      cases: [
        [[0], [1]],
        [[8], [0]],
      ],
    },
  ],
  NONE: [
    {
      ins: [1, 1, 1, 1, 1, 1, 1, 1],
      outs: [1],
      size: [6, 16],
      cases: [
        [[0, 0, 0, 0, 0, 0, 0, 0], [1]],
        [[0, 0, 0, 1, 0, 0, 0, 0], [0]],
      ],
    },
  ],
  "ZERO TEST": [
    {
      ins: [8],
      outs: [1],
      size: [6, 4],
      cases: [
        [[0], [1]],
        [[128], [0]],
      ],
    },
  ],
  "4-TO-16 DECODER": [
    {
      ins: [4],
      outs: [8, 8],
      size: [6, 4],
      cases: [
        [[3], [8, 0]],
        [[9], [0, 2]],
      ],
    },
  ],
  SEQUENCER: [{ ins: [1], outs: [1], size: [6, 4], cases: [[[1], [0]]] }],
  STEPPER: [{ ins: [1, 1], outs: [1], size: [6, 4], cases: [[[1, 1], [0]]] }],
  "PROGRAM MEMORY": [{ ins: [8], outs: [8, 8], size: [8, 6], cases: [[[3], [0, 0]]] }],
  // Bitbox's set: opcode 3 is add, 1 is set and 11 is jump.
  "OP ENCODER": [{ ins: [4], outs: [3], size: [6, 4], cases: [[[3], [0]]] }],
  "WRITE ENCODER": [{ ins: [4], outs: [1, 2], size: [6, 4], cases: [[[1], [1, 1]]] }],
  "CONTROL UNIT": [
    {
      ins: [4, 8],
      outs: [1, 1, 1, 1, 1],
      size: [6, 10],
      cases: [
        [
          [11, 5],
          [0, 1, 0, 0, 0],
        ],
      ],
    },
  ],
  "INSTRUCTION REGISTER": [
    {
      ins: [1, 1, 8],
      outs: [4, 2, 2],
      size: [6, 6],
      cases: [
        [
          [0, 1, 5],
          [0, 0, 0],
        ],
      ],
    },
  ],
  "REGISTER UNIT": [
    {
      ins: [1, 4, 2, 2, 8, 8, 8, 1],
      outs: [8],
      size: [6, 16],
      cases: [[[0, 1, 1, 0, 5, 0, 0, 0], [0]]],
    },
  ],
  "EXECUTE UNIT": [
    {
      ins: [1, 4, 2, 2, 8, 8],
      outs: [1, 1, 8, 1, 1],
      size: [6, 12],
      cases: [
        [
          [0, 11, 1, 0, 7, 0],
          [1, 0, 0, 0, 0],
        ],
      ],
    },
  ],
  // Blank program memory holds HALT, opcode 0 in Bitbox's set.
  CPU: [
    {
      ins: [1, 8],
      outs: [1, 8, 8, 1, 1],
      size: [6, 10],
      cases: [
        [
          [0, 0],
          [0, 0, 0, 0, 1],
        ],
      ],
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
    expect(kinds(parts).map((kind) => kind.type)).toEqual([
      "INPUT",
      "OUTPUT",
      "SPLIT",
      "JOIN",
      "ON",
      "OFF",
      "PROGRAM MEMORY",
      "ADD2",
    ]);
    expect(() => kindOf(parts, "NAND")).toThrow();
  });

  test("spaces a side's pins two cells apart, centred on the edge", () => {
    const add = kindOf(parts, "ADD2");
    expect([pinOffset(add, "in", 0), pinOffset(add, "in", 1)]).toEqual([1, 3]);
  });
});
