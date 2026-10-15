// The CPU's instructions are fixed by the game, with what each does and the
// operands it takes (ADR 7). The player gives each one a mnemonic and an
// opcode in L7, and everything after reads that instruction set.

export const INSTRUCTIONS = [
  { id: "halt", operands: "", does: "stop" },
  { id: "set", operands: "R, n", does: "R = n" },
  { id: "copy", operands: "R, S", does: "R = S" },
  { id: "add", operands: "R, S", does: "R = R + S (mod 256)" },
  { id: "subtract", operands: "R, S", does: "R = R − S (mod 256)" },
  { id: "and", operands: "R, S", does: "R = R AND S" },
  { id: "or", operands: "R, S", does: "R = R OR S" },
  { id: "xor", operands: "R, S", does: "R = R XOR S" },
  { id: "not", operands: "R", does: "R = NOT R" },
  { id: "read", operands: "R, a", does: "R = RAM[a]" },
  { id: "write", operands: "R, a", does: "RAM[a] = R" },
  { id: "jump", operands: "a", does: "the next instruction is at program address a" },
  { id: "jump if zero", operands: "R, a", does: "jump to a if R is 0" },
  { id: "in", operands: "R, d", does: "R = the next value from device d" },
  { id: "out", operands: "R, d", does: "send R to device d" },
] as const satisfies readonly { id: string; operands: string; does: string }[];

export type InstructionID = (typeof INSTRUCTIONS)[number]["id"];

// The opcodes run 0 to 15: four signals.
export const OPCODES = 16;
export const OPCODE_LIST = Array.from({ length: OPCODES }, (_, n) => n);
export const MAX_MNEMONIC = 6;

// One row of the table. An opcode not picked yet is null.
export interface InstructionRow {
  mnemonic: string;
  opcode: number | null;
}

// A row missing from the table, as from a save, reads as blank.
export type InstructionSet = Partial<Record<InstructionID, InstructionRow>>;

const BLANK_ROW: InstructionRow = { mnemonic: "", opcode: null };
export const rowOf = (set: InstructionSet, id: InstructionID): InstructionRow => set[id] ?? BLANK_ROW;

function isComplete<T>(rows: Partial<Record<InstructionID, T>>): rows is Record<InstructionID, T> {
  return INSTRUCTIONS.every(({ id }) => id in rows);
}

// A value for each instruction, in table order.
function table<T>(row: (id: InstructionID, i: number) => T): Record<InstructionID, T> {
  const rows: Partial<Record<InstructionID, T>> = Object.fromEntries(INSTRUCTIONS.map(({ id }, i) => [id, row(id, i)]));
  if (!isComplete(rows)) throw new Error("A row is missing from the instruction table");
  return rows;
}

// Bitbox's picks: HALT is 0 so blank program memory stops the CPU, and the
// names match escape.asm on the vision board.
const BITBOX_NAMES: Record<InstructionID, string> = {
  halt: "HALT",
  set: "SET",
  copy: "COPY",
  add: "ADD",
  subtract: "SUB",
  and: "AND",
  or: "OR",
  xor: "XOR",
  not: "NOT",
  read: "READ",
  write: "WRITE",
  jump: "JMP",
  "jump if zero": "JZ",
  in: "IN",
  out: "OUT",
};

export const BITBOX_INSTRUCTION_SET: InstructionSet = table((id, i) => ({ mnemonic: BITBOX_NAMES[id], opcode: i }));

export type Problem = "needed" | "used twice" | "letters only" | "too long";

export interface RowCheck {
  mnemonic: Problem | null;
  opcode: Problem | null;
  // Nothing typed or picked yet, so "needed" isn't worth showing.
  blank: boolean;
}

// The problems worth showing for a row: a blank row isn't marked "needed"
// until the player has started on it.
export function shownProblems(row: RowCheck): { mnemonic: Problem | null; opcode: Problem | null } {
  const shown = (problem: Problem | null): Problem | null => (row.blank && problem === "needed" ? null : problem);
  return { mnemonic: shown(row.mnemonic), opcode: shown(row.opcode) };
}

export interface InstructionSetCheck {
  rows: Record<InstructionID, RowCheck>;
  // How many rows have no problem.
  good: number;
  // The opcodes no row has.
  spare: number[];
  solved: boolean;
}

// Mnemonics are kept in capitals, so typing is case-insensitive.
export const normalMnemonic = (typed: string): string => typed.trim().toUpperCase();

function mnemonicProblem(mnemonic: string, count: number): Problem | null {
  if (mnemonic === "") return "needed";
  if (!/^[A-Z]+$/u.test(mnemonic)) return "letters only";
  if (mnemonic.length > MAX_MNEMONIC) return "too long";
  return count > 1 ? "used twice" : null;
}

function opcodeProblem(opcode: number | null, counts: Map<number, number>): Problem | null {
  if (opcode === null) return "needed";
  return (counts.get(opcode) ?? 0) > 1 ? "used twice" : null;
}

// Gives each row's problem, if it has one: a duplicate marks every row that
// shares the name or number.
export function checkInstructionSet(set: InstructionSet): InstructionSetCheck {
  const ids = INSTRUCTIONS.map(({ id }) => id);
  const names = new Map<string, number>();
  const numbers = new Map<number, number>();
  for (const id of ids) {
    const { mnemonic, opcode } = rowOf(set, id);
    const name = normalMnemonic(mnemonic);
    names.set(name, (names.get(name) ?? 0) + 1);
    if (opcode !== null) numbers.set(opcode, (numbers.get(opcode) ?? 0) + 1);
  }
  const rows = table((id): RowCheck => {
    const { mnemonic, opcode } = rowOf(set, id);
    const name = normalMnemonic(mnemonic);
    return {
      mnemonic: mnemonicProblem(name, names.get(name) ?? 0),
      opcode: opcodeProblem(opcode, numbers),
      blank: name === "" && opcode === null,
    };
  });
  const good = ids.filter((id) => rows[id].mnemonic === null && rows[id].opcode === null).length;
  const spare = OPCODE_LIST.filter((n) => !numbers.has(n));
  return { rows, good, spare, solved: good === ids.length };
}
