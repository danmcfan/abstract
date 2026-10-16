import { INSTRUCTIONS, type InstructionSet } from "./instruction";

// Another player's numbers: every opcode reversed, so 0 is spare.
export const REVERSED: InstructionSet = Object.fromEntries(
  INSTRUCTIONS.map(({ id }, i) => [id, { mnemonic: `X${"ABCDEFGHIJKLMNOP"[i]}`, opcode: 15 - i }]),
);
