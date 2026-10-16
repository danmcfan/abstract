import { Computer, DOOR, KEYPAD } from "./cpu";
import { rowOf, type InstructionID, type InstructionSet } from "./instruction";
import type { Value } from "./node";

// L9: the door program runs on the CPU's spec (ADR 6), reading the name the
// player types on the keypad, and the door opens for its code.

// The letters of TURING in ASCII add up to 473, which 8 signals keep as 217.
const DOOR_CODE = 217;

// Running, or how the run ended: the door opened, a wrong code shut the
// program down, or it halted without sending the door anything.
export type DoorOutcome = "running" | "open" | "shut" | "halted";

// One run of the door program. The keypad gives the name's letters in
// ASCII, one per in, then 0; the door gives 0. Sending the door anything
// ends the run, open or shut.
export class DoorRun {
  outcome: DoorOutcome = "running";
  // What the program sent the door, if it has.
  sent: Value | null = null;
  ticks = 0;
  private readonly computer: Computer;
  private readonly letters: Value[];
  private typed = 0;

  constructor(set: InstructionSet, words: readonly Value[], name: string) {
    this.computer = new Computer(set, words);
    this.letters = Array.from({ length: name.length }, (_, i) => (name.codePointAt(i) ?? 0) & 0xff);
  }

  tick(): void {
    if (this.outcome !== "running") return;
    this.computer.tick({
      read: (device) => (device === KEYPAD ? (this.letters[this.typed++] ?? 0) : 0),
      send: (device, value) => {
        if (device !== DOOR) return;
        this.sent = value;
        this.outcome = value === DOOR_CODE ? "open" : "shut";
      },
    });
    this.ticks++;
    if (this.sent === null && this.computer.halted) this.outcome = "halted";
  }

  get programCounter(): number {
    return this.computer.programCounter;
  }

  get registers(): Value[] {
    return this.computer.registers;
  }

  // The instruction the CPU is on, once it has fetched one.
  get doing(): string | null {
    return this.ticks === 0 ? null : this.computer.instruction;
  }
}

// The door program Bitbox would write, in the player's mnemonics: it adds
// up the letters until the keypad gives 0, and sends the total to the door.
export function referenceDoorProgram(set: InstructionSet): string {
  const m = (id: InstructionID): string => `${rowOf(set, id).mnemonic.padEnd(6)} `;
  return [
    "; Add up the name's letters and send the total to the door.",
    `      ${m("set")}R0, 0       ; running total`,
    `next: ${m("in")}R1, KEYPAD  ; next letter, 0 at the end`,
    `      ${m("jump if zero")}R1, done`,
    `      ${m("add")}R0, R1`,
    `      ${m("jump")}next`,
    `done: ${m("out")}R0, DOOR`,
    `      ${m("halt")}`,
  ].join("\n");
}
