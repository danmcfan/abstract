import { assemble, DOOR, KEYPAD, type Instruction } from "./cpu";
import { INSTRUCTIONS, normalMnemonic, rowOf, type InstructionSet } from "./instruction";
import type { Value } from "./node";

// Reads the door program as the player types it: one instruction per line,
// a mnemonic from their instruction set and then its operands, separated by
// commas. "name:" at the start of a line is a label, and ";" starts a comment.

export interface LineError {
  // Counted from 1, as the editor numbers its lines.
  line: number;
  problem: string;
}

export interface Assembly {
  // The program memory words, one per instruction.
  words: Value[];
  errors: LineError[];
}

const PROGRAM_LENGTH = 256;

const DEVICE_NAMES: Record<string, Value> = { DOOR, KEYPAD };
const LABEL = /^([A-Za-z_][A-Za-z0-9_]*):/u;

// A line with its comment and label taken off, and its label.
interface Parsed {
  line: number;
  label: string | null;
  code: string;
}

function parse(text: string): Parsed[] {
  return text.split("\n").map((raw, i) => {
    const code = (raw.split(";")[0] ?? "").trim();
    const label = LABEL.exec(code);
    return label
      ? { line: i + 1, label: label[1] ?? "", code: code.slice(label[0].length).trim() }
      : { line: i + 1, label: null, code };
  });
}

function number(text: string): Value | null {
  let value = NaN;
  if (/^0x[0-9a-f]+$/iu.test(text)) value = parseInt(text, 16);
  else if (/^\d+$/u.test(text)) value = Number(text);
  return value >= 0 && value <= 255 ? value : null;
}

class Mistake extends Error {}

// One operand, by the letter INSTRUCTIONS gives it. An address can be a
// label, which labels gives the address of.
function operand(kind: string, text: string, labels: Map<string, number>): Value {
  if (kind === "R" || kind === "S") {
    const register = /^R([0-3])$/iu.exec(text);
    if (!register) throw new Mistake(`${text} isn't a register: use R0 to R3.`);
    return Number(register[1]);
  }
  if (kind === "d") {
    const device = DEVICE_NAMES[text.toUpperCase()];
    if (device === undefined) throw new Mistake(`${text} isn't a device: use DOOR or KEYPAD.`);
    return device;
  }
  if (kind === "a" && LABEL.test(`${text}:`) && !/^\d/u.test(text)) {
    const address = labels.get(text.toUpperCase());
    if (address === undefined) throw new Mistake(`There's no label called ${text}.`);
    return address;
  }
  const value = number(text);
  if (value === null) throw new Mistake(`${text} isn't a number from 0 to 255.`);
  return value;
}

function instruction(set: InstructionSet, code: string, labels: Map<string, number>): Instruction {
  const [word = "", ...rest] = code.split(/\s+/u);
  const mnemonic = normalMnemonic(word);
  const found = INSTRUCTIONS.find(({ id }) => rowOf(set, id).mnemonic === mnemonic);
  if (!found) throw new Mistake(`${word} isn't in your instruction set.`);
  const kinds = found.operands === "" ? [] : found.operands.split(", ");
  const joined = rest.join(" ").trim();
  const texts = joined === "" ? [] : joined.split(",").map((part) => part.trim());
  if (texts.length !== kinds.length)
    throw new Mistake(
      kinds.length === 0
        ? `${mnemonic} takes no operands.`
        : `${mnemonic} takes ${kinds.length} operand${kinds.length === 1 ? "" : "s"}: ${found.operands}.`,
    );
  const values = kinds.map((kind, i) => operand(kind, texts[i] ?? "", labels));
  const written: Instruction = { op: found.id };
  kinds.forEach((kind, i) => {
    const value = values[i] ?? 0;
    if (kind === "R") written.r = value;
    else if (kind === "S") written.s = value;
    else written.n = value;
  });
  return written;
}

// Labels are found first, so a jump can go forward. Every line with a
// mistake is marked; the program only has words once there are none.
export function assembleProgram(set: InstructionSet, text: string): Assembly {
  const lines = parse(text);
  const labels = new Map<string, number>();
  const errors: LineError[] = [];
  let address = 0;
  for (const { line, label, code } of lines) {
    if (label !== null) {
      if (labels.has(label.toUpperCase())) errors.push({ line, problem: `The label ${label} is used twice.` });
      else labels.set(label.toUpperCase(), address);
      if (address >= PROGRAM_LENGTH && code === "")
        errors.push({ line, problem: `The label ${label} is past the end of program memory.` });
    }
    if (code === "") continue;
    address++;
    if (address === PROGRAM_LENGTH + 1)
      errors.push({ line, problem: `Program memory holds only ${PROGRAM_LENGTH} instructions.` });
  }
  const program: Instruction[] = [];
  for (const { line, code } of lines) {
    if (code === "") continue;
    try {
      program.push(instruction(set, code, labels));
    } catch (mistake) {
      if (!(mistake instanceof Mistake)) throw mistake;
      errors.push({ line, problem: mistake.message });
    }
  }
  errors.sort((a, b) => a.line - b.line);
  return { words: errors.length === 0 ? assemble(set, program) : [], errors };
}
