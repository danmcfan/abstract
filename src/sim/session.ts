import { assembleProgram, type Assembly } from "./assembler";
import type { Game } from "./circuit";
import { newGame, placeNode, restart, tick } from "./circuit";
import { DoorRun } from "./door";
import { DEFAULT_GRID } from "./grid";
import {
  BITBOX_INSTRUCTION_SET,
  checkInstructionSet,
  normalTable,
  type InstructionSet,
  type InstructionSetCheck,
} from "./instruction";
import type { Parts } from "./kind";
import {
  checkLevel,
  clockOf,
  clueAt,
  floorAbove,
  levelAt,
  levelId,
  LEVELS,
  loadFirstProgram,
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
  isCircuit,
  withInstructionSet,
} from "./level";
import type { NodeType } from "./node";
import { loadBoard, saveBoard, type Boards, type SaveStore } from "./save";
import { silent, type Sound } from "./sound";
import { flags, respond, respondToTable, type Cue } from "./story";
import { testRun } from "./programrun";
import { table, type Doing, type Run, type TableRow } from "./testrun";

// How many ticks a second Run gives the clock: the player sets it on the
// gauge, and a test run ignores it.
export const CLOCK_SPEED = { min: 1, max: 64, start: 4 };

// The keypad takes letters, as many as fit on its display.
export const KEYPAD_LETTERS = 12;

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
  // The door program as the player has typed it, the name on the keypad,
  // and its run on the CPU, if one has started. The door opening finishes
  // the game, and a finished game stays finished until it starts over.
  doorProgram = "";
  keypad = "";
  door: DoorRun | null = null;
  finished = false;
  private boards: Boards = {};
  private solvedLevels: Solved;
  // The current test run, or the last one until the board or level changes.
  private testRun: Run | null = null;

  private readonly store: SaveStore;
  private readonly sound: Sound;
  private readonly gameLevels: Level[];
  // The levels and parts as they read the last good instruction set.
  private levels: Level[];
  private parts: Parts;

  // The levels are the game's own, except in tests.
  constructor(store: SaveStore, sound: Sound = silent, levels: Level[] = LEVELS) {
    this.store = store;
    this.sound = sound;
    this.gameLevels = levels;
    this.levels = levels;
    this.parts = levels === LEVELS ? PARTS : partsOf(levels);
    this.game = this.boardFor(levelAt(0, levels));
    const data = store.load();
    this.solvedLevels = data?.solved ?? {};
    this.boards = data?.boards ?? {};
    this.instructionSet = data?.instructionSet ?? {};
    this.validInstructionSet = data?.validInstructionSet ?? null;
    this.doorProgram = data?.doorProgram ?? "";
    this.finished = data?.finished ?? false;
    this.readInstructionSet();
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
    this.doorProgram = data.doorProgram ?? "";
    this.finished = data.finished ?? false;
    this.readInstructionSet();
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
    this.doorProgram = "";
    this.finished = false;
    this.readInstructionSet();
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
      doorProgram: this.doorProgram,
      ...(this.finished && { finished: true }),
    });
  }

  // Makes the levels after L7 read the last good instruction set. Before
  // there is one, they read Bitbox's, which only a dev jump past L7 sees.
  private readInstructionSet(): void {
    this.levels = withInstructionSet(this.gameLevels, this.validInstructionSet ?? BITBOX_INSTRUCTION_SET);
    this.parts = partsOf(this.levels);
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
      Object.assign(this.instructionSet, { [id]: row });
    }
    const check = this.instructionCheck;
    if (check.solved) {
      this.validInstructionSet = normalTable(this.instructionSet);
      this.readInstructionSet();
      this.solvedLevels[levelId(this.level)] = revisionOf(this.level);
    }
    const response = respondToTable(before, check, this.level, (flag) => this.flags.has(flag));
    if (response?.flag !== undefined) this.flags.add(response.flag);
    this.save();
    return response?.cue ?? null;
  }

  // The door program read with the last good instruction set, with a mark
  // for each line that has a mistake.
  get assembly(): Assembly {
    return assembleProgram(this.validInstructionSet ?? BITBOX_INSTRUCTION_SET, this.doorProgram);
  }

  // Changes the door program and saves it. The text is read as the run goes,
  // so it can't change during one.
  editDoorProgram(text: string): void {
    if (this.door?.outcome === "running") return;
    this.doorProgram = text;
    this.door = null;
    this.save();
  }

  // Whether the door program is part way through a run.
  get doorRunning(): boolean {
    return this.door?.outcome === "running" && this.door.ticks > 0;
  }

  // Types a name on the keypad, in capitals and letters only. The keypad is
  // read as the program runs, so it can't change during a run.
  typeName(name: string): void {
    if (this.door?.outcome === "running") return;
    this.keypad = name
      .toUpperCase()
      .replaceAll(/[^A-Z]/gu, "")
      .slice(0, KEYPAD_LETTERS);
    this.door = null;
  }

  // Starts a run of the door program from the top, with the name on the
  // keypad. A program with a mistake, or nothing in it, doesn't start, and
  // Bitbox says why.
  beginDoorRun(): Cue | null {
    const { words, errors } = this.assembly;
    const [error] = errors;
    this.door = null;
    if (error) return { say: "program error", error };
    if (words.length === 0) return { say: "program empty" };
    this.door = new DoorRun(this.validInstructionSet ?? BITBOX_INSTRUCTION_SET, words, this.keypad);
    return null;
  }

  // Ticks the door program's CPU once, starting a new run if none is going.
  // Returns whether it ticked, and what Bitbox says if the run ended. The
  // door opening solves the level and finishes the game.
  tickDoor(): { ticked: boolean; cue: Cue | null } {
    if (this.finished) return { ticked: false, cue: null };
    if (this.door?.outcome !== "running") {
      const refused = this.beginDoorRun();
      if (refused) return { ticked: false, cue: refused };
    }
    const { door } = this;
    if (!door) return { ticked: false, cue: null };
    door.tick();
    this.sound.play("clock");
    if (door.outcome === "running") return { ticked: true, cue: null };
    if (door.outcome === "open") {
      this.solvedLevels[levelId(this.level)] = revisionOf(this.level);
      this.finished = true;
      this.save();
      this.sound.play("bell");
      return { ticked: true, cue: { say: "door open" } };
    }
    if (door.outcome === "shut") {
      this.sound.play("fail-stamp");
      return { ticked: true, cue: { say: "door shut", sent: door.sent ?? 0 } };
    }
    return { ticked: true, cue: { say: "door halted" } };
  }

  // The layer whose clue the sheet shows in its margin, if any.
  get clue(): number | null {
    return clueAt(this.levelIndex, this.solved, this.levels);
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
    return isCircuit(level) ? level : null;
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

  // What the CPU's board is doing, while a test run runs a program on it.
  get now(): Doing | null {
    return this.testRun?.now ?? null;
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
    const board = isCircuit(level) ? this.boards[level.gate] : undefined;
    this.levelIndex = index;
    const game = board ? loadBoard(board, this.parts) : this.boardFor(level);
    if (isCircuit(level)) loadFirstProgram(game, level);
    this.load(game);
  }

  // Throws away the current level's board for a fresh one. Other levels'
  // boards are kept.
  clear(): void {
    this.load(this.boardFor(this.level));
  }

  // A fresh board for a level. The instruction set and the door program have
  // no circuit, so their boards stay empty.
  private boardFor(level: Level): Game {
    return isCircuit(level) ? loadLevel(level, this.parts) : newGame(this.parts, DEFAULT_GRID);
  }

  private load(game: Game): void {
    this.game = game;
    this.testRun = null;
    this.door = null;
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
    if (this.testing || !isCircuit(level)) return false;
    this.sound.play("carriage");
    restart(this.game);
    this.testRun = testRun(level, checkLevel(this.game, this.levelIndex, this.levels));
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
      if (shown.row) this.sound.play(matches(shown.row.actual, shown.row.expected) ? "tick" : "fail-tick");
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
  // while the instruction set is good, or once the door has opened.
  get next(): Next | null {
    const { level } = this;
    let done = this.result?.passed === true;
    if (level.kind === "instruction set") done = this.instructionCheck.solved;
    if (level.kind === "door program") done = this.finished;
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
