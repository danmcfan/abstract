import type { Game } from "./circuit";
import { newGame, placeNode, restart, tick } from "./circuit";
import { DEFAULT_GRID } from "./grid";
import { checkInstructionSet, normalMnemonic, type InstructionSet, type InstructionSetCheck } from "./instruction";
import type { Parts } from "./kind";
import {
  checkLevel,
  clockOf,
  floorAbove,
  levelAt,
  levelId,
  LEVELS,
  loadLevel,
  PARTS,
  partsOf,
  matches,
  revisionOf,
  solvedCount,
  playableCount,
  type CheckResult,
  type CircuitLevel,
  type Layer,
  type Level,
  type Solved,
} from "./level";
import type { NodeType } from "./node";
import { loadBoard, saveBoard, type Boards, type SaveStore } from "./save";
import { silent, type Sound } from "./sound";
import { flags, respond, respondToTable, type Cue } from "./story";
import { table, TestRun, type TableRow } from "./testrun";

// How many ticks a second Run gives the clock: the player sets it on the
// gauge, and a test run ignores it.
export const CLOCK_SPEED = { min: 1, max: 64, start: 4 };

const clockSpeedFrom = (speed: number): number =>
  2 ** Math.round(Math.log2(Math.min(CLOCK_SPEED.max, Math.max(CLOCK_SPEED.min, speed))));

// Where a passed level leads: the next level on the same floor, up to the
// floor above through the stack, or nowhere yet.
export type Next = { to: "level"; index: number } | { to: "floor"; layer: Layer } | { to: "end" };

// One player's play: the current level and board, the board left on every
// other level, a test run stepping through the truth table or timing table
// one row at a time, solved progress, and story flags. Time lives outside;
// the caller decides when to step, and when to tick a level's clock. The
// caller changes the board through edit(). A test run plays its sound cues
// as it goes. The session also decides where a passed level leads, and when
// Bitbox speaks, marking what he's said with story flags.
export class Session {
  levelIndex = 0;
  game: Game;
  result: CheckResult | null = null;
  // Whether the PASSED stamp is on the sheet: the last run passed and the
  // board hasn't changed since.
  stamped = false;
  flags = new Set<string>();
  // The player's setting, kept in the save. Starting over keeps it.
  clockSpeed: number = CLOCK_SPEED.start;
  // The instruction set as the player has it in L7, and the last one that
  // was good, which the levels after it read. Starting over blanks both.
  instructionSet: InstructionSet = {};
  validInstructionSet: InstructionSet | null = null;
  private boards: Boards = {};
  private solvedLevels: Solved;
  // The current test run, or the last one until the board or level changes.
  private testRun: TestRun | null = null;

  private readonly store: SaveStore;
  private readonly sound: Sound;
  private readonly levels: Level[];
  private readonly parts: Parts;

  // The levels are the game's own, except in tests.
  constructor(store: SaveStore, sound: Sound = silent, levels: Level[] = LEVELS) {
    this.store = store;
    this.sound = sound;
    this.levels = levels;
    this.parts = levels === LEVELS ? PARTS : partsOf(levels);
    this.game = this.boardFor(levelAt(0, levels));
    const data = store.load();
    this.solvedLevels = data?.solved ?? {};
    this.boards = data?.boards ?? {};
    this.instructionSet = data?.instructionSet ?? {};
    this.validInstructionSet = data?.validInstructionSet ?? null;
    if (data?.clockSpeed !== undefined) this.clockSpeed = clockSpeedFrom(data.clockSpeed);
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
    const last = playableCount(solvedCount(data.solved, this.levels), this.levels) - 1;
    const open = this.levels.findIndex((level) => levelId(level) === data.open);
    return open === -1 ? last : Math.min(open, last);
  }

  // Picks up the saved game where it left off, boards and all.
  resume(): void {
    const data = this.store.load();
    if (!data) {
      this.reset();
      return;
    }
    this.solvedLevels = data.solved;
    this.flags = new Set(data.flags);
    this.boards = data.boards;
    this.instructionSet = data.instructionSet ?? {};
    this.validInstructionSet = data.validInstructionSet ?? null;
    this.start(this.savedLevel);
  }

  // Throws away the saved game and starts over from the first level.
  reset(): void {
    this.store.clear();
    this.solvedLevels = {};
    this.flags = new Set();
    this.boards = {};
    this.instructionSet = {};
    this.validInstructionSet = null;
    this.start(0);
  }

  // Applies a change to the board and saves it. A change that alters the
  // board takes the stamp off, since the board it vouched for is gone; one
  // that leaves it as it was, like a rejected wire, keeps the stamp.
  // A change that leaves the board unstable plays its sound cue.
  edit(change: (game: Game) => void): void {
    const before = JSON.stringify(saveBoard(this.game));
    const stable = this.game.stable;
    change(this.game);
    if (JSON.stringify(saveBoard(this.game)) !== before) this.stamped = false;
    if (stable && !this.game.stable) this.sound.play("unstable");
    this.save();
  }

  save(): void {
    const { circuit } = this;
    if (circuit) this.boards[circuit.gate] = saveBoard(this.game);
    this.store.save({
      solved: this.solvedLevels,
      open: levelId(this.level),
      boards: this.boards,
      flags: [...this.flags],
      clockSpeed: this.clockSpeed,
      instructionSet: this.instructionSet,
      ...(this.validInstructionSet && { validInstructionSet: this.validInstructionSet }),
    });
  }

  // How each row of the instruction set stands.
  get instructionCheck(): InstructionSetCheck {
    return checkInstructionSet(this.instructionSet);
  }

  // Changes rows of the instruction set and saves it. A table that comes
  // out good solves L7, and becomes the one later levels read; one that
  // doesn't leaves L7 solved and the last good table in place. Returns what
  // Bitbox says about it, if anything.
  editInstructions(rows: InstructionSet): Cue | null {
    const before = this.instructionCheck;
    for (const [id, row] of Object.entries(rows)) {
      Object.assign(this.instructionSet, { [id]: { ...row, mnemonic: normalMnemonic(row.mnemonic) } });
    }
    const check = this.instructionCheck;
    if (check.solved) {
      this.validInstructionSet = structuredClone(this.instructionSet);
      this.solvedLevels[levelId(this.level)] = revisionOf(this.level);
    }
    const response = respondToTable(before, check, this.level, (flag) => this.flags.has(flag));
    if (response?.flag !== undefined) this.flags.add(response.flag);
    this.save();
    return response?.cue ?? null;
  }

  // Sets how many ticks a second Run gives, from 1 to 64, and saves it.
  setClockSpeed(speed: number): void {
    this.clockSpeed = clockSpeedFrom(speed);
    this.save();
  }

  get level(): Level {
    return levelAt(this.levelIndex, this.levels);
  }

  // The open level, if it has a circuit: the instruction set level doesn't.
  get circuit(): CircuitLevel | null {
    const { level } = this;
    return level.kind === "instruction set" ? null : level;
  }

  // The rows the level panel shows, checked as far as the test run has
  // gone, then any rows the last run found failing out of sight.
  get rows(): TableRow[] {
    const { circuit } = this;
    return circuit ? (this.testRun?.rows ?? table(circuit)) : [];
  }

  // Whether a test run is going.
  get testing(): boolean {
    return this.testRun !== null && !this.testRun.done;
  }

  // The row on the board in a test run, if one is going.
  get currentRow(): number | null {
    return this.testRun?.current ?? null;
  }

  // How many levels from the first are solved: the next one is playable.
  get solved(): number {
    return solvedCount(this.solvedLevels, this.levels);
  }

  get unlockedCount(): number {
    return playableCount(this.solved, this.levels);
  }

  // Opens a level on the board the player left there, or a fresh one if
  // they've never been, aborting any test run without recording a result.
  start(index: number): void {
    const level = levelAt(index, this.levels);
    const board = level.kind === "instruction set" ? undefined : this.boards[level.gate];
    this.levelIndex = index;
    this.load(board ? loadBoard(board, this.parts) : this.boardFor(level));
  }

  // Throws away the current level's board for a fresh one. Other levels'
  // boards are kept.
  clear(): void {
    this.load(this.boardFor(this.level));
  }

  // A fresh board for a level. The instruction set level has no circuit, so
  // its board stays empty.
  private boardFor(level: Level): Game {
    return level.kind === "instruction set" ? newGame(this.parts, DEFAULT_GRID) : loadLevel(level, this.parts);
  }

  private load(game: Game): void {
    this.game = game;
    this.testRun = null;
    this.result = null;
    this.stamped = false;
    this.save();
  }

  // Drops a part, or a split or join as wide as its bus, from the parts bin
  // in the middle of the board.
  place(type: NodeType, width = 1): void {
    const { grid } = this.game;
    if (!placeNode(this.game, type, { x: grid.width / 2, y: grid.height / 2 }, "", width)) return;
    this.sound.play("place");
  }

  // Turns the level's clock on and off, if it has one and no test run is
  // going. Returns whether it ticked.
  tick(): boolean {
    const { circuit } = this;
    const clock = circuit ? clockOf(this.game, circuit) : undefined;
    if (this.testing || clock === undefined) return false;
    this.edit((game) => {
      tick(game, clock);
    });
    this.sound.play("clock");
    return true;
  }

  // Returns false if a run is already going. Every row is checked here, out
  // of sight and without a sound; step() shows them, one tick each. The
  // board restarts first, so the rows it shows are the ones checked.
  beginTest(): boolean {
    const { level } = this;
    if (this.testing || level.kind === "instruction set") return false;
    this.sound.play("carriage");
    restart(this.game);
    this.testRun = new TestRun(level, checkLevel(this.game, this.levelIndex, this.levels));
    this.result = null;
    this.stamped = false;
    return true;
  }

  // Shows the next row on the board. Once every row has been shown, ends
  // the run and records the result. Returns whether a row was shown.
  step(): boolean {
    const run = this.testRun;
    if (!this.testing || !run) return false;
    const shown = run.step(this.game);
    if (shown) {
      if (shown.ticked) this.sound.play("clock");
      this.sound.play(matches(shown.row.actual, shown.row.expected) ? "tick" : "fail-tick");
      return true;
    }
    const { result } = run;
    this.result = result;
    this.stamped = result.passed;
    if (result.passed) {
      this.sound.play("stamp");
      this.sound.play("bell");
    } else this.sound.play("fail-stamp");
    if (result.passed && this.solvedLevels[levelId(this.level)] !== revisionOf(this.level)) {
      this.solvedLevels[levelId(this.level)] = revisionOf(this.level);
      this.save();
    }
    return false;
  }

  // Where the player goes from here, once the last test run has passed, or
  // while the instruction set is good.
  get next(): Next | null {
    const done = this.circuit ? this.result?.passed === true : this.instructionCheck.solved;
    if (!done) return null;
    if (this.levelIndex + 1 >= this.levels.length) return { to: "end" };
    const layer = floorAbove(this.levelIndex, this.levels);
    return layer ? { to: "floor", layer } : { to: "level", index: this.levelIndex + 1 };
  }

  // The level's intro, the first time it opens.
  introduce(): Cue | null {
    return this.once(flags.intro(this.level), { say: "intro", level: this.level });
  }

  // Greets a continued game, if Bitbox has already introduced its level.
  welcome(): Cue | null {
    return this.flags.has(flags.intro(this.level)) ? { say: "welcome back", level: this.level } : null;
  }

  // Describes a floor the first time the elevator rides up to it. The first
  // floor is where the game starts, so it needs no arrival.
  arrive(layer: number): Cue | null {
    return layer === 0 ? null : this.once(flags.floor(layer), { say: "floor", layer });
  }

  // Bitbox's response to the test run that just ended.
  respond(): Cue | null {
    if (!this.result) return null;
    const response = respond(this.result, this.level, (flag) => this.flags.has(flag));
    if (response?.flag !== undefined) this.hear(response.flag);
    return response?.cue ?? null;
  }

  private once(flag: string, cue: Cue): Cue | null {
    if (this.flags.has(flag)) return null;
    this.hear(flag);
    return cue;
  }

  private hear(flag: string): void {
    this.flags.add(flag);
    this.save();
  }
}
