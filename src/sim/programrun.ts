import { edgeInto, loadContents, programMemoryOf, restartForTest, type Game } from "./circuit";
import { joinFields, play, registersOf, type Outcome } from "./cpu";
import { applyInputs, machineOn, TICK_LIMIT, type CheckResult, type CircuitLevel, type ProgramLevel } from "./level";
import type { Value } from "./node";
import { tableRow, TestRun, type Doing, type Run, type Shown, type TableRow } from "./testrun";

// The test run a level gets: test programs on the CPU's level, or else its
// table, a row at a time.
export function testRun(level: CircuitLevel, result: CheckResult): Run {
  return level.programs === undefined ? new TestRun(level, result) : new ProgramRun(level, result);
}

// The registers' place in the execute unit's state, after the clock.

// A test run of the CPU level, shown on the board an instruction at a time.
// Each test program is loaded into program memory on a restarted board and
// played as checkLevel played it, until it halts or runs out of ticks; then
// its row is marked as checkLevel recorded it.
class ProgramRun implements Run {
  readonly result: CheckResult;
  current: number | null = null;
  done = false;
  rows: TableRow[];
  now: Doing | null = null;
  private readonly level: ProgramLevel;
  private playing: Generator<void, Outcome> | null = null;
  // The test program being shown, or next to show.
  private at = 0;

  constructor(level: ProgramLevel, result: CheckResult) {
    this.level = level;
    this.result = result;
    this.rows = result.rows.map((row) => tableRow(row));
  }

  step(game: Game): Shown | null {
    if (this.done) return null;
    const index = this.at;
    const test = this.level.programs[index];
    const recorded = this.result.rows[index];
    if (!test || !recorded) {
      this.done = true;
      this.current = null;
      this.now = null;
      return null;
    }
    if (!this.playing) {
      restartForTest(game);
      const memory = programMemoryOf(game.nodes);
      if (memory) loadContents(game, memory.id, test.words);
      this.current = index;
      this.playing = play(
        machineOn(this.level, (values) => applyRead(game, this.level, values)),
        test.device,
        TICK_LIMIT,
      );
    }
    const next = this.playing.next();
    if (next.done !== true) {
      this.now = doing(game, this.level);
      return { row: null, ticked: true };
    }
    this.playing = null;
    this.now = null;
    this.rows = this.rows.map((shown, i) => (i === index ? tableRow(recorded, recorded.actual) : shown));
    this.at++;
    return { row: recorded, ticked: true, outs: next.value.outs };
  }
}

// Sets the board's input terminals and gives what its output terminals show.
function applyRead(game: Game, level: CircuitLevel, values: Value[]): Value[] {
  applyInputs(game, level, values);
  return level.outputs.map((label) => {
    const lamp = [...game.nodes.values()].find((node) => node.type === "OUTPUT" && node.label === label);
    return lamp ? (edgeInto(game, lamp.id, 0)?.value ?? 0) : 0;
  });
}

// What the board's execute unit is doing, if it has one.
function doing(game: Game, level: ProgramLevel): Doing | null {
  const unit = [...game.nodes.values()].find((node) => node.type === "EXECUTE UNIT");
  if (!unit) return null;
  const input = (pin: number): Value => edgeInto(game, unit.id, pin)?.value ?? 0;
  const i = joinFields(input(1), input(2), input(3));
  return { instruction: level.describe(i, input(4)), registers: registersOf(unit.state) };
}
