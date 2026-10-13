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
      {
        face: "worried",
        text: "We're locked in the factory. The exit only opens for a program, and I don't know how to build one.",
      },
      { face: "thinking", text: "I do remember one schematic: the NAND gate. I've wired it up on the board." },
      {
        face: "idle",
        text: "Click the switches, A and B, and watch the lamp. Then press Run test to try every combination.",
      },
    ],
    hint: [
      {
        face: "idle",
        text: "Click A and B to flip them and watch the lamp. Press Run test to check every row of the table.",
      },
    ],
    solved: [
      { face: "happy", text: "Boom! The lamp stays on unless A and B are both on. That's a NAND gate." },
      { face: "amazed", text: "Here's the secret: every other chip can be built out of NANDs. Even a whole computer." },
      { face: "idle", text: "NAND is in your parts bin now. Press Up to the logic line when you're ready." },
    ],
  },
  NOT: {
    intro: [
      { face: "idle", text: "First job: NOT. It flips a signal. On goes in, off comes out." },
      CONTROLS,
      { face: "thinking", text: "Hint: a NAND has two inputs, but nothing says they need different wires." },
    ],
    hint: [
      { face: "thinking", text: "Try wiring A into both of a NAND's inputs. What does it do when both are on?" },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "NOT, done! It's in your parts bin now, so you never have to build it again." }],
  },
  AND: {
    intro: [
      {
        face: "thinking",
        text: "AND is on only when A and B are both on. That's NAND, just flipped. You know how to flip things now.",
      },
    ],
    hint: [
      { face: "thinking", text: "A NAND gives the opposite of AND. Put something after it that flips the answer." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "AND, filed. My memory banks feel roomier already." }],
  },
  OR: {
    intro: [
      { face: "thinking", text: "OR is on when A is on, or B is, or both." },
      { face: "thinking", text: "Tricky one. What would a NAND do if you flipped both of its inputs first?" },
    ],
    hint: [
      { face: "thinking", text: "Flip A and flip B, then send both into a NAND. Check it against the table." },
      CONTROLS,
    ],
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
    solved: [{ face: "amazed", text: "MUX, done! A switch you flip with a wire instead of a finger." }],
  },
  DEMUX: {
    intro: [
      { face: "thinking", text: "DEMUX is MUX run backwards." },
      { face: "idle", text: "MUX picks which input gets out. DEMUX picks which output the input goes to." },
      { face: "idle", text: "When SEL is off, D goes to Y0. When SEL is on, D goes to Y1. The other one stays off." },
      { face: "amazed", text: "Two lamps this time! Each row of the table checks both of them." },
    ],
    hint: [
      { face: "thinking", text: "Take one lamp at a time. Y1 is just D AND SEL." },
      { face: "thinking", text: "Y0 asks the same of D, but with SEL flipped first. You have a NOT for that." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "DEMUX, done! One signal, sent wherever SEL says." },
      { face: "amazed", text: "That's every schematic I have room for on this floor." },
      { face: "happy", text: "There are more floors to this factory. We'll get there, partner." },
    ],
  },
  "HALF ADDER": {
    intro: [
      { face: "thinking", text: "Adding two bits is easy until both are on. Then 1 + 1 is 2." },
      { face: "idle", text: "In binary, 2 is written 10. It needs two places." },
      {
        face: "idle",
        text: "So a half adder has two lamps. SUM is the ones place. COUT is the carry to the twos place.",
      },
      { face: "thinking", text: "Look at SUM's column in the table. Haven't we built that one already?" },
    ],
    hint: [
      { face: "thinking", text: "SUM is on when exactly one input is on. That's XOR." },
      { face: "thinking", text: "COUT is on only when A and B are both on. That's AND." },
      CONTROLS,
    ],
    solved: [{ face: "amazed", text: "Half adder, filed! Our first part that does arithmetic." }],
  },
  "FULL ADDER": {
    intro: [
      { face: "thinking", text: "A half adder can't take a carry in. A full adder adds three bits: A, B and CIN." },
      { face: "idle", text: "Three bits add up to at most 3, which is 11 in binary. Still two lamps." },
      { face: "thinking", text: "Try adding in two steps, like you would on paper." },
    ],
    hint: [
      { face: "thinking", text: "First, half-add A and B." },
      { face: "thinking", text: "Then half-add that SUM with CIN. Its SUM is your SUM." },
      { face: "thinking", text: "Only one of the two half adders can carry. OR their COUTs together." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "Full adder, done! Chain eight of them and you can add whole numbers." }],
  },
  "2-BIT ADDER": {
    intro: [
      { face: "amazed", text: "Look at A and B! Each one is a pair of switches." },
      { face: "idle", text: "That's a bus: two signals on one thick wire." },
      { face: "idle", text: "Together, the two signals make a number up to 3." },
      { face: "idle", text: "Split and join are in the Wiring section of the parts bin." },
      { face: "idle", text: "A split breaks a bus into single wires." },
      { face: "idle", text: "A join does the opposite. It gathers single wires back into one bus." },
      { face: "thinking", text: "Each split's top pin is the high bit. The bottom pin is the ones place." },
    ],
    hint: [
      { face: "thinking", text: "Split A and split B. Give each pair of bits its own full adder." },
      { face: "thinking", text: "Start at the bottom, the ones place. Its full adder takes CIN." },
      { face: "thinking", text: "Its COUT goes into the CIN of the full adder one place up." },
      { face: "thinking", text: "Join the two SUMs into SUM. The top COUT is your COUT." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "2-bit adder, done! 3 + 1 rolls over to 0, with COUT on." },
      { face: "idle", text: "Real computers add 8 bits at a time. It's the same chain, just four times longer." },
      { face: "idle", text: "Eight full adders, each COUT into the next CIN. Nothing new, only more of it." },
      { face: "happy", text: "So I chained them for you. There's an 8-bit adder in your parts bin!" },
      { face: "amazed", text: "That's the last level on adder assembly." },
      { face: "happy", text: "Our gates can count now. Next, we teach them some new tricks." },
    ],
  },
  MUX8: {
    intro: [
      { face: "idle", text: "Remember MUX? It picks A or B, one signal at a time." },
      { face: "thinking", text: "Up here everything is 8 signals wide. We need a MUX for whole buses." },
      { face: "idle", text: "One SEL picks all eight at once." },
    ],
    hint: [
      { face: "thinking", text: "Split A and split B. Give each pair of signals its own MUX." },
      { face: "thinking", text: "SEL goes to every MUX. One wire can feed them all." },
      { face: "thinking", text: "Join the eight outputs, in order, into OUT." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "MUX8, done! Later on, lots of parts pick between buses with this." }],
  },
  "ZERO TEST": {
    intro: [
      { face: "idle", text: "Sometimes we just need to know: is this number zero?" },
      { face: "thinking", text: "ZERO lights up only when every signal of A is off." },
    ],
    hint: [
      { face: "thinking", text: "Split A. If any signal is on, the number isn't zero." },
      { face: "thinking", text: "OR the signals together in pairs, until one wire is left." },
      { face: "thinking", text: "That wire says 'not zero'. Flip it with a NOT." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "Zero test, done! A computer asks that question all the time." }],
  },
  "ALU SLICE": {
    intro: [
      { face: "amazed", text: "This is the big one. One part that does six jobs." },
      { face: "idle", text: "OP is a 3-signal bus. Its number says which job to do." },
      { face: "idle", text: "0 adds, 1 subtracts, 2 is AND, 3 is OR, 4 is XOR, 5 is NOT A." },
      { face: "thinking", text: "We start with a slice: the whole thing for one signal." },
    ],
    hint: [
      { face: "thinking", text: "Build every job side by side. Then MUXes pick the answer." },
      { face: "thinking", text: "Split OP. Its bottom pin, the ones place, picks between pairs of jobs." },
      { face: "thinking", text: "Subtract is add with B flipped. XOR B with OP's ones place first." },
      { face: "thinking", text: "COUT only counts for add and subtract. Keep it off for the rest." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "ALU slice, done! Eight of these in a chain make the real thing." }],
  },
  ALU: {
    intro: [
      { face: "happy", text: "Time to build the ALU. Eight slices, one for each signal." },
      { face: "idle", text: "ZERO tests A, not OUT. Later, the CPU uses it to decide where to jump." },
    ],
    hint: [
      { face: "thinking", text: "Split A and B. Each slice gets one signal of each, and all of OP." },
      { face: "thinking", text: "Chain them like the adder: each COUT into the next CIN." },
      {
        face: "thinking",
        text: "Subtract needs a carry in at the bottom, and add needs none. OP's ones place tells them apart.",
      },
      { face: "thinking", text: "Don't forget ZERO. You built a part for that." },
      CONTROLS,
    ],
    solved: [
      { face: "amazed", text: "The ALU works! Add, subtract, and, or, xor, not. All on whole numbers." },
      { face: "happy", text: "That's the last level on the calculation shop." },
      { face: "idle", text: "But it forgets every answer the moment the switches change." },
      { face: "thinking", text: "Next floor up, we teach our parts to remember." },
    ],
  },
};

// The first time the elevator reaches each floor, by layer number.
const FLOORS: Record<number, Line> = {
  2: { face: "amazed", text: "The logic line! Belts full of gates. Let's build some of our own." },
  3: { face: "happy", text: "Adder assembly. Gates that count. Let's teach them to add." },
  4: { face: "thinking", text: "The calculation shop. One part that does six jobs, built from what we have." },
  5: { face: "thinking", text: "The filing vault. Our parts forget everything. Here they learn to remember." },
  6: { face: "amazed", text: "The clock tower. Hear that ticking? The whole factory keeps time from here." },
  7: { face: "idle", text: "The typing pool. Rows of old typewriters. Here we name our own instructions." },
  8: { face: "amazed", text: "The control room. Every part we've built comes together up here." },
  9: { face: "happy", text: "The exit hall. I can see the door! One program left to write." },
};

export const floor = (layer: number): Line[] => (FLOORS[layer] ? [FLOORS[layer]] : []);

export const intro = (level: Level): Line[] => LEVELS[level.gate]?.intro ?? [];

export const solved = (level: Level): Line[] =>
  LEVELS[level.gate]?.solved ?? [{ face: "happy", text: `${level.gate}, done!` }];

export const help = (level: Level): Line[] => [
  {
    face: "idle",
    text:
      level.prebuilt === true ? `This is ${level.gate}. ${level.goal}` : `We're building ${level.gate}. ${level.goal}`,
  },
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
  {
    face: "happy",
    text:
      level.prebuilt === true
        ? `Welcome back! We were looking at ${level.gate}.`
        : `Welcome back! We were building ${level.gate}.`,
  },
];

// On the notice that asks phone players to come back on a desktop.
export const smallScreen: Line = {
  face: "worried",
  text: "This board's too small for fingers. Come find me on a desktop.",
};
