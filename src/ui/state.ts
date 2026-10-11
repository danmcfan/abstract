import { createSignal } from "solid-js";
import type { Game } from "../sim/circuit";
import { localProgress, Session } from "../sim/session";

// The sim mutates plain objects in place and settles itself. Every change
// goes through mutate(), which bumps a version signal; readers call
// current() or the accessors below inside a reactive scope to rerun when
// anything changes.

const TEST_STEP_MS = 600;

const session = new Session(localProgress());
const [version, setVersion] = createSignal(0);
const touch = () => setVersion((v) => v + 1);
const read = <T,>(get: () => T) => () => (version(), get());

export function current(): Game {
  version();
  return session.game;
}

export function mutate(change: (game: Game) => void): void {
  change(session.game);
  touch();
}

export const levelIndex = read(() => session.levelIndex);
export const level = read(() => session.level);
export const solved = read(() => session.solved);
export const unlockedCount = read(() => session.unlockedCount);
export const testing = read(() => session.testing);
export const currentRow = read(() => session.currentRow);
export const rowResults = read(() => session.rowResults);
export const result = read(() => session.result);

export function startLevel(index: number): void {
  session.start(index);
  touch();
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
