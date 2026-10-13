import { describe, expect, test } from "bun:test";
import { blend, pose, REST, type Arm, type Pose } from "./clips";
import { EXPRESSIONS } from "./expression";

const arm = (a: Arm): number[] => [a.raise, a.reach, a.bend];

const numbers = (p: Pose): number[] => {
  return [...Object.values(p).filter((v): v is number => typeof v === "number"), ...arm(p.leftArm), ...arm(p.rightArm)];
};

const at = (e: (typeof EXPRESSIONS)[number]): string => JSON.stringify(pose(e, 1));

const near = (x: Pose, y: Pose): void => {
  const expected = numbers(y);
  numbers(x).forEach((v, i) => {
    expect(v).toBeCloseTo(expected[i]!);
  });
};

describe("clips", () => {
  test("every expression poses the whole robot, for as long as it plays", () => {
    for (const expression of EXPRESSIONS) {
      for (const t of [0, 0.1, 0.5, 2, 30]) {
        const p = pose(expression, t);
        expect(new Set(Object.keys(p))).toEqual(new Set(Object.keys(REST)));
        expect(numbers(p).every((n) => Number.isFinite(n))).toBe(true);
        expect(p.led).toBeGreaterThanOrEqual(0);
        expect(p.led).toBeLessThanOrEqual(1);
      }
    }
  });

  test("expressions hold themselves differently", () => {
    expect(new Set(EXPRESSIONS.map((e) => at(e))).size).toBe(EXPRESSIONS.length);
  });

  test("blending starts at one pose and ends at the other", () => {
    const a = pose("happy", 0.3);
    const b = pose("sleepy", 0.3);
    near(blend(a, b, 0), a);
    near(blend(a, b, 1), b);
    expect(blend(a, b, 0.5).leftArm.raise).toBeCloseTo((a.leftArm.raise + b.leftArm.raise) / 2);
  });
});
