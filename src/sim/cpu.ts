import { INSTRUCTIONS, rowOf, type InstructionID, type InstructionSet } from "./instruction";
import type { Memory } from "./kind";
import type { State, Value } from "./node";

// The CPU (L8): four 8-signal registers, 8 places of RAM and 256 addresses
// of program memory. The game fixes what each instruction does, and the
// player's instruction set gives its opcode (ADR 7).

// One instruction as a program writes it: what it is, its registers R and
// S, and its number n, a or d. Operands it doesn't take are 0.
export interface Instruction {
  op: InstructionID;
  r?: number;
  s?: number;
  n?: Value;
}

// The devices a program reads from and sends to, by number.
export const DOOR = 1;
export const KEYPAD = 2;
const DEVICES: Partial<Record<Value, string>> = { [DOOR]: "DOOR", [KEYPAD]: "KEYPAD" };

// I from its fields, and the fields of an I: the opcode in the top four
// signals, then R and S, as the instruction register splits it.
export const joinFields = (opcode: Value, r: Value, s: Value): Value => ((opcode & 15) << 4) | ((r & 3) << 2) | (s & 3);

export const fields = (i: Value): { opcode: Value; r: Value; s: Value } => ({
  opcode: i >> 4,
  r: (i >> 2) & 3,
  s: i & 3,
});

// The two bytes at one program memory address: I is the opcode (the top
// four signals), then R and S; N is the number.
export function encode(set: InstructionSet, { op, r = 0, s = 0, n = 0 }: Instruction): [I: Value, N: Value] {
  const opcode = rowOf(set, op).opcode ?? 0;
  return [joinFields(opcode, r, s), n & 0xff];
}

const INSTRUCTION_IDS = INSTRUCTIONS.map(({ id }) => id);

// The instruction an opcode means in the set, or null for the spare one.
function decode(set: InstructionSet, opcode: Value): InstructionID | null {
  return INSTRUCTION_IDS.find((id) => rowOf(set, id).opcode === opcode) ?? null;
}

// The instructions that write register R, and those that don't.
const WRITES: ReadonlySet<InstructionID> = new Set<InstructionID>([
  "set",
  "copy",
  "add",
  "subtract",
  "and",
  "or",
  "xor",
  "not",
  "read",
  "in",
]);

// Each OP signal is on unless the instruction is one of these (ADR 9): so
// add is 0, subtract 1, and 4, or 5, xor 6, and not, like every
// instruction that doesn't use the ALU, 7.
const OP_OFF: readonly (readonly InstructionID[])[] = [
  ["add", "and", "xor"],
  ["add", "subtract", "and", "or"],
  ["add", "subtract"],
];

// What the value R takes comes from, by SRC: 0 is S, for copy; 1 is N,
// for set; 2 is RAM or DIN, for read and in; and 3, for the rest, the ALU.
// Each SRC signal is on unless the instruction is one of these.
const SRC_OFF: readonly (readonly InstructionID[])[] = [
  ["copy", "read", "in"],
  ["copy", "set"],
];

const bits = (off: readonly (readonly InstructionID[])[], id: InstructionID | null): Value =>
  off.reduce((value, ids, bit) => value | (id !== null && ids.includes(id) ? 0 : 1 << bit), 0);

// The op encoder's output for an opcode: the ALU's OP.
export function opEncoder(set: InstructionSet, [opcode = 0]: Value[]): Value[] {
  return [bits(OP_OFF, decode(set, opcode))];
}

// The write encoder's outputs for an opcode: WRITE, and SRC.
export function writeEncoder(set: InstructionSet, [opcode = 0]: Value[]): Value[] {
  const id = decode(set, opcode);
  return [id !== null && WRITES.has(id) ? 1 : 0, bits(SRC_OFF, id)];
}

// The control unit's outputs for an opcode and the value of register R:
// STORE, JUMP, IN, OUT and HALT.
export function control(set: InstructionSet, [opcode = 0, a = 0]: Value[]): Value[] {
  const id = decode(set, opcode);
  const is = (op: InstructionID): Value => (id === op ? 1 : 0);
  return [is("write"), is("jump") | (is("jump if zero") & (a === 0 ? 1 : 0)), is("in"), is("out"), is("halt")];
}

// The ALU's operations, by OP (ADR 9).
function alu(op: Value, a: Value, b: Value): Value {
  const results = [a + b, a - b, 0, 0, a & b, a | b, a ^ b, ~a];
  return (results[op] ?? 0) & 0xff;
}

// The execute unit's registers and RAM: R0 to R3, then RAM's 8 places.
type Places = readonly Value[];
const REGISTER_COUNT = 4;
const RAM_PLACES = 8;

// The registers after one instruction: R takes S, N, RAM or DIN, or the
// ALU's result, as the write encoder says. IN picks DIN over RAM.
function afterWrite(
  set: InstructionSet,
  registers: Places,
  [opcode = 0, r = 0, s = 0, n = 0, ram = 0, din = 0, input = 0]: Value[],
): Value[] {
  const reg = (k: number): Value => registers[k] ?? 0;
  const [write = 0, src = 0] = writeEncoder(set, [opcode]);
  const [op = 0] = opEncoder(set, [opcode]);
  const sources = [reg(s), n, input ? din : ram, alu(op, reg(r), reg(s))];
  return Array.from({ length: REGISTER_COUNT }, (_, k) => (k === r && write ? (sources[src] ?? 0) : reg(k)));
}

// The register unit: CLK, OPCODE, R, S, N, RAM, DIN and IN in, A out. On a
// tick register R takes what the opcode says, and A shows register R.
export function registerUnit(set: InstructionSet): Memory {
  return {
    next: ([clk = 0, ...inputs], [seen = 0, ...registers]) => [
      clk,
      ...(clk && !seen ? afterWrite(set, registers, inputs) : registers),
    ],
    outputs: ([, ...registers], [, , r = 0]) => [registers[r] ?? 0],
  };
}

// Does one instruction to the registers and RAM, with DIN as the value a
// device gives.
function step(set: InstructionSet, places: Places, opcode: Value, r: Value, s: Value, n: Value, din: Value): Places {
  const value = places[r] ?? 0;
  const [store = 0, , input = 0] = control(set, [opcode, value]);
  const ram = places.slice(REGISTER_COUNT, REGISTER_COUNT + RAM_PLACES);
  const registers = afterWrite(set, places.slice(0, REGISTER_COUNT), [
    opcode,
    r,
    s,
    n,
    ram[n % RAM_PLACES] ?? 0,
    din,
    input,
  ]);
  return [
    ...registers,
    ...Array.from({ length: RAM_PLACES }, (_, k) => (k === n % RAM_PLACES && store ? value : (ram[k] ?? 0))),
  ];
}

// The registers in an execute unit's state: after the clock it last saw.
export function registersOf(state: State): Value[] {
  return state.slice(1, 1 + REGISTER_COUNT);
}

// Where the CPU's outputs sit in what it reads: OUT, DOUT, DEV, IN, HALT.
const [OUT, DOUT, , IN, HALT] = [0, 1, 2, 3, 4];

// The execute unit's outputs: JUMP, OUT, DOUT, IN and HALT. DOUT always
// shows R: it only matters while OUT is on.
function executeOutputs(set: InstructionSet, places: Places, opcode: Value, r: Value): Value[] {
  const value = places[r] ?? 0;
  const [, jump = 0, input = 0, out = 0, halt = 0] = control(set, [opcode, value]);
  return [jump, out, value, input, halt];
}

// The execute unit: CLK, OPCODE, R, S, N and DIN in. On each tick it does
// the instruction with number N. Its state is the clock it last saw, then
// its places.
export function executeUnit(set: InstructionSet): Memory {
  return {
    next: ([clk = 0, opcode = 0, r = 0, s = 0, n = 0, din = 0], [seen = 0, ...places]) => [
      clk,
      ...(clk && !seen ? step(set, places, opcode, r, s, n, din) : places),
    ],
    outputs: ([, ...places], [, opcode = 0, r = 0]) => executeOutputs(set, places, opcode, r),
  };
}

// The words in program memory, one per address: I in the high byte and N
// in the low one.
export function assemble(set: InstructionSet, program: readonly Instruction[]): Value[] {
  return program.map((instruction) => {
    const [i, n] = encode(set, instruction);
    return (i << 8) | n;
  });
}

// The CPU's state: the clock it last saw, the program counter, EXEC, the
// instruction and number it fetched, the execute unit's places, then its
// program memory.
const PC = 1;
const EXEC = 2;
const FETCHED = 3;
const NUMBER = FETCHED + 1;
const PLACES = 5;
const PROGRAM = PLACES + REGISTER_COUNT + RAM_PLACES;

// A CPU that holds a program, with everything else at 0.
function loaded(words: readonly Value[]): Value[] {
  return [...Array.from({ length: PROGRAM }, () => 0), ...words];
}

// The CPU: CLK and DIN in; OUT, DOUT, DEV, IN and HALT out. On a fetch tick
// it takes the instruction at the program counter, which adds 1, and the
// execute unit does it as EXEC turns on. On an execute tick a jump loads the
// program counter. Once it fetches HALT, ticks change nothing. This is what
// the intended board does, tick for tick.
export function cpu(set: InstructionSet): Memory {
  const halted = (state: State): boolean =>
    (state[EXEC] ?? 0) === 1 && decode(set, fields(state[FETCHED] ?? 0).opcode) === "halt";
  return {
    next: ([clk = 0, din = 0], state) => {
      const ticked = clk === 1 && (state[0] ?? 0) === 0;
      const next = [clk, ...state.slice(1)];
      if (!ticked || halted(state)) return next;
      const pc = state[PC] ?? 0;
      const places = state.slice(PLACES, PROGRAM);
      if ((state[EXEC] ?? 0) === 0) {
        const word = state[PROGRAM + pc] ?? 0;
        const [i, n] = [word >> 8, word & 0xff];
        const { opcode, r, s } = fields(i);
        next.splice(PC, PROGRAM - PC, (pc + 1) & 0xff, 1, i, n, ...step(set, places, opcode, r, s, n, din));
      } else {
        const { opcode, r } = fields(state[FETCHED] ?? 0);
        const [jump = 0] = executeOutputs(set, places, opcode, r);
        next[PC] = jump === 1 ? (state[NUMBER] ?? 0) : pc;
        next[EXEC] = 0;
      }
      return next;
    },
    // DEV is the number N.
    outputs: (state) => {
      const { opcode, r } = fields(state[FETCHED] ?? 0);
      const [, out = 0, dout = 0, input = 0, halt = 0] = executeOutputs(set, state.slice(PLACES, PROGRAM), opcode, r);
      return [out, dout, state[NUMBER] ?? 0, input, halt];
    },
  };
}

// Something that runs a program a tick at a time: the CPU's spec, or a
// board. It reads OUT, DOUT, DEV, IN and HALT.
export interface Machine {
  tick(din: Value): void;
  read(din: Value): Value[];
}

export interface Outcome {
  // The values sent with out, in order.
  outs: Value[];
  // False if it ran out of ticks first.
  halted: boolean;
}

// Runs a program, pausing after each instruction is fetched. A device gives
// the values in turn, moving on after each in. The run ends once HALT stays
// on through two more ticks, or after the tick limit.
export function* play(machine: Machine, device: readonly Value[], limit: number): Generator<void, Outcome> {
  const outs: Value[] = [];
  let at = 0;
  let ticks = 0;
  const din = (): Value => device[at] ?? 0;
  const tick = (): void => {
    machine.tick(din());
    ticks++;
  };
  tick();
  for (;;) {
    if (ticks >= limit) return { outs, halted: false };
    yield;
    const read = machine.read(din());
    if (read[HALT] === 1) {
      tick();
      tick();
      if (machine.read(din())[HALT] === 1) return { outs, halted: true };
      continue;
    }
    if (read[OUT] === 1) outs.push(read[DOUT] ?? 0);
    tick();
    if (read[IN] === 1) at++;
    tick();
  }
}

// Runs a generator to its end.
export function finish<T>(run: Generator<void, T>): T {
  for (;;) {
    const next = run.next();
    if (next.done === true) return next.value;
  }
}

// Runs a program on the CPU's spec.
export function runOnSpec(
  set: InstructionSet,
  program: readonly Instruction[],
  device: readonly Value[],
  limit: number,
): Outcome {
  const spec = cpu(set);
  let state: State = loaded(assemble(set, program));
  const machine: Machine = {
    tick: (din) => {
      state = spec.next([0, din], spec.next([1, din], state));
    },
    read: () => spec.outputs(state, []),
  };
  return finish(play(machine, device, limit));
}

// An instruction as a program writes it, in the player's mnemonics: its
// registers as R0 to R3, and a device by its name.
export function describeInstruction(set: InstructionSet, i: Value, n: Value): string {
  const { opcode, r, s } = fields(i);
  const id = decode(set, opcode);
  if (id === null) return `opcode ${opcode}, spare`;
  const operand: Record<string, string> = { R: `R${r}`, S: `R${s}`, n: `${n}`, a: `${n}`, d: DEVICES[n] ?? `${n}` };
  const { operands } = INSTRUCTIONS.find((instruction) => instruction.id === id) ?? { operands: "" };
  const written = operands === "" ? [] : operands.split(", ").map((name) => operand[name] ?? name);
  return [rowOf(set, id).mnemonic, written.join(", ")].filter((part) => part !== "").join(" ");
}

// What a running program reads from with in and sends to with out, by
// device number.
export interface Devices {
  read(device: Value): Value;
  send(device: Value, value: Value): void;
}

// The CPU's spec, ticked one tick at a time with its devices, as the door
// program runs. The execute unit takes DIN on the fetch tick, so a device
// is read then, and only for an in, so only an in moves the keypad on.
export class Computer {
  private state: State;
  private readonly spec: Memory;
  private readonly set: InstructionSet;

  constructor(set: InstructionSet, words: readonly Value[]) {
    this.set = set;
    this.spec = cpu(set);
    this.state = loaded(words);
  }

  tick(devices: Devices): void {
    const fetching = (this.state[EXEC] ?? 0) === 0;
    const word = this.state[PROGRAM + this.programCounter] ?? 0;
    const din = fetching && decode(this.set, word >> 12) === "in" ? devices.read(word & 0xff) : 0;
    this.state = this.spec.next([0, din], this.spec.next([1, din], this.state));
    if (!fetching) return;
    const [out = 0, dout = 0, dev = 0] = this.spec.outputs(this.state, []);
    if (out === 1) devices.send(dev, dout);
  }

  get programCounter(): number {
    return this.state[PC] ?? 0;
  }

  get registers(): Value[] {
    return this.state.slice(PLACES, PLACES + REGISTER_COUNT);
  }

  // The instruction last fetched, written out.
  get instruction(): string {
    return describeInstruction(this.set, this.state[FETCHED] ?? 0, this.state[NUMBER] ?? 0);
  }

  get halted(): boolean {
    return (this.state[EXEC] ?? 0) === 1 && decode(this.set, (this.state[FETCHED] ?? 0) >> 4) === "halt";
  }
}
