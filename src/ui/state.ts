import { createSignal } from "solid-js";
import type { Game } from "../sim/circuit";
import type { NodeType } from "../sim/node";
import { localSave } from "../sim/save";
import { Session } from "../sim/session";
import { sound } from "./sound";

// The sim mutates plain objects in place and settles itself. Every change
// goes through mutate(), which bumps a version signal; readers call
// current() or the accessors below inside a reactive scope to rerun when
// anything changes.

const TEST_STEP_MS = 600;

const session = new Session(localSave(), sound);
const [version, setVersion] = createSignal(0);
const touch = () => setVersion((v) => v + 1);
const read = <T,>(get: () => T) => () => (version(), get());

export function current(): Game {
  version();
  return session.game;
}

export function mutate(change: (game: Game) => void): void {
  session.edit(change);
  touch();
}

export function placePart(type: NodeType, width = 1): void {
  mutate(() => session.place(type, width));
}

export const levelIndex = read(() => session.levelIndex);
export const level = read(() => session.level);
export const solved = read(() => session.solved);
export const testing = read(() => session.testing);
export const currentRow = read(() => session.currentRow);
export const rowResults = read(() => session.rowResults);
export const tableRows = read(() => session.tableRows);
export const result = read(() => session.result);
export const stamped = read(() => session.stamped);

export const hasSave = read(() => session.hasSave);
export const savedLevel = read(() => session.savedLevel);

export function startLevel(index: number): void {
  session.start(index);
  touch();
}

// Throws away the current level's board for a fresh one.
export function clearBoard(): void {
  session.clear();
  touch();
}

export function continueGame(): void {
  session.resume();
  touch();
}

export function newGame(): void {
  session.reset();
  touch();
}

// Story flags, such as which robot lines the player has heard. Saved with
// the game, so a new game hears them again.
export const hasFlag = (flag: string) => (version(), session.flags.has(flag));

export function setFlag(flag: string): void {
  session.flags.add(flag);
  session.save();
}

// Runs speak() the first time only, remembering it with a story flag.
export function once(flag: string, speak: () => void): void {
  if (session.flags.has(flag)) return;
  setFlag(flag);
  speak();
}

// Steps through the truth table on the board so the player can watch each
// row, then reports the result.
export async function runTest(): Promise<void> {
  if (!session.beginTest()) return;
  const run = session.run;
  touch();
  while (session.step()) {
    touch();
    await new Promise((resolve) => setTimeout(resolve, TEST_STEP_MS));
    if (session.run !== run) return;
  }
  touch();
}
