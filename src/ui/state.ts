import { batch, createSignal } from "solid-js";
import { propagate } from "../sim/circuit";
import { applyInputs, checkLevel, LEVELS, loadLevel, type CheckResult } from "../sim/level";
import type { Game } from "../sim/node";

// The sim mutates plain objects in place. Every change goes through mutate(),
// which settles the circuit and bumps a version signal; readers call
// current() inside a reactive scope to rerun when anything changes.

const TEST_STEP_MS = 600;
const PROGRESS_KEY = "abstract.solved";

const [game, setGame] = createSignal<Game>(loadLevel(LEVELS[0]!));
const [version, setVersion] = createSignal(0);

export function current(): Game {
  version();
  return game();
}

export function mutate(change: (game: Game) => void): void {
  change(game());
  propagate(game());
  setVersion((v) => v + 1);
}

// Level progress

export const [levelIndex, setLevelIndex] = createSignal(0);
export const [solved, setSolved] = createSignal(loadProgress());
export const [testing, setTesting] = createSignal(false);
// Per truth table row: undefined until tested, else what the circuit output.
export const [rowResults, setRowResults] = createSignal<(boolean | undefined)[]>([]);
export const [currentRow, setCurrentRow] = createSignal<number | null>(null);
export const [result, setResult] = createSignal<CheckResult | null>(null);

export const level = () => LEVELS[levelIndex()]!;
export const unlockedCount = () => Math.min(solved() + 1, LEVELS.length);

export function startLevel(index: number): void {
  batch(() => {
    setLevelIndex(index);
    setGame(loadLevel(LEVELS[index]!));
    setRowResults([]);
    setCurrentRow(null);
    setResult(null);
  });
  mutate(() => {});
}

// Steps through the truth table on the board so the player can watch each
// row, then reports the result.
export async function runTest(): Promise<void> {
  if (testing()) return;
  const index = levelIndex();
  const check = checkLevel(game(), index);
  batch(() => {
    setTesting(true);
    setResult(null);
    setRowResults([]);
  });
  for (const [i, row] of check.rows.entries()) {
    mutate((g) => applyInputs(g, level(), row.inputs));
    batch(() => {
      setCurrentRow(i);
      setRowResults((results) => Object.assign([...results], { [i]: row.actual }));
    });
    await new Promise((resolve) => setTimeout(resolve, TEST_STEP_MS));
    if (index !== levelIndex()) break;
  }
  setTesting(false);
  if (index !== levelIndex()) return;
  batch(() => {
    setCurrentRow(null);
    setResult(check);
    if (check.passed && index + 1 > solved()) {
      setSolved(index + 1);
      saveProgress(index + 1);
    }
  });
}

function loadProgress(): number {
  try {
    return Number(localStorage.getItem(PROGRESS_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveProgress(value: number): void {
  try {
    localStorage.setItem(PROGRESS_KEY, String(value));
  } catch {}
}
