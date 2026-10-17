import { INSTRUCTION_SET_ID, levelId, type Level } from "../sim/level";
import type { LineError } from "../sim/assembler";
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
  // When the player asks for help, after the goal.
  hint: Line[];
  // The goal, split for Bitbox's desk, when the level's own is too long for one line.
  about?: Line[];
  // The first time it's solved.
  solved: Line[];
}

// The door program's run ends with the door open: the closing scene.
const DOOR_OPEN: Line[] = [
  { face: "amazed", text: "It's open! Is that daylight?" },
  { face: "happy", text: "That door ran on a CPU you built, from one NAND gate, one layer at a time." },
  { face: "thinking", text: "Alan Turing imagined machines like this before anyone had built one." },
  { face: "happy", text: "Thanks for getting me out. After you." },
];

// Keyed by levelId: a circuit level's gate, or the id of a level with no circuit.
const LEVELS: Partial<Record<string, LevelScript>> = {
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
    about: [
      {
        face: "idle",
        text: "We're building ALU SLICE. Do OP to A and B. Arithmetic adds A, B (or NOT B for OP 1 and 3) and CIN.",
      },
      { face: "idle", text: "4 is AND, 5 is OR, 6 is XOR, 7 is NOT A. COUT is the carry for every OP." },
    ],
    intro: [
      { face: "amazed", text: "This is the big one. One part that does six jobs." },
      { face: "idle", text: "OP is a 3-signal bus. Its top signal says arithmetic or logic." },
      { face: "idle", text: "0 adds A, B and CIN; 1 adds NOT B instead. 4 is AND, 5 is OR, 6 is XOR, 7 is NOT A." },
      { face: "thinking", text: "OP 2 adds and 3 subtracts, just like 0 and 1." },
    ],
    hint: [
      { face: "thinking", text: "Split OP. Its ones place goes to ADD/SUB's SUB." },
      { face: "thinking", text: "Join OP's low two signals into the logic unit's SEL." },
      { face: "thinking", text: "A MUX on OP's top signal picks arithmetic or logic." },
      { face: "thinking", text: "COUT is ADD/SUB's carry, whatever OP says." },
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
  "SR LATCH": {
    intro: [
      { face: "idle", text: "Every part so far forgets. Change a switch and the old answer is gone." },
      { face: "thinking", text: "This one remembers. S turns Q on, R turns it off." },
      { face: "idle", text: "Let go of both, and Q stays where it was." },
    ],
    hint: [
      { face: "thinking", text: "Feed two NANDs into each other: each one's output goes into the other." },
      { face: "worried", text: "A bare NAND loop is backwards. It sets when its input goes off." },
      { face: "thinking", text: "Put a NOT in front of each NAND and it listens the right way round." },
      CONTROLS,
    ],
    solved: [
      { face: "amazed", text: "It holds! A loop that keeps its own signal going. That's memory." },
      { face: "happy", text: "SR latch, filed. My memory banks will be jealous." },
    ],
  },
  "D LATCH": {
    intro: [
      { face: "idle", text: "Meet CLK, the clock. It says when a part may change its mind." },
      { face: "idle", text: "While CLK is on, Q follows D. While it's off, Q stays put." },
      { face: "idle", text: "Press Tick to turn the clock on and off once. Press Run to keep it ticking." },
      { face: "idle", text: "Clock speed sets how many ticks a second Run gives." },
    ],
    hint: [
      { face: "thinking", text: "Use an SR latch. S should be on when D and CLK are both on." },
      { face: "thinking", text: "R should be on when D is off and CLK is on." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "D latch, done! One signal in, and it waits for the clock." }],
  },
  "D FLIP-FLOP": {
    intro: [
      { face: "worried", text: "A D latch lets D straight through the whole time CLK is on. That's too long." },
      { face: "idle", text: "A flip-flop takes D only at the moment CLK turns on." },
    ],
    hint: [
      { face: "thinking", text: "Use two D latches in a row, one after the other." },
      { face: "thinking", text: "Open the first while CLK is off, and the second while it's on. A NOT helps." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "D flip-flop, done! Snap. It only listens on the tick." }],
  },
  BIT: {
    intro: [
      { face: "idle", text: "A flip-flop takes D on every tick. Sometimes we want it to keep its value." },
      { face: "idle", text: "LOAD decides. On a tick with LOAD on, Q takes D. With LOAD off, Q stays." },
    ],
    hint: [
      { face: "thinking", text: "Put a MUX in front of a flip-flop. LOAD picks what goes in." },
      { face: "thinking", text: "With LOAD off, feed Q back in, so the flip-flop takes what it already has." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "One bit, stored! That's the smallest thing a computer remembers." }],
  },
  "2-BIT REGISTER": {
    intro: [
      { face: "idle", text: "A register keeps a whole number. One bit per signal." },
      { face: "idle", text: "We'll start with 2 signals, like always." },
    ],
    hint: [
      { face: "thinking", text: "Split D. Each signal gets its own bit." },
      { face: "thinking", text: "Both bits share CLK and LOAD. Join their Qs back up." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "2-bit register, done!" },
      { face: "happy", text: "I lined up eight bits the same way. There's an 8-signal register in your parts bin!" },
    ],
  },
  DEMUX4: {
    intro: [
      { face: "idle", text: "Soon we'll have four registers, and only one should change at a time." },
      { face: "idle", text: "DEMUX4 sends IN to one of four outputs. SEL numbers which." },
    ],
    hint: [
      { face: "thinking", text: "Split SEL. Its top signal picks a pair, with one DEMUX." },
      { face: "thinking", text: "Two more DEMUXes on SEL's ones place pick within each pair." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "DEMUX4, done! One switch, four places it can go." }],
  },
  "4-WAY MUX8": {
    intro: [
      { face: "idle", text: "And to read four registers, we need to pick one whole number out of four." },
      { face: "idle", text: "Same as MUX4, but every input is 8 signals wide." },
    ],
    hint: [
      { face: "thinking", text: "Build it like MUX4, with MUX8s instead of MUXes." },
      { face: "thinking", text: "SEL's ones place picks within each pair, and its top signal picks the pair." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "4-way MUX8, done! Four buses in, one out." }],
  },
  "2-REGISTER FILE": {
    intro: [
      { face: "amazed", text: "A register file keeps registers side by side, as one part." },
      { face: "idle", text: "We'll start with 2 registers, R0 and R1." },
      { face: "idle", text: "WRITE and WSEL say which register takes DIN on a tick." },
      { face: "idle", text: "A and B show two registers at once. ASEL and BSEL say which." },
      { face: "thinking", text: "A register only shows its new value after the tick that writes it." },
    ],
    hint: [
      { face: "thinking", text: "Both registers share CLK and DIN." },
      { face: "thinking", text: "A DEMUX on WSEL sends WRITE to just one register's LOAD." },
      { face: "thinking", text: "A MUX8 on ASEL picks A, and another on BSEL picks B." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Register file, done! Read two, write one, all in one tick." },
      { face: "happy", text: "I built one with four registers the same way. It's in your parts bin!" },
      { face: "idle", text: "That's what a CPU needs to add one register to another." },
    ],
  },
  RAM: {
    intro: [
      { face: "idle", text: "Last job in the vault: RAM. 8 places, each holding 8 signals." },
      { face: "idle", text: "ADDR numbers the place. On a tick with WRITE on, it takes DIN." },
      { face: "idle", text: "DOUT always shows the place ADDR numbers." },
      { face: "idle", text: "ADDR has 8 signals, but RAM only counts its low 3. Address 13 is place 5." },
    ],
    hint: [
      { face: "thinking", text: "Two register files have 8 registers between them." },
      { face: "thinking", text: "Split ADDR. Its low 3 signals come out of the bottom three pins." },
      { face: "thinking", text: "The lowest two pick the register in both. Join them for WSEL and ASEL." },
      { face: "thinking", text: "The one above picks the file: a DEMUX steers WRITE, and a MUX8 picks DOUT." },
      CONTROLS,
    ],
    solved: [
      { face: "amazed", text: "RAM works! Write a number, walk away, and it's still there." },
      { face: "happy", text: "That's the last level in the filing vault. Our parts remember now." },
      { face: "thinking", text: "But nothing ticks the clock for us yet. Next floor up, we find out who keeps time." },
    ],
  },
  "PROGRAM COUNTER": {
    intro: [
      { face: "idle", text: "A program is a list of instructions. The program counter keeps our place in it." },
      { face: "idle", text: "Each tick COUNT goes up by 1. With LOAD on, it jumps to ADDR instead." },
      { face: "happy", text: "New in the Wiring section: ON and OFF. Each gives one signal that never changes." },
    ],
    hint: [
      { face: "thinking", text: "A register keeps the count. Give its LOAD an ON, so it takes a value every tick." },
      { face: "thinking", text: "An 8-bit adder with ON in CIN gives the count plus 1." },
      { face: "thinking", text: "A MUX8 on LOAD picks that or ADDR for the register." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Program counter, done! 1, 2, 3, and round again after 255." },
      { face: "idle", text: "Our CPU will never lose its place now." },
    ],
  },
  "3-TO-8 DECODER": {
    about: [
      {
        face: "idle",
        text: "We're building 3-TO-8 DECODER. Only the signal S numbers is on: number n is D's signal n.",
      },
      { face: "idle", text: "The join takes its high signal first, so number n goes into join pin 7−n." },
    ],
    intro: [
      { face: "idle", text: "A decoder turns a number into one signal." },
      { face: "idle", text: "S is a number from 0 to 7. Number n is D's signal n: only that one is on." },
    ],
    hint: [
      { face: "thinking", text: "Split S. Its top signal picks a group of four: 0 to 3, or 4 to 7." },
      { face: "thinking", text: "A DEMUX4 per group. Join S's low two signals for its SEL." },
      { face: "thinking", text: "A join takes its high signal first. Number n goes into pin 7 minus n." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Decoder, done! Three signals in, one of eight lit." },
      { face: "idle", text: "Four signals is just twice the groups. There's a 4-to-16 decoder in your parts bin!" },
    ],
  },
  "4-BIT ZERO TEST": {
    intro: [
      { face: "idle", text: "Soon our CPU will need to ask: is this number zero? Then it can decide where to jump." },
      { face: "idle", text: "ZERO is on only when every signal of A is off." },
    ],
    hint: [
      { face: "thinking", text: "Split A. An OR of two signals is on if either is." },
      { face: "thinking", text: "OR them in pairs, then OR the pairs. That one wire is on when A isn't zero." },
      { face: "thinking", text: "NOT it, and ZERO is on only when A is 0." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Zero test, done! Every signal off, one lamp on." },
      { face: "idle", text: "8 signals is just one more row of ORs. There's an 8-signal zero test in your parts bin!" },
    ],
  },
  NONE: {
    intro: [
      { face: "idle", text: "Eight wires, one question: is every one of them off?" },
      { face: "idle", text: "OUT is on only when A to H are all off." },
    ],
    hint: [
      { face: "thinking", text: "Eight signals make a bus. Join them." },
      { face: "thinking", text: "Then ask the zero test." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "None, done! All quiet, one lamp on." }],
  },
  SEQUENCER: {
    intro: [
      { face: "idle", text: "Every instruction takes two ticks. Fetch reads it, then execute does it." },
      { face: "idle", text: "The sequencer keeps track. EXEC is off on fetch ticks and on on execute ticks." },
    ],
    hint: [
      { face: "thinking", text: "EXEC changes on every tick. A flip-flop changes on a tick." },
      { face: "thinking", text: "Feed the flip-flop the NOT of its own Q." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Sequencer, done! Fetch, execute, fetch, execute." },
      { face: "thinking", text: "But a CPU has to stop somewhere." },
    ],
  },
  STEPPER: {
    intro: [
      { face: "idle", text: "The stepper is a sequencer with a brake." },
      { face: "idle", text: "EXEC toggles on every tick, until HALT is on during execute. Then it holds." },
    ],
    hint: [
      { face: "thinking", text: "Put an AND between CLK and a sequencer, so you can cut the clock." },
      { face: "thinking", text: "The clock runs unless EXEC and HALT are both on. That's a NAND." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Stepper, done! Fetch, execute, and stop when told." },
      { face: "amazed", text: "That's the clock tower wound up. The whole factory keeps time with us now." },
      { face: "thinking", text: "Next we decide what our instructions are called." },
    ],
  },
  [INSTRUCTION_SET_ID]: {
    intro: [
      { face: "idle", text: "A CPU only understands numbers. Each instruction needs one: its opcode." },
      { face: "idle", text: "And we need a short name for each, a mnemonic, so people can read a program." },
      { face: "happy", text: "I've pencilled in my picks. Use them, or type your own. Letters only, six at most." },
    ],
    hint: [
      { face: "thinking", text: "Every mnemonic and every opcode has to be different. One opcode is left spare." },
      { face: "idle", text: "Use Bitbox's fills a row with my pick. Use all of Bitbox's fills the lot." },
    ],
    solved: [
      { face: "amazed", text: "Fifteen instructions, fifteen names. That's a language, partner." },
      { face: "happy", text: "You can come back and rename things any time. The CPU will read whatever's on file." },
    ],
  },
  "OP ENCODER": {
    intro: [
      { face: "idle", text: "Up here we teach the CPU your instruction set. It starts with the opcode." },
      { face: "idle", text: "The op encoder tells the ALU its job. Add is OP 0, subtract 1." },
      { face: "idle", text: "And is 4, or 5, xor 6. Every other instruction gets 7." },
    ],
    hint: [
      { face: "thinking", text: "A 4-to-16 decoder lights one signal per opcode. Split LO and HI to get them all." },
      { face: "thinking", text: "Your opcodes say which signal is which instruction. Check your table." },
      { face: "thinking", text: "Each OP signal is on unless it's one of a few instructions. That's NONE of them." },
      {
        face: "thinking",
        text: "OP's top signal is off for add and subtract. Its ones place is off for add, and, xor.",
      },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Op encoder, done! Your opcodes, wired in by hand." },
      { face: "idle", text: "Change your instruction set later, and the part in the bin keeps up. This board won't." },
    ],
  },
  "WRITE ENCODER": {
    about: [
      {
        face: "idle",
        text: "We're building WRITE ENCODER. WRITE is on when your opcode's instruction writes register R.",
      },
      { face: "idle", text: "SRC picks what R takes: 0 S, 1 N, 2 RAM or DIN, 3 the ALU." },
    ],
    intro: [
      { face: "idle", text: "The write encoder says if register R changes, and what it takes." },
      { face: "idle", text: "WRITE is on when the instruction writes R." },
      { face: "idle", text: "SRC picks what R takes. 0 is S, 1 is N, 2 is RAM or DIN, 3 is the ALU." },
    ],
    hint: [
      { face: "thinking", text: "Same decoder and splits as the op encoder." },
      { face: "thinking", text: "WRITE is on unless it's halt, write, jump, jump if zero, out, or the spare opcode." },
      { face: "thinking", text: "SRC's top signal is off for copy and set. Its ones place for copy, read and in." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "Write encoder, done! Every register knows when to listen." }],
  },
  "CONTROL UNIT": {
    intro: [
      { face: "idle", text: "The control unit does the rest: store, jump, in, out and halt." },
      { face: "idle", text: "A is register R. Jump if zero only jumps while A is 0." },
    ],
    hint: [
      { face: "thinking", text: "Same decoder and splits again. Most outputs are just one instruction's signal." },
      { face: "thinking", text: "A zero test on A, ANDed with jump if zero's signal, says the jump is taken." },
      { face: "thinking", text: "JUMP is on for jump, or for a jump if zero that's taken." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "Control unit, done! That's the whole instruction set, wired in." }],
  },
  "INSTRUCTION REGISTER": {
    intro: [
      { face: "idle", text: "The instruction register keeps one instruction, and hands it out in pieces." },
      { face: "idle", text: "D's top 4 signals are the opcode. The next 2 are R, and the low 2 are S." },
    ],
    hint: [
      { face: "thinking", text: "A register keeps D. Split what it keeps into its 8 signals." },
      { face: "thinking", text: "The split gives the top signal first. Join the first 4 for OPCODE." },
      { face: "thinking", text: "Then join the next 2 for R, and the last 2 for S." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "Instruction register, done! One byte in, three answers out." }],
  },
  "REGISTER UNIT": {
    intro: [
      { face: "idle", text: "The register unit is where the work happens: the registers and the ALU." },
      { face: "idle", text: "On a tick, register R takes what your opcode says. A always shows R." },
      { face: "thinking", text: "RAM comes in from outside. IN says to take DIN instead." },
    ],
    hint: [
      { face: "thinking", text: "R and S pick registers in the register file. R is the one that changes." },
      { face: "thinking", text: "Your encoders read OPCODE. One tells the ALU its job, the other says what R takes." },
      { face: "thinking", text: "A 4-way MUX8 on SRC picks what R takes: S, N, memory or the ALU." },
      { face: "thinking", text: "A MUX8 on IN swaps RAM for DIN." },
      CONTROLS,
    ],
    solved: [{ face: "happy", text: "Register unit, done! Every instruction that changes a register, in one part." }],
  },
  "EXECUTE UNIT": {
    intro: [
      { face: "idle", text: "Now the execute unit: everything that does an instruction." },
      { face: "idle", text: "Your control unit, your register unit and RAM, on one board." },
      { face: "thinking", text: "Each step in the table is one instruction, written in your opcodes." },
    ],
    hint: [
      { face: "thinking", text: "The control unit reads the opcode, and register R from the register unit's A." },
      { face: "thinking", text: "Wire N straight into RAM's ADDR. RAM only uses its low 3 signals." },
      { face: "thinking", text: "RAM takes register R when STORE is on, and feeds the register unit." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Execute unit, done! Give it an instruction and it does it." },
      { face: "thinking", text: "It just needs something to feed it instructions, one after another." },
    ],
  },
  "FETCH UNIT": {
    intro: [
      { face: "idle", text: "The fetch unit feeds the execute unit, one instruction after another." },
      { face: "idle", text: "With EXEC off, a tick takes the instruction and its number, and the count goes up." },
      { face: "idle", text: "With EXEC on, a tick jumps the count to N if JUMP is on. Otherwise it holds." },
    ],
    hint: [
      { face: "thinking", text: "A program counter keeps the count. Wire EXEC to its LOAD." },
      { face: "thinking", text: "A MUX8 on JUMP picks what it loads: N, or its own count." },
      { face: "thinking", text: "An instruction register takes IIN and a register takes NIN, while EXEC is off." },
      CONTROLS,
    ],
    solved: [
      { face: "happy", text: "Fetch unit, done! It always knows what comes next." },
      { face: "thinking", text: "Now it needs a clock, and something to do the instructions." },
    ],
  },
  CPU: {
    intro: [
      { face: "amazed", text: "This is it. The CPU." },
      { face: "idle", text: "Program memory holds a program. The fetch unit's count says where we are in it." },
      { face: "idle", text: "The stepper says fetch or execute. Fetch takes the next instruction. Execute does it." },
      { face: "thinking", text: "Run test loads each test program and ticks until HALT." },
    ],
    hint: [
      { face: "thinking", text: "COUNT points into program memory. Its I and N go back into the fetch unit." },
      { face: "thinking", text: "The stepper's EXEC goes to the fetch unit, and to the execute unit's CLK." },
      {
        face: "thinking",
        text: "The execute unit's JUMP and HALT go back: JUMP to the fetch unit, HALT to the stepper.",
      },
      CONTROLS,
    ],
    solved: [
      { face: "amazed", text: "It runs! A real CPU, speaking your instruction set." },
      { face: "happy", text: "That's the control room done. Every part we built, all working together." },
      { face: "thinking", text: "Now for the door. It wants a program, and we can finally write one." },
    ],
  },
  "DOOR PROGRAM": {
    intro: [
      { face: "amazed", text: "There it is. The way out." },
      { face: "thinking", text: "The door has a keypad, and a cable to a CPU running your instruction set." },
      { face: "idle", text: "Type the door program on the left, one instruction per line, in your own mnemonics." },
      { face: "thinking", text: "The code comes from a name. Remember the pencil notes on the sheets downstairs?" },
    ],
    hint: [
      {
        face: "thinking",
        text: "in from KEYPAD gives the next letter of the name, in ASCII. After the last, it gives 0.",
      },
      {
        face: "thinking",
        text: "Add the letters up in a register. When the keypad gives 0, send the total with out to DOOR.",
      },
      {
        face: "idle",
        text: "Write next: at the start of a line to label it, so a jump can come back. ; starts a comment.",
      },
      { face: "idle", text: "Type the name on the keypad, then press Run. Step does one tick at a time." },
    ],
    solved: DOOR_OPEN,
  },
};

// The first time the elevator reaches each floor, by layer number.
const FLOORS: Record<number, Line[]> = {
  2: [{ face: "amazed", text: "The logic line! Belts full of gates. Let's build some of our own." }],
  3: [{ face: "happy", text: "Adder assembly. Gates that count. Let's teach them to add." }],
  4: [{ face: "thinking", text: "The calculation shop. One part that does six jobs, built from what we have." }],
  5: [{ face: "thinking", text: "The filing vault. Our parts forget everything. Here they learn to remember." }],
  6: [{ face: "amazed", text: "The clock tower. Hear that ticking? The whole factory keeps time from here." }],
  7: [
    {
      face: "amazed",
      text: "Typewriters! Rows and rows of them. This must be the typing pool, where the programs got written.",
    },
    { face: "thinking", text: "Before we build a CPU, it needs a language. We get to invent it." },
  ],
  8: [{ face: "amazed", text: "The control room. Every part we've built comes together up here." }],
  9: [{ face: "happy", text: "The exit hall. I can see the door! One program left to write." }],
};

const floor = (layer: number): Line[] => FLOORS[layer] ?? [];

// The sheet's title for a level.
export function heading(level: Level): string {
  if (level.kind === "instruction set") return "Instruction set";
  if (level.kind === "door program") return "The door program";
  return `${level.prebuilt === true ? "Meet" : "Build"} ${level.gate}`;
}

export const intro = (level: Level): Line[] => LEVELS[levelId(level)]?.intro ?? [];

export const solved = (level: Level): Line[] =>
  LEVELS[levelId(level)]?.solved ?? [{ face: "happy", text: `${levelId(level)}, done!` }];

function about(level: Level): string {
  if (level.kind === "instruction set") return `We're writing our instruction set. ${level.goal}`;
  if (level.kind === "door program") return `We're writing the door program. ${level.goal}`;
  return level.prebuilt === true
    ? `This is ${level.gate}. ${level.goal}`
    : `We're building ${level.gate}. ${level.goal}`;
}

export const help = (level: Level): Line[] => [
  ...(LEVELS[levelId(level)]?.about ?? [{ face: "idle", text: about(level) }]),
  ...(LEVELS[levelId(level)]?.hint ?? [CONTROLS]),
];

const failed: Line[] = [
  { face: "error", text: "Bzzt! Some rows don't match. The ✗ marks show which ones." },
  { face: "idle", text: "Flip the switches yourself to see what your circuit really does." },
];

const loosePins: Line[] = [{ face: "thinking", text: "See the amber pins? Nothing's wired to them yet." }];

const unstable: Line[] = [
  { face: "error", text: "Bzzt! A loop on your board keeps flipping its own signal, so it never settles." },
  { face: "idle", text: "Look for a wire that feeds a gate's output back into it." },
];

const forbidden = (types: NodeType[]): Line[] => [
  { face: "worried", text: `${types.join(" and ")} isn't allowed on this level yet. Stick to the parts in the bin.` },
];

const tableError: Line[] = [
  {
    face: "worried",
    text: "Careful: every name and every number has to be different, or the CPU won't know which you meant.",
  },
];

function welcomeBack(level: Level): Line[] {
  if (level.kind === "instruction set")
    return [{ face: "idle", text: "Changing your mind? Go ahead. Everything downstream reads this table." }];
  if (level.kind === "door program")
    return [{ face: "happy", text: "Welcome back! The door's still waiting for its program." }];
  return [
    {
      face: "happy",
      text:
        level.prebuilt === true
          ? `Welcome back! We were looking at ${level.gate}.`
          : `Welcome back! We were building ${level.gate}.`,
    },
  ];
}

const doorShut = (sent: number): Line[] => [
  { face: "error", text: `Bzzt! The door got ${sent}. That's not its code, so it stays shut.` },
  { face: "thinking", text: "The pencil notes on the sheets downstairs all point to one person. Try their name." },
];

const doorHalted: Line[] = [
  { face: "worried", text: "The program stopped at HALT without sending the door anything." },
  { face: "idle", text: "Use out to send the total to DOOR before it halts." },
];

const programError = (error: LineError): Line[] => [
  { face: "worried", text: `Line ${error.line}: ${error.problem}` },
  { face: "idle", text: "Fix the marked line, then press Run again." },
];

const programEmpty: Line[] = [
  { face: "idle", text: "There's no program yet. Type it in on the left, one instruction per line." },
];

// On the notice that shows instead of the game: on a touch device, which
// never plays, and on a desktop window too small to fit the sheet.
export const touchScreen: Line = {
  face: "worried",
  text: "This board's too small for fingers. Come find me on a desktop.",
};

export const smallWindow: Line = {
  face: "worried",
  text: "I can't fit the whole sheet in here. Make the window bigger?",
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
    case "loose pins":
      said = loosePins;
      break;
    case "forbidden":
      said = forbidden(cue.parts);
      break;
    case "unstable":
      said = unstable;
      break;
    case "error":
      said = tableError;
      break;
    case "program error":
      said = programError(cue.error);
      break;
    case "program empty":
      said = programEmpty;
      break;
    case "door open":
      said = DOOR_OPEN;
      break;
    case "door shut":
      said = doorShut(cue.sent);
      break;
    case "door halted":
      said = doorHalted;
      break;
  }
  return said;
}

// Every line Bitbox can say during play, with a long stand-in for each
// filled-in blank, so a check can make sure each one fits his desk.
export function everyLine(levels: readonly Level[]): Line[] {
  const longError: LineError = { line: 16, problem: "The label OPEN_DOOR is past the end of program memory." };
  return [
    ...levels.flatMap((level) => [...intro(level), ...solved(level), ...help(level), ...welcomeBack(level)]),
    ...Object.values(FLOORS).flat(),
    ...failed,
    ...unstable,
    ...forbidden(["DEMUX", "MUX"]),
    ...tableError,
    ...programError(longError),
    ...programEmpty,
    ...DOOR_OPEN,
    ...doorShut(255),
    ...doorHalted,
  ];
}
