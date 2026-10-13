import type { Expression } from "./expression";
import { mix, progress, smoothstep } from "./timeline";

// Everything about how the robot holds itself, as plain numbers so poses can
// be blended. Arms are named as you look at the robot: left is -x.
export interface Pose {
  // Along the tread, in x.
  slide: number;
  // Lifts the torso off the tread.
  hop: number;
  // Vertical squash of the torso, 0 is none.
  squash: number;
  // Torso tilt, forward is positive.
  lean: number;
  // Torso tilt sideways.
  roll: number;
  // Whole robot yaw.
  turn: number;
  // Head tilt forward.
  nod: number;
  // Head tilt sideways.
  tilt: number;
  // Head yaw.
  look: number;
  leftArm: Arm;
  rightArm: Arm;
  // Spring bend, sideways.
  antenna: number;
  // Spring stretch, 1 is rest.
  spring: number;
  // Antenna light, 0 to 1.
  led: number;
  // Tread wheel angle.
  wheels: number;
}

// raise swings the arm out to the side, reach swings it forward, bend
// folds the forearm forward at the elbow.
export interface Arm {
  raise: number;
  reach: number;
  bend: number;
}

export const REST: Pose = {
  slide: 0,
  hop: 0,
  squash: 0,
  lean: 0,
  roll: 0,
  turn: 0,
  nod: 0,
  tilt: 0,
  look: 0,
  leftArm: { raise: 0.35, reach: 0, bend: 0.25 },
  rightArm: { raise: 0.35, reach: 0, bend: 0.25 },
  antenna: 0,
  spring: 1,
  led: 0.6,
  wheels: 0,
};

// How the robot holds itself for each expression, as a function of the time
// since the clip began. Clips loop forever; the stage blends from one to the
// next. Plain math, so they're cheap to sample and easy to test.

const { sin, abs } = Math;
const ease = (start: number, end: number, t: number): number => smoothstep(progress(t, start, end));
const arm = (raise: number, reach: number, bend: number): Arm => ({ raise, reach, bend });
// Wheel angle that matches sliding the tread by dx.
const roll = (dx: number): number => -dx / 0.085;

const CLIPS: Record<Expression, (t: number) => Partial<Pose>> = {
  idle: (t) => ({
    hop: 0.012 * sin(t * 2.2),
    look: 0.14 * sin(t * 0.5),
    tilt: 0.05 * sin(t * 0.9),
    leftArm: arm(0.35 + 0.05 * sin(t * 2.2), 0.05 * sin(t * 1.1), 0.25),
    rightArm: arm(0.35 + 0.05 * sin(t * 2.2 + 1), -0.05 * sin(t * 1.1), 0.25),
    antenna: 0.08 * sin(t * 1.7),
    led: 0.6,
  }),

  // Bounces on its tread and waves the claw.
  happy: (t) => {
    const bounce = abs(sin(t * 6));
    return {
      hop: 0.07 * bounce,
      squash: 0.05 * (1 - bounce) - 0.02,
      tilt: 0.1 * sin(t * 3),
      nod: -0.1,
      leftArm: arm(0.7 + 0.1 * bounce, 0.1, 0.3),
      rightArm: arm(2.5 + 0.25 * sin(t * 9), 0, 0.15 + 0.25 * sin(t * 9 + 0.6)),
      antenna: 0.25 * sin(t * 9),
      spring: 1 + 0.15 * sin(t * 12),
      led: 1,
    };
  },

  // Backs off a little, hunches, and wrings its hands.
  worried: (t) => {
    const back = -0.12 * ease(0, 0.6, t) + 0.015 * sin(t * 18);
    const tremble = 0.03 * sin(t * 30);
    return {
      slide: back,
      wheels: roll(back),
      squash: 0.06,
      lean: -0.06,
      nod: 0.16,
      look: 0.1 * sin(t * 1.3),
      leftArm: arm(0.15, 0.75 + tremble, 1.35),
      rightArm: arm(0.15, 0.75 - tremble, 1.35),
      antenna: 0.18 + tremble,
      spring: 0.92,
      led: 0.35 + 0.1 * sin(t * 9),
    };
  },

  // Claw to chin, head cocked, looking up.
  thinking: (t) => ({
    tilt: 0.16,
    look: -0.18,
    nod: -0.12 + 0.03 * sin(t * 1.5),
    rightArm: arm(0.45, 0.95, 2.05 + 0.08 * sin(t * 6)),
    leftArm: arm(0.2, 0.35, 1.2),
    antenna: 0.1 * sin(t * 1.3),
    led: 0.5 + 0.5 * sin(t * 3),
  }),

  // Short circuit: shakes in bursts, flails, antenna sparking.
  error: (t) => {
    const burst = sin(t * 5) > 0 ? 1 : 0.25;
    const shake = 0.035 * burst * sin(t * 55);
    return {
      slide: shake,
      wheels: roll(shake),
      roll: 0.05 * burst * sin(t * 40),
      nod: 0.08 * burst * sin(t * 27),
      tilt: 0.12 * sin(t * 3.1),
      leftArm: arm(1 + 0.35 * sin(t * 17), 0.2, 0.6 + 0.4 * sin(t * 13)),
      rightArm: arm(1 + 0.35 * sin(t * 15 + 1), 0.2, 0.6 + 0.4 * sin(t * 11)),
      antenna: 0.35 * burst * sin(t * 23),
      spring: 1 + 0.25 * abs(sin(t * 15)),
      led: sin(t * 31) > 0 ? 1 : 0.1,
    };
  },

  // Slumps forward, breathing slowly.
  sleepy: (t) => {
    const breath = sin(t * 1.1);
    return {
      hop: 0.008 * breath,
      squash: 0.05 - 0.015 * breath,
      lean: 0.12,
      nod: 0.36 + 0.05 * breath,
      tilt: 0.12,
      leftArm: arm(0.12, 0, 0.1),
      rightArm: arm(0.12, 0, 0.1),
      antenna: 0.5,
      spring: 0.88,
      led: 0.15 + 0.1 * breath,
    };
  },

  // Jumps back with both arms up.
  amazed: (t) => {
    const jump = ease(0, 0.25, t);
    return {
      hop: 0.06 * jump * (1 - 0.3 * ease(0.25, 0.6, t)) + 0.006 * sin(t * 24),
      lean: -0.15 * jump,
      nod: -0.2 * jump,
      leftArm: arm(1.9 * jump, 0.3, 0.6),
      rightArm: arm(1.9 * jump, 0.3, 0.6),
      antenna: 0.06 * sin(t * 14),
      spring: mix(1, 1.25, jump),
      led: 1,
    };
  },

  // Holds still and hums while it thinks hard.
  loading: (t) => ({
    hop: 0.004 * sin(t * 20),
    nod: 0.1,
    leftArm: arm(0.2, 0, 0.2),
    rightArm: arm(0.2, 0, 0.2),
    led: sin(t * 6) > 0 ? 1 : 0.3,
  }),
};

export function pose(expression: Expression, time: number): Pose {
  return { ...REST, ...CLIPS[expression](time) };
}

// Partway from one pose to another, for the blend between clips.
export function blend(a: Pose, b: Pose, t: number): Pose {
  const arms = (x: Arm, y: Arm): Arm => ({
    raise: mix(x.raise, y.raise, t),
    reach: mix(x.reach, y.reach, t),
    bend: mix(x.bend, y.bend, t),
  });
  const at = (key: Exclude<keyof Pose, "leftArm" | "rightArm">): number => mix(a[key], b[key], t);
  return {
    slide: at("slide"),
    hop: at("hop"),
    squash: at("squash"),
    lean: at("lean"),
    roll: at("roll"),
    turn: at("turn"),
    nod: at("nod"),
    tilt: at("tilt"),
    look: at("look"),
    leftArm: arms(a.leftArm, b.leftArm),
    rightArm: arms(a.rightArm, b.rightArm),
    antenna: at("antenna"),
    spring: at("spring"),
    led: at("led"),
    wheels: at("wheels"),
  };
}
