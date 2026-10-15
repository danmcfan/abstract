import { createSignal } from "solid-js";
import type { Game } from "../sim/circuit";
import { Driver } from "../sim/driver";
import type { InstructionSet } from "../sim/instruction";
import type { NodeType } from "../sim/node";
import { localSave } from "../sim/save";
import { Session } from "../sim/session";
import type { Cue } from "../sim/story";
import { sound } from "./sound";

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

export function placePart(type: NodeType, width = 1): void {
  mutate(() => {
    live.place(type, width);
  });
}

// Changes rows of the instruction set, giving what Bitbox says about it.
export function editInstructions(rows: InstructionSet): Cue | null {
  const cue = live.editInstructions(rows);
  touch();
  return cue;
}

// Whether Run is ticking the clock.
export const running = (): boolean => (version(), driver.running);
