import type { Game } from "./circuit";
import { placeNode } from "./circuit";
import { GRID_HEIGHT, GRID_WIDTH } from "./grid";
import { applyInputs, checkLevel, LEVELS, loadLevel, matches, type CheckResult, type Level } from "./level";
import type { NodeType } from "./node";
import { loadBoard, saveBoard, type SaveStore } from "./save";
import { silent, type Sound } from "./sound";

// One player's play: the current level and board, a test run stepping
// through the truth table one row at a time, solved progress, and story
// flags. Time lives outside; the caller decides when to step. The board is
// edited in place by the caller, which calls save() afterwards. A test run
// plays its sound cues as it goes.
export class Session {
  levelIndex = 0;
  game: Game = loadLevel(LEVELS[0]!);
  solved: number;
  // Bumped whenever a test run begins or is aborted, so a caller holding a
  // run can tell it's stale.
  run = 0;
  testing = false;
  currentRow: number | null = null;
  // Per truth table row: undefined until tested, else what the circuit
  // output, one value per output.
  rowResults: (boolean[] | undefined)[] = [];
  result: CheckResult | null = null;
  flags = new Set<string>();
  private check: CheckResult | null = null;

  constructor(
    private store: SaveStore,
    private sound: Sound = silent,
  ) {
    this.solved = store.load()?.solved ?? 0;
  }

  // Whether there's a game to continue.
  get hasSave(): boolean {
    return this.store.load() !== null;
  }

  // The level a resumed game opens on: where it was saved, if that's
  // unlocked.
  get savedLevel(): number {
    const data = this.store.load();
    if (!data) return 0;
    const unlocked = Math.min(data.solved + 1, LEVELS.length);
    return Math.max(0, Math.min(data.levelIndex, unlocked - 1));
  }

  // Picks up the saved game where it left off, board and all.
  resume(): void {
    const data = this.store.load();
    if (!data) return this.reset();
    const index = this.savedLevel;
    this.solved = Math.min(data.solved, LEVELS.length);
    this.flags = new Set(data.flags);
    this.start(index);
    if (data.board && data.levelIndex === index) {
      this.game = loadBoard(data.board);
      this.save();
    }
  }

  // Throws away the saved game and starts over from the first level.
  reset(): void {
    this.store.clear();
    this.solved = 0;
    this.flags = new Set();
    this.start(0);
  }

  save(): void {
    this.store.save({
      solved: this.solved,
      levelIndex: this.levelIndex,
      board: saveBoard(this.game),
      flags: [...this.flags],
    });
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
    this.save();
  }

  // Drops a part from the parts bin in the middle of the board.
  place(type: NodeType): void {
    if (!placeNode(this.game, type, { x: GRID_WIDTH / 2, y: GRID_HEIGHT / 2 })) return;
    this.sound.play("place");
    this.save();
  }

  // Returns false if a run is already going. Every row is checked here, out
  // of sight and without a sound; step() shows them, one tick each.
  beginTest(): boolean {
    if (this.testing) return false;
    this.sound.play("carriage");
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
      this.sound.play(matches(row.actual, row.expected) ? "tick" : "fail-tick");
      return true;
    }
    this.testing = false;
    this.check = null;
    this.currentRow = null;
    this.result = check;
    if (check.passed) {
      this.sound.play("stamp");
      this.sound.play("bell");
    } else this.sound.play("fail-stamp");
    if (check.passed && this.levelIndex + 1 > this.solved) {
      this.solved = this.levelIndex + 1;
      this.save();
    }
    return false;
  }
}
