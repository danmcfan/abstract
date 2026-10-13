import { describe, expect, test } from "bun:test";
import { blend, pose, REST, type Pose } from "./clips";
import { EXPRESSIONS } from "./expression";

const numbers = (p: Pose) => [
  ...Object.values(p).filter((v): v is number => typeof v === "number"),
  ...Object.values(p.leftArm),
  ...Object.values(p.rightArm),
];

describe("clips", () => {
  test("every expression poses the whole robot, for as long as it plays", () => {
    for (const expression of EXPRESSIONS) {
      for (const t of [0, 0.1, 0.5, 2, 30]) {
        const p = pose(expression, t);
        expect(Object.keys(p).sort()).toEqual(Object.keys(REST).sort());
        expect(numbers(p).every(Number.isFinite)).toBe(true);
        expect(p.led).toBeGreaterThanOrEqual(0);
        expect(p.led).toBeLessThanOrEqual(1);
      }
    }
  });

  test("expressions hold themselves differently", () => {
    const at = (e: (typeof EXPRESSIONS)[number]) => JSON.stringify(pose(e, 1));
    expect(new Set(EXPRESSIONS.map(at)).size).toBe(EXPRESSIONS.length);
  });

  test("blending starts at one pose and ends at the other", () => {
    const a = pose("happy", 0.3);
    const b = pose("sleepy", 0.3);
    const near = (x: Pose, y: Pose) => {
      numbers(x).forEach((v, i) => expect(v).toBeCloseTo(numbers(y)[i]!));
    };
    near(blend(a, b, 0), a);
    near(blend(a, b, 1), b);
    expect(blend(a, b, 0.5).leftArm.raise).toBeCloseTo((a.leftArm.raise + b.leftArm.raise) / 2);
  });
});
