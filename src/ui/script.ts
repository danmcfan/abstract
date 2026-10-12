import type { Level } from "../sim/level";
import type { NodeType } from "../sim/node";
import type { Line } from "./speech";

// Everything the robot says. It talks in short lines, one idea each.

const CONTROLS: Line = {
  face: "idle",
  text: "Click a part in the bin to put it on the board, then drag it where you like. Drag from pin to pin to wire. Right-click a gate to throw it away.",
};

interface LevelScript {
  // The first time the level opens.
  intro: Line[];
  // When the player asks for help.
  hint: Line[];
  // The first time it's solved.
  solved: Line[];
}

const LEVELS: Partial<Record<NodeType, LevelScript>> = {
  NAND: {
    intro: [
      { face: "loading", text: "Booting up. Memory banks: mostly empty." },
      { face: "amazed", text: "Oh! Hello! I'm Bitbox. You found the breaker." },
      { face: "worried", text: "We're locked in the factory. The exit only opens for a program, and I don't know how to build one." },
      { face: "thinking", text: "I do remember one schematic: the NAND gate. I've wired it up on the board." },
      { face: "idle", text: "Click the switches, A and B, and watch the lamp. Then press Run test to try every combination." },
    ],
    hint: [{ face: "idle", text: "Click A and B to flip them and watch the lamp. Press Run test to check every row of the table." }],
    solved: [
      { face: "happy", text: "Boom! The lamp stays on unless A and B are both on. That's a NAND gate." },
      { face: "amazed", text: "Here's the secret: every other chip can be built out of NANDs. Even a whole computer." },
      { face: "idle", text: "NAND is in your parts bin now. Press Next level when you're ready." },
    ],
  },
  NOT: {
    intro: [
      { face: "idle", text: "First job: NOT. It flips a signal. On goes in, off comes out." },
      CONTROLS,
      { face: "thinking", text: "Hint: a NAND has two inputs, but nothing says they need different wires." },
    ],
    hint: [{ face: "thinking", text: "Try wiring A into both of a NAND's inputs. What does it do when both are on?" }, CONTROLS],
    solved: [{ face: "happy", text: "NOT, done! It's in your parts bin now, so you never have to build it again." }],
  },
  AND: {
    intro: [{ face: "thinking", text: "AND is on only when A and B are both on. That's NAND, just flipped. You know how to flip things now." }],
    hint: [{ face: "thinking", text: "A NAND gives the opposite of AND. Put something after it that flips the answer." }, CONTROLS],
    solved: [{ face: "happy", text: "AND, filed. My memory banks feel roomier already." }],
  },
  OR: {
    intro: [
      { face: "thinking", text: "OR is on when A is on, or B is, or both." },
      { face: "thinking", text: "Tricky one. What would a NAND do if you flipped both of its inputs first?" },
    ],
    hint: [{ face: "thinking", text: "Flip A and flip B, then send both into a NAND. Check it against the table." }, CONTROLS],
    solved: [{ face: "happy", text: "OR, done! Next up is its pickier cousin." }],
  },
  XOR: {
    intro: [
      { face: "thinking", text: "XOR means one or the other, but not both." },
      { face: "idle", text: "Four NANDs should do it. You can use the other parts in the bin too." },
    ],
    hint: [
      { face: "thinking", text: "Start with a NAND of A and B. It's off only when both are on." },
      { face: "thinking", text: "NAND that with A, and again with B. Then NAND those two answers together." },
      CONTROLS,
    ],
    solved: [{ face: "amazed", text: "New schematic saved: XOR. One or the other, never both." }],
  },
  MUX: {
    intro: [
      { face: "thinking", text: "Three inputs this time. A MUX picks which signal gets through." },
      { face: "idle", text: "When SEL is off, OUT copies A. When SEL is on, OUT copies B." },
      { face: "thinking", text: "Two questions: is A on while SEL is off? Is B on while SEL is on?" },
    ],
    hint: [{ face: "thinking", text: "Build A AND NOT SEL, and B AND SEL. Then OR the two together." }, CONTROLS],
    solved: [
      { face: "amazed", text: "MUX, done! A switch you flip with a wire instead of a finger." },
      { face: "happy", text: "There are more floors to this factory. We'll get there, partner." },
    ],
  },
};

export const intro = (level: Level): Line[] => LEVELS[level.gate]?.intro ?? [];

export const solved = (level: Level): Line[] => LEVELS[level.gate]?.solved ?? [{ face: "happy", text: `${level.gate}, done!` }];

export const help = (level: Level): Line[] => [
  { face: "idle", text: level.prebuilt ? `This is ${level.gate}. ${level.goal}` : `We're building ${level.gate}. ${level.goal}` },
  ...(LEVELS[level.gate]?.hint ?? [CONTROLS]),
];

export const failed: Line[] = [
  { face: "error", text: "Bzzt! Some rows don't match. The ✗ marks show which ones." },
  { face: "idle", text: "Flip the switches yourself to see what your circuit really does." },
];

export const forbidden = (types: NodeType[]): Line[] => [
  { face: "worried", text: `${types.join(" and ")} isn't allowed on this level yet. Stick to the parts in the bin.` },
];

export const welcomeBack = (level: Level): Line[] => [
  { face: "happy", text: level.prebuilt ? `Welcome back! We were looking at ${level.gate}.` : `Welcome back! We were building ${level.gate}.` },
];
