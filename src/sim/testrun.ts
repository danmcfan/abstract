import { tick, type Game } from "./circuit";
import {
  applyInputs,
  CLOCK,
  hasClock,
  matches,
  testTable,
  type CheckResult,
  type CheckedRow,
  type Level,
  type Row,
} from "./level";
import type { NodeID, Value } from "./node";

// A row of the level panel's table, with how it fared in the test run.
type RowStatus = "untested" | "passed" | "failed";
export interface SheetRow extends Row {
  // What the board's output terminals gave, once the row is tested.
  actual?: Value[];
  status: RowStatus;
}

// A row of the table as the level panel shows it: untested, or tested with
// what the board gave.
function sheetRow(row: Row, actual?: Value[]): SheetRow {
  const shown: SheetRow = { inputs: row.inputs, expected: row.expected, status: "untested" };
  if (row.tick !== undefined) shown.tick = row.tick;
  if (actual === undefined) return shown;
  shown.actual = actual;
  shown.status = matches(actual, row.expected) ? "passed" : "failed";
  return shown;
}

// The level's truth table or timing table, before any test run.
export function sheet(level: Level): SheetRow[] {
  return testTable(level).map((row) => sheetRow(row));
}

// A test run of one level, shown on the board a row at a time. Every row is
// checked up front, out of sight; stepping only shows them, setting the
// board's inputs to each row and ticking its clock where a step says. Once
// every row is shown, the rows that failed out of sight join the table.
export class TestRun {
  readonly check: CheckResult;
  // The row on the board, or null before the first and after the last.
  current: number | null = null;
  done = false;
  private readonly level: Level;
  private shown = 0;

  constructor(level: Level, check: CheckResult) {
    this.level = level;
    this.check = check;
  }

  get rows(): SheetRow[] {
    const rows = this.check.rows.map((row, i) => sheetRow(row, i < this.shown ? row.actual : undefined));
    return this.done ? [...rows, ...this.check.hidden.failed.map((row) => sheetRow(row, row.actual))] : rows;
  }

  // Shows the next row on the board and returns it, or ends the run and
  // returns null once every row has been shown.
  step(game: Game): CheckedRow | null {
    if (this.done) return null;
    const row = this.check.rows[this.shown];
    if (!row) {
      this.done = true;
      this.current = null;
      return null;
    }
    applyInputs(game, this.level, row.inputs);
    const clock = clockOf(game, this.level);
    if (row.tick === true && clock !== undefined) tick(game, clock);
    this.current = this.shown;
    this.shown++;
    return row;
  }
}

// The level's clock switch on the board, if the level has one.
export function clockOf(game: Game, level: Level): NodeID | undefined {
  if (!hasClock(level)) return undefined;
  return [...game.nodes.values()].find((node) => node.type === "INPUT" && node.label === CLOCK)?.id;
}
