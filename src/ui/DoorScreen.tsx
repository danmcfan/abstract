import { For, Show, type JSX } from "solid-js";
import type { LineError } from "../sim/assembler";
import type { DoorRun } from "../sim/door";
import { KEYPAD_LETTERS } from "../sim/session";
import { ClockSpeed } from "./Sheet";
import { driver, editDoorProgram, running, session, typeName } from "./state";

const pad = (n: number): string => String(n).padStart(2, "0");

const errors = (): LineError[] => session().assembly.errors;
const lineCount = (): number => session().doorProgram.split("\n").length;
const marked = (line: number): LineError | undefined => errors().find((error) => error.line === line);
const outcome = (): string => session().door?.outcome ?? "idle";
// The program and the name are read as the program runs, so they're locked
// while it does.
const locked = (): boolean => session().doorRunning;
const door = (): DoorRun | null => session().door;

// The exit hall: the door program typed on a sheet in the typing pool's
// look, beside the door with its keypad. The CPU that runs it is the panel
// in the parts bin's place (CpuPanel).
export function DoorScreen(): JSX.Element {
  return (
    <div class="grid h-full min-h-0 grid-cols-2 gap-3">
      <section
        id="door-program"
        class="flex min-h-0 flex-col p-4 text-sm text-ink-deep sheet"
        aria-label="Door program"
      >
        <header class="shrink-0 border-b-2 border-ink pb-2">
          <h2 class="font-bold text-ink">SH {pad(session().levelIndex + 1)} · DOOR PROGRAM</h2>
          <p class="text-note">In your own instruction set. Lines with a mistake are marked.</p>
        </header>
        {/* The line numbers and the marks sit behind a transparent text area
            that grows with the program, so they scroll with it. */}
        <div class="relative min-h-0 flex-1 overflow-auto py-2">
          <div class="flex min-h-full">
            <ol class="shrink-0 pr-2 text-right text-note leading-6 text-pencil select-none" aria-hidden="true">
              <For each={Array.from({ length: lineCount() }, (_, i) => i + 1)}>
                {(line) => (
                  <li
                    class={marked(line) ? "font-bold text-fail" : ""}
                    data-error-line={marked(line) ? line : undefined}
                  >
                    {marked(line) ? "✗" : ""}
                    {pad(line)}
                  </li>
                )}
              </For>
            </ol>
            <div class="relative min-w-0 flex-1">
              <div class="absolute inset-0" aria-hidden="true">
                <For each={Array.from({ length: lineCount() }, (_, i) => i + 1)}>
                  {(line) => <div class={`h-6 ${marked(line) ? "bg-fail/10" : ""}`} />}
                </For>
              </div>
              <textarea
                id="program"
                class="relative block w-full resize-none overflow-hidden border-0 bg-transparent font-type text-note leading-6 whitespace-pre text-ink outline-none"
                aria-label="Door program"
                placeholder={"; Read the name, add up its letters,\n; and send the total to the door."}
                rows={lineCount() + 1}
                wrap="off"
                spellcheck={false}
                autocomplete="off"
                readOnly={locked()}
                value={session().doorProgram}
                onInput={(event) => {
                  editDoorProgram(event.currentTarget.value);
                }}
              />
            </div>
          </div>
        </div>
        <p
          id="program-status"
          class={`shrink-0 border-t-2 border-ink pt-2 text-note font-bold ${errors().length > 0 ? "text-fail" : "text-ink"}`}
        >
          <Show
            when={errors()[0]}
            fallback={`${session().assembly.words.length} instruction${session().assembly.words.length === 1 ? "" : "s"} · ready`}
          >
            {(error) => `Line ${error().line}: ${error().problem}`}
          </Show>
        </p>
      </section>

      <section id="door" class="flex min-h-0 flex-col items-center justify-center p-4 sheet" data-outcome={outcome()}>
        <Door />
        <label class="mt-3 flex items-center gap-2 text-xs text-pencil">
          Keypad
          <input
            id="keypad"
            class="w-40 border-2 border-ink bg-void px-2 py-1 font-bold tracking-label text-glow uppercase outline-none"
            aria-label="Keypad"
            maxLength={KEYPAD_LETTERS}
            spellcheck={false}
            autocomplete="off"
            disabled={locked()}
            placeholder="TYPE A NAME"
            value={session().keypad}
            onInput={(event) => {
              typeName(event.currentTarget.value);
              event.currentTarget.value = session().keypad;
            }}
          />
        </label>
      </section>
    </div>
  );
}

// The exit, after the vision board's "The way out" sheet: a door with its
// keypad, wired to the CPU. When the door opens it swings back on daylight.
function Door(): JSX.Element {
  return (
    <svg
      viewBox="0 0 240 290"
      class="max-h-full min-h-0 w-full max-w-72 flex-1 text-ink"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect class="daylight" x="40" y="20" width="130" height="230" />
      <g class="door-leaf">
        <rect x="40" y="20" width="130" height="230" fill="var(--color-surface)" />
        <rect x="52" y="32" width="106" height="206" stroke-width="1.2" />
        <path d="M52 80 H158 M52 190 H158" stroke-width="1.2" stroke-dasharray="6 5" />
        <circle cx="62" cy="42" r="3" />
        <circle cx="148" cy="42" r="3" />
        <circle cx="62" cy="228" r="3" />
        <circle cx="148" cy="228" r="3" />
        <text x="105" y="140" text-anchor="middle" fill="currentColor" stroke="none" class="text-copy font-bold">
          EXIT
        </text>
      </g>
      <rect x="182" y="110" width="40" height="56" rx="3" fill="var(--color-surface)" />
      <rect x="188" y="116" width="28" height="12" fill="var(--color-void)" />
      <circle class="door-led" cx="202" cy="150" r="5" />
      <path d="M202 166 V230 Q202 262 170 262 H14" stroke-width="2.5" />
      <text x="14" y="284" fill="currentColor" stroke="none" class="text-label">
        to your CPU
      </text>
    </svg>
  );
}

// The CPU running the door program, in the parts bin's place: its
// registers, program counter and the instruction it's on, with the clock's
// controls. It runs by spec (ADR 6), so it has no board.
export function CpuPanel(): JSX.Element {
  return (
    <section id="cpu-panel" class="flex min-h-0 min-w-0 flex-col text-ink-deep sheet">
      <span class="shrink-0 border-b-2 border-ink px-3 py-1 text-label tracking-label text-pencil uppercase">
        CPU · running your door program
      </span>
      <div class="flex min-h-0 flex-1 items-center gap-6 px-4">
        <div class="flex gap-2 tabular-nums">
          <For each={door()?.registers ?? [0, 0, 0, 0]}>
            {(value, r) => (
              <div class="flex w-16 flex-col items-center border-hair border-ink py-1" data-register={r()}>
                <span class="text-fine text-pencil">R{r()}</span>
                <span class="text-copy font-bold text-ink">{value}</span>
              </div>
            )}
          </For>
          <div class="flex w-24 flex-col items-center border-hair border-ink py-1">
            <span class="text-fine text-pencil">Program counter</span>
            <span id="program-counter" class="text-copy font-bold text-ink">
              {door()?.programCounter ?? 0}
            </span>
          </div>
        </div>
        <p class="min-w-0 flex-1 text-note">
          <span class="text-pencil">Doing </span>
          <span id="doing" class="font-bold text-ink">
            {door()?.doing ?? "–"}
          </span>
          <span class="ml-3 text-pencil">
            {door()?.ticks ?? 0} tick{door()?.ticks === 1 ? "" : "s"}{" "}
          </span>
        </p>
        <div class="flex shrink-0 flex-col items-start gap-2">
          <div class="flex gap-2">
            <button
              id="run-clock"
              class="btn"
              onClick={() => {
                driver.toggleClock();
              }}
            >
              {running() ? "Pause" : "Run"}
            </button>
            <button
              id="step"
              class="btn btn-sm"
              disabled={running()}
              onClick={() => {
                driver.tick();
              }}
            >
              Step
            </button>
          </div>
          <ClockSpeed />
        </div>
      </div>
    </section>
  );
}
