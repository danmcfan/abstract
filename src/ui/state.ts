import { createSignal } from "solid-js";
import type { Game } from "../sim/circuit";
import { Driver } from "../sim/driver";
import type { InstructionSet } from "../sim/instruction";
import type { NodeType } from "../sim/node";
import { localSave } from "../sim/save";
import { Session } from "../sim/session";
import type { Cue } from "../sim/story";
import { sound } from "./sound";
import { speak } from "./speech";

// Adapts the session to Solid. The sim mutates plain objects in place and
// settles itself; every change bumps a version signal, so readers that call
// session() or current() inside a reactive scope rerun when anything
// changes. Board edits go through mutate(); level changes and timing go
// through the driver.

const live = new Session(localSave(), sound);
const [version, setVersion] = createSignal(0);
const touch = (): void => {
  setVersion((v) => v + 1);
};

export const driver = new Driver(
  live,
  {
    every: (ms, task): (() => void) => {
      const timer = setInterval(task, ms);
      return () => {
        clearInterval(timer);
      };
    },
  },
  touch,
  speak,
);

export function session(): Session {
  version();
  return live;
}

export function current(): Game {
  return session().game;
}

export function mutate(change: (game: Game) => void): void {
  live.edit(change);
  touch();
}

export function placePart(type: NodeType, width = 1, at?: { x: number; y: number }): void {
  mutate(() => {
    live.place(type, width, at);
  });
}

// A part being dragged out of the parts bin, and the board point under the
// pointer, or null while it's off the board.
export interface BinDrag {
  type: NodeType;
  width: number;
  at: { x: number; y: number } | null;
}
export const [binDrag, setBinDrag] = createSignal<BinDrag | null>(null);

// Changes rows of the instruction set, giving what Bitbox says about it.
export function editInstructions(rows: InstructionSet): Cue | null {
  const cue = live.editInstructions(rows);
  touch();
  return cue;
}

// Changes the door program's text.
export function editDoorProgram(text: string): void {
  live.editDoorProgram(text);
  touch();
}

// Types a name on the door's keypad.
export function typeName(name: string): void {
  live.typeName(name);
  touch();
}

// Whether Run is ticking the clock.
export const running = (): boolean => (version(), driver.running);
