import type { Game } from "./circuit";
import { placeNode } from "./circuit";
import { GRID_HEIGHT, GRID_WIDTH } from "./grid";
import { applyInputs, checkLevel, LEVELS, loadLevel, matches, playableCount, type CheckResult, type Level } from "./level";
import type { NodeType } from "./node";
import { loadBoard, saveBoard, type Boards, type SaveStore } from "./save";
import { silent, type Sound } from "./sound";

// One player's play: the current level and board, the board left on every
// other level, a test run stepping through the truth table one row at a
// time, solved progress, and story flags. Time lives outside; the caller
// decides when to step. The caller changes the board through edit(). A test
// run plays its sound cues as it goes.
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
  // Whether the PASSED stamp is on the sheet: the last run passed and the
  // board hasn't changed since.
  stamped = false;
  flags = new Set<string>();
  private boards: Boards = {};
  private check: CheckResult | null = null;

  constructor(
    private store: SaveStore,
    private sound: Sound = silent,
  ) {
    const data = store.load();
    this.solved = data?.solved ?? 0;
    this.boards = data?.boards ?? {};
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
    return Math.max(0, Math.min(data.levelIndex, playableCount(data.solved) - 1));
  }

  // Picks up the saved game where it left off, boards and all.
  resume(): void {
    const data = this.store.load();
    if (!data) return this.reset();
    this.solved = Math.min(data.solved, LEVELS.length);
    this.flags = new Set(data.flags);
    this.boards = data.boards;
    this.start(this.savedLevel);
  }

  // Throws away the saved game and starts over from the first level.
  reset(): void {
    this.store.clear();
    this.solved = 0;
    this.flags = new Set();
    this.boards = {};
    this.start(0);
  }

  // Applies a change to the board and saves it. A change that alters the
  // board takes the stamp off, since the board it vouched for is gone; one
  // that leaves it as it was, like a rejected wire, keeps the stamp.
  edit(change: (game: Game) => void): void {
    const before = JSON.stringify(saveBoard(this.game));
    change(this.game);
    if (JSON.stringify(saveBoard(this.game)) !== before) this.stamped = false;
    this.save();
  }

  save(): void {
    this.boards[this.level.gate] = saveBoard(this.game);
    this.store.save({
      solved: this.solved,
      levelIndex: this.levelIndex,
      boards: this.boards,
      flags: [...this.flags],
    });
  }

  get level(): Level {
    return LEVELS[this.levelIndex]!;
  }

  get unlockedCount(): number {
    return playableCount(this.solved);
  }

  // Opens a level on the board the player left there, or a fresh one if
  // they've never been, aborting any test run without recording a result.
  start(index: number): void {
    const level = LEVELS[index]!;
    const board = this.boards[level.gate];
    this.levelIndex = index;
    this.load(board ? loadBoard(board) : loadLevel(level));
  }

  // Throws away the current level's board for a fresh one. Other levels'
  // boards are kept.
  clear(): void {
    this.load(loadLevel(this.level));
  }

  private load(game: Game): void {
    this.game = game;
    this.run++;
    this.testing = false;
    this.check = null;
    this.currentRow = null;
    this.rowResults = [];
    this.result = null;
    this.stamped = false;
    this.save();
  }

  // Drops a part from the parts bin in the middle of the board.
  place(type: NodeType): void {
    if (!placeNode(this.game, type, { x: GRID_WIDTH / 2, y: GRID_HEIGHT / 2 })) return;
    this.sound.play("place");
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
    this.stamped = false;
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
    this.stamped = check.passed;
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
