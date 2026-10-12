import { createSignal } from "solid-js";
import type { Expression } from "../robot/expression";

// What the robot is saying: a short run of lines shown one at a time in its
// popup, each with the face it pulls while saying it.
export interface Line {
  face: Expression;
  text: string;
}

const [lines, setLines] = createSignal<Line[] | null>(null);
const [index, setIndex] = createSignal(0);

export function speech(): { line: Line; index: number; count: number } | null {
  const all = lines();
  return all ? { line: all[index()]!, index: index(), count: all.length } : null;
}

export function say(next: Line[]): void {
  if (next.length === 0) return;
  setLines(next);
  setIndex(0);
}

export function advance(): void {
  const all = lines();
  if (all && index() + 1 < all.length) setIndex(index() + 1);
  else hush();
}

export function hush(): void {
  setLines(null);
  setIndex(0);
}
