import { tick, type Game } from "./circuit";
import {
  applyInputs,
  clockOf,
  matches,
  testTable,
  type CheckResult,
  type CheckedRow,
  type CircuitLevel,
  type Row,
} from "./level";
import type { Value } from "./node";

// A row of the level panel's table, with how it fared in the test run.
export interface TableRow extends Row {
  // What the board's output terminals gave, once the row is tested.
  actual?: Value[];
  status: "untested" | "passed" | "failed";
}

// A row of the table as the level panel shows it: untested, or tested with
// what the board gave.
export function tableRow(row: Row, actual?: Value[]): TableRow {
  const shown: TableRow = { inputs: row.inputs, expected: row.expected, status: "untested" };
  if (row.tick !== undefined) shown.tick = row.tick;
  if (row.name !== undefined) shown.name = row.name;
  if (actual === undefined) return shown;
  shown.actual = actual;
  shown.status = matches(actual, row.expected) ? "passed" : "failed";
  return shown;
}

// The level's truth table or timing table, before any test run.
export function table(level: CircuitLevel): TableRow[] {
  return testTable(level).map((row) => tableRow(row));
}

// A step a test run showed on the board: the row it finished, if any, and
// whether it ticked the clock. A test program's row comes with the values
// the board sent out.
export interface Shown {
  row: CheckedRow | null;
  ticked: boolean;
  outs?: Value[];
}

// What the CPU's board is doing in a test run: the instruction its execute
// unit has, written out, and the execute unit's registers.
export interface Doing {
  instruction: string;
  registers: Value[];
}

// A test run, shown on the board a step at a time.
export interface Run {
  readonly result: CheckResult;
  // The row on the board, or null before the first and after the last.
  current: number | null;
  done: boolean;
  // A new array each time a row changes, and only then, so the level panel
  // redraws once per row.
  rows: TableRow[];
  // Only on a program level, while a program runs.
  now: Doing | null;
  // Shows the next step on the board, or ends the run and returns null
  // once every row is shown.
  step(game: Game): Shown | null;
}

// A test run of one level, shown on the board a row at a time. Every row is
// tested up front, out of sight; stepping only shows them, setting the
// board's inputs to each row and ticking its clock where a step says. Once
// every row is shown, the rows that failed out of sight join the table.
export class TestRun implements Run {
  readonly result: CheckResult;
  current: number | null = null;
  done = false;
  rows: TableRow[];
  readonly now = null;
  private readonly level: CircuitLevel;
  private shown = 0;

  constructor(level: CircuitLevel, result: CheckResult) {
    this.level = level;
    this.result = result;
    this.rows = result.rows.map((row) => tableRow(row));
  }

  // Shows the next row on the board and returns it, or ends the run and
  // returns null once every row has been shown.
  step(game: Game): Shown | null {
    if (this.done) return null;
    const row = this.result.rows[this.shown];
    if (!row) {
      this.done = true;
      this.current = null;
      this.rows = [...this.rows, ...this.result.hidden.failed.map((failed) => tableRow(failed, failed.actual))];
      return null;
    }
    applyInputs(game, this.level, row.inputs);
    const clock = clockOf(game, this.level);
    const ticked = row.tick === true && clock !== undefined;
    if (ticked) tick(game, clock);
    this.rows = this.rows.map((shown, i) => (i === this.shown ? tableRow(row, row.actual) : shown));
    this.current = this.shown;
    this.shown++;
    return { row, ticked };
  }
}
