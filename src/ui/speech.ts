import { createSignal } from "solid-js";
import type { Expression } from "../robot/expression";
import type { Cue } from "../sim/story";
import * as script from "./script";

// What the robot is saying: a short run of lines shown one at a time in its
// popup, each with the face it pulls while saying it.
export interface Line {
  face: Expression;
  text: string;
}

const [lines, setLines] = createSignal<Line[] | null>(null);
const [index, setIndex] = createSignal(0);
const [reacting, setReacting] = createSignal<Expression | null>(null);

const REACT_MS = 1600;
let reactTimer: ReturnType<typeof setTimeout> | undefined;

export function speech(): { line: Line; index: number; count: number } | null {
  const all = lines();
  const line = all?.[index()];
  return all && line ? { line, index: index(), count: all.length } : null;
}

// A face the robot pulls for a moment without saying anything. It shows over
// whatever line is up, or in the popup on its own.
export const reaction = reacting;

function react(face: Expression): void {
  clearTimeout(reactTimer);
  setReacting(face);
  reactTimer = setTimeout(endReaction, REACT_MS);
}

function endReaction(): void {
  clearTimeout(reactTimer);
  setReacting(null);
}

export function say(next: Line[]): void {
  if (next.length === 0) return;
  endReaction();
  setLines(next);
  setIndex(0);
}

// Says the lines for a cue, or pulls its face.
export function speak(cue: Cue | null): void {
  if (!cue) return;
  if ("react" in cue) react(cue.react);
  else say(script.lines(cue));
}

export function advance(): void {
  const all = lines();
  if (all && index() + 1 < all.length) setIndex(index() + 1);
  else hush();
}

export function hush(): void {
  endReaction();
  setLines(null);
  setIndex(0);
}
