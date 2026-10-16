import type { Session } from "./session";
import type { Cue } from "./story";

// Runs a task every so many milliseconds until the returned function cancels
// it. The game passes setInterval; tests pass one they fire by hand.
export interface Scheduler {
  every(ms: number, task: () => void): () => void;
}

// How long a test run waits between rows.
export const TEST_STEP_MS = 600;
// Instructions come faster than rows, so a program doesn't drag.
const PROGRAM_STEP_MS = 200;

// Moves a session along in time: steps a test run through its rows, and
// ticks the clock over and over while Run is on. Opening, clearing or
// swapping the board goes through here too, never straight to the session,
// so a new board stops whatever was timed on the old one. It calls changed() after every change it makes.
// On the door program the clock ticks the CPU, and what Bitbox says about
// how its run ends goes to speak().
export class Driver {
  private stopClock: (() => void) | null = null;
  private stopTest: (() => void) | null = null;

  private readonly session: Session;
  private readonly scheduler: Scheduler;
  private readonly changed: () => void;
  private readonly speak: (cue: Cue) => void;

  constructor(session: Session, scheduler: Scheduler, changed: () => void, speak: (cue: Cue) => void = (): void => {}) {
    this.session = session;
    this.scheduler = scheduler;
    this.changed = changed;
    this.speak = speak;
  }

  // Whether Run is ticking the clock.
  get running(): boolean {
    return this.stopClock !== null;
  }

  // Opens a level on the board the player left there.
  start(index: number): void {
    this.change(() => {
      this.session.start(index);
    });
  }

  // Throws away the current level's board for a fresh one.
  clear(): void {
    this.change(() => {
      this.session.clear();
    });
  }

  // Picks up the saved game where it left off.
  resume(): void {
    this.change(() => {
      this.session.resume();
    });
  }

  // Throws away the saved game and starts over.
  reset(): void {
    this.change(() => {
      this.session.reset();
    });
  }

  // Steps through the truth table on the board so the player can watch each
  // row, then records the result.
  test(): void {
    this.pause();
    if (!this.session.beginTest()) return;
    this.stopTesting();
    this.changed();
    if (!this.step()) return;
    const ms = this.session.circuit?.programs === undefined ? TEST_STEP_MS : PROGRAM_STEP_MS;
    this.stopTest = this.scheduler.every(ms, () => {
      if (!this.step()) this.stopTesting();
    });
  }

  // Ticks the level's clock once, by hand.
  tick(): void {
    if (this.session.level.kind === "door program") {
      const { ticked, cue } = this.session.tickDoor();
      if (cue) this.speak(cue);
      if (!ticked || this.session.door?.outcome !== "running") this.pause();
      this.changed();
      return;
    }
    if (this.session.tick()) this.changed();
  }

  // Run ticks the clock over and over so the player can watch the board
  // change, until Pause, a test run or another board stops it.
  toggleClock(): void {
    if (this.running) {
      this.pause();
      return;
    }
    this.runClock();
    this.tick();
    this.changed();
  }

  // Sets the clock speed. A running clock carries on at the new pace.
  setClockSpeed(speed: number): void {
    this.session.setClockSpeed(speed);
    if (this.stopClock) {
      this.stopClock();
      this.runClock();
    }
    this.changed();
  }

  // Ticks as many times a second as the clock speed says.
  private runClock(): void {
    this.stopClock = this.scheduler.every(1000 / this.session.clockSpeed, () => {
      this.tick();
    });
  }

  // A new board stops whatever was timed on the old one.
  private change(apply: () => void): void {
    this.pause();
    this.stopTesting();
    apply();
    this.changed();
  }

  private stopTesting(): void {
    this.stopTest?.();
    this.stopTest = null;
  }

  private pause(): void {
    if (!this.stopClock) return;
    this.stopClock();
    this.stopClock = null;
    this.changed();
  }

  // Shows the next row, or ends the run. Either way the panel changes.
  private step(): boolean {
    const shown = this.session.step();
    this.changed();
    return shown;
  }
}
