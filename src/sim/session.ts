import type { Game } from "./circuit";
import { applyInputs, checkLevel, LEVELS, loadLevel, type CheckResult, type Level } from "./level";

// Where solved progress lives: the number of levels solved, in order.
export interface ProgressStore {
  load(): number;
  save(solved: number): void;
}

export function memoryProgress(initial = 0): ProgressStore {
  let value = initial;
  return { load: () => value, save: (v) => void (value = v) };
}

export function localProgress(key = "abstract.solved"): ProgressStore {
  return {
    load: () => {
      try {
        return Number(localStorage.getItem(key)) || 0;
      } catch {
        return 0;
      }
    },
    save: (v) => {
      try {
        localStorage.setItem(key, String(v));
      } catch {}
    },
  };
}

// One player's play: the current level and board, a test run stepping
// through the truth table one row at a time, and solved progress. Time
// lives outside; the caller decides when to step.
export class Session {
  levelIndex = 0;
  game: Game = loadLevel(LEVELS[0]!);
  solved: number;
  // Bumped whenever a test run begins or is aborted, so a caller holding a
  // run can tell it's stale.
  run = 0;
  testing = false;
  currentRow: number | null = null;
  // Per truth table row: undefined until tested, else what the circuit output.
  rowResults: (boolean | undefined)[] = [];
  result: CheckResult | null = null;
  private check: CheckResult | null = null;

  constructor(private store: ProgressStore) {
    this.solved = store.load();
  }

  get level(): Level {
    return LEVELS[this.levelIndex]!;
  }

  get unlockedCount(): number {
    return Math.min(this.solved + 1, LEVELS.length);
  }

  // Loads a fresh board, aborting any test run without recording a result.
  start(index: number): void {
    this.levelIndex = index;
    this.game = loadLevel(LEVELS[index]!);
    this.run++;
    this.testing = false;
    this.check = null;
    this.currentRow = null;
    this.rowResults = [];
    this.result = null;
  }

  // Returns false if a run is already going.
  beginTest(): boolean {
    if (this.testing) return false;
    this.run++;
    this.testing = true;
    this.check = checkLevel(this.game, this.levelIndex);
    this.currentRow = null;
    this.rowResults = [];
    this.result = null;
    return true;
  }

  // Shows the next row on the board. Once every row has been shown, ends
  // the run and records the result. Returns whether a row was shown.
  step(): boolean {
    const check = this.check;
    if (!this.testing || !check) return false;
    const next = this.currentRow === null ? 0 : this.currentRow + 1;
    const row = check.rows[next];
    if (row) {
      applyInputs(this.game, this.level, row.inputs);
      this.currentRow = next;
      this.rowResults = Object.assign([...this.rowResults], { [next]: row.actual });
      return true;
    }
    this.testing = false;
    this.check = null;
    this.currentRow = null;
    this.result = check;
    if (check.passed && this.levelIndex + 1 > this.solved) {
      this.solved = this.levelIndex + 1;
      this.store.save(this.solved);
    }
    return false;
  }
}
