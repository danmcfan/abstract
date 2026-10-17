import { INSTRUCTIONS, type InstructionSet } from "./instruction";
import { circuitAt, type CircuitLevel, levelId, LEVELS } from "./level";
import type { NodeType, State, Value } from "./node";

export const index = (gate: NodeType): number => LEVELS.findIndex((level) => levelId(level) === gate);
export const level = (gate: NodeType): CircuitLevel => circuitAt(index(gate));

// Ticks a memory part once with its inputs, from its state.
export const tick = (
  memory: { next: (inputs: Value[], state: State) => State },
  inputs: Value[],
  state: State,
): State => memory.next([0, ...inputs.slice(1)], memory.next([1, ...inputs.slice(1)], state));

// Another player's numbers: every opcode reversed, so 0 is spare.
export const REVERSED: InstructionSet = Object.fromEntries(
  INSTRUCTIONS.map(({ id }, i) => [id, { mnemonic: `X${"ABCDEFGHIJKLMNOP"[i]}`, opcode: 15 - i }]),
);

// A valid instruction set from a seed: the 16 opcodes shuffled, with the
// last one left spare.
export function randomSet(seed: number): InstructionSet {
  let state = seed;
  const next = (): number => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
  const opcodes = Array.from({ length: 16 }, (_, n) => n);
  for (let i = opcodes.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [opcodes[i], opcodes[j]] = [opcodes[j] ?? 0, opcodes[i] ?? 0];
  }
  return Object.fromEntries(INSTRUCTIONS.map(({ id }, i) => [id, { mnemonic: `M${i}`, opcode: opcodes[i] ?? 0 }]));
}
