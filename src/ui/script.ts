import type { Level } from "../sim/level";
import type { NodeType } from "../sim/node";
import type { Cue } from "../sim/story";
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
  "2-BIT MUX": {
    intro: [
      { face: "idle", text: "Remember MUX? It picks A or B, one signal at a time." },
      { face: "thinking", text: "Now A and B are buses. We need a MUX that picks a whole bus." },
      { face: "idle", text: "One SEL picks both signals at once." },
    ],
    hint: [
      { face: "thinking", text: "Split A and split B. Give each pair of signals its own MUX." },
      { face: "thinking", text: "SEL goes to both MUXes. One wire can feed them all." },
      { face: "thinking", text: "Join the two outputs, in order, into OUT." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "2-bit MUX, done! For 8 signals, it's the same MUX six more times." },
      { face: "happy", text: "So I built that one too. There's a MUX8 in your parts bin!" },
    ],
  },
  MUX4: {
    intro: [
      { face: "idle", text: "A MUX picks one of two. This one picks one of four." },
      { face: "thinking", text: "SEL is a 2-signal bus. Its number, 0 to 3, says which input wins." },
    ],
    hint: [
      { face: "thinking", text: "Split SEL. Its ones place picks A or B, and C or D." },
      { face: "thinking", text: "That's two MUXes. A third MUX, on SEL's top signal, picks between them." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "MUX4, done! Three MUXes, and it picks from four." }],
  },
  "ADD/SUB": {
    intro: [
      { face: "idle", text: "Adding is easy now. Let's teach it to subtract too." },
      { face: "thinking", text: "When SUB is on, add NOT B instead of B." },
      { face: "idle", text: "With a carry in, that's A minus B. Trust me, the numbers work out." },
    ],
    hint: [
      { face: "thinking", text: "XOR flips a signal when its other input is on. Use one on B and SUB." },
      { face: "thinking", text: "Then a full adder: A, the flipped B and CIN." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "Add and subtract, done! One switch tells it which." }],
  },
  "LOGIC UNIT": {
    intro: [{ face: "idle", text: "Now the gates' jobs. SEL picks one: 0 AND, 1 OR, 2 XOR, 3 NOT A." }],
    hint: [
      { face: "thinking", text: "Do every job side by side: an AND, an OR, an XOR and a NOT." },
      { face: "thinking", text: "Then let your MUX4 pick the answer, with SEL on its SEL." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "Logic unit, done! Four jobs, one part." }],
  },
  "ALU SLICE": {
    intro: [
      { face: "amazed", text: "This is the big one. One part that does six jobs." },
      { face: "idle", text: "OP is a 3-signal bus. Its top signal says arithmetic or logic." },
      { face: "idle", text: "0 adds and 1 subtracts. 4 is AND, 5 is OR, 6 is XOR, 7 is NOT A." },
      { face: "thinking", text: "OP 2 and 3 do nothing at all. OUT and COUT stay off." },
    ],
    hint: [
      { face: "thinking", text: "Split OP. Its ones place goes to ADD/SUB's SUB." },
      { face: "thinking", text: "Join OP's low two signals into the logic unit's SEL." },
      { face: "thinking", text: "A MUX on OP's top signal picks arithmetic or logic." },
      {
        face: "thinking",
        text: "Arithmetic only counts while OP's top two signals are off. Keep OUT and COUT off for 2 and 3.",
      },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "ALU slice, done! Eight of these in a chain make the real thing." }],
  },
  "2-BIT ALU": {
    intro: [
      { face: "happy", text: "Time to build an ALU. One slice for each signal." },
      { face: "idle", text: "We'll start with 2 signals, like the adder." },
    ],
    hint: [
      { face: "thinking", text: "Split A and B. Each slice gets one signal of each, and all of OP." },
      { face: "thinking", text: "Chain them like the adder: the low COUT into the high CIN." },
      {
        face: "thinking",
        text: "Subtract needs a carry in at the bottom, and add needs none. OP's ones place tells them apart.",
      },
      CONTROLS,
    ],
    solved: [
      { face: "amazed", text: "The ALU works! Add, subtract, and, or, xor, not. All on whole numbers." },
      { face: "happy", text: "I chained eight slices the same way. There's an 8-bit ALU in your parts bin!" },
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

const floor = (layer: number): Line[] => (FLOORS[layer] ? [FLOORS[layer]] : []);

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

const failed: Line[] = [
  { face: "error", text: "Bzzt! Some rows don't match. The ✗ marks show which ones." },
  { face: "idle", text: "Flip the switches yourself to see what your circuit really does." },
];

const unstable: Line[] = [
  { face: "error", text: "Bzzt! A loop on your board keeps flipping its own signal, so it never settles." },
  { face: "idle", text: "Look for a wire that feeds a gate's output back into it." },
];

const forbidden = (types: NodeType[]): Line[] => [
  { face: "worried", text: `${types.join(" and ")} isn't allowed on this level yet. Stick to the parts in the bin.` },
];

const welcomeBack = (level: Level): Line[] => [
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

// Bitbox's lines for something the session says he speaks to.
export function lines(cue: Exclude<Cue, { react: string }>): Line[] {
  let said: Line[];
  switch (cue.say) {
    case "intro":
      said = intro(cue.level);
      break;
    case "welcome back":
      said = welcomeBack(cue.level);
      break;
    case "floor":
      said = floor(cue.layer);
      break;
    case "solved":
      said = solved(cue.level);
      break;
    case "failed":
      said = failed;
      break;
    case "forbidden":
      said = forbidden(cue.parts);
      break;
    case "unstable":
      said = unstable;
      break;
  }
  return said;
}
