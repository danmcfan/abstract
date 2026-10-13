import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js";
import {
  floorAbove,
  layerOf,
  LEVELS,
  type Layer,
  matches,
  partGiven,
  partsBin,
  terminalWidth,
  wiring,
} from "../sim/level";
import type { Value } from "../sim/node";
import { say } from "./speech";
import { GateIcon } from "./GateIcon";
import { SoundButton } from "./SoundButton";
import * as script from "./script";
import {
  clearBoard,
  currentRow,
  level,
  levelIndex,
  placePart,
  result,
  rowResults,
  runTest,
  stamped,
  startLevel,
  tableRows,
  testing,
} from "./state";

const pad = (n: number): string => String(n).padStart(2, "0");
// A bus value's signals, high bit first, for hovering over its number.
const binary = (value: Value, width: number): string => value.toString(2).padStart(width, "0");

// The overlay, drawn like sheets pinned to the drafting board: the level's
// title block and truth table, the parts bin, and the button that opens the
// stack. Passing a layer's last level leads up to the next floor, through
// the stack.
const labels = (): string[] => [...level().inputs, ...level().outputs];
const widths = (): number[] => labels().map((label) => terminalWidth(level(), label));
// A row's outputs as the test column writes them: single signals run
// together as bits, bus values are numbers apart.
const written = (values: Value[]): string => values.join(widths().some((width) => width > 1) ? " " : "");
const layer = (): Layer => layerOf(levelIndex());
const above = (): Layer | null => floorAbove(levelIndex());

function status(): { text: string; tone: string } | null {
  if (testing()) return { text: "Testing…", tone: "text-pencil" };
  const r = result();
  if (!r) return null;
  if (r.forbidden.length > 0)
    return { text: `${r.forbidden.join(", ")} isn't in this level's parts bin.`, tone: "text-fail" };
  if (!r.passed) return { text: "Not quite. Some rows don't match.", tone: "text-fail" };
  const hasNext = levelIndex() + 1 < LEVELS.length;
  return {
    text: hasNext ? `Tested! ${partGiven(level()).gate} is in your parts bin.` : "Tested! That's every level so far.",
    tone: "text-pass",
  };
}

export function Hud(props: { onMenu: () => void; onStack: (arrive?: number) => void }): JSX.Element {
  const [clearing, setClearing] = createSignal(false);
  createEffect(
    on(levelIndex, (): void => {
      setClearing(false);
    }),
  );

  return (
    <div class="text-sm leading-normal text-ink-deep">
      <section
        id="level-panel"
        classList={{ shake: stamped() }}
        class="fixed top-3 right-3 left-3 p-3 sheet wide:top-5 wide:right-auto wide:left-5 wide:w-72.5 wide:p-4"
      >
        <div class="flex w-fit max-w-full border-2 border-ink">
          <span class="flex items-center border-r-2 border-ink px-2 text-xs text-pencil">
            SH {pad(levelIndex() + 1)}
          </span>
          <h1 class="px-2.5 py-0.5 text-lg font-bold text-ink">
            {level().prebuilt === true ? "Meet" : "Build"} {level().gate}
          </h1>
        </div>

        <div class="mt-3 flex items-center gap-3">
          <GateIcon type={level().gate} class="h-11 w-16 shrink-0 text-ink" />
          <p class="text-note leading-snug">{level().goal}</p>
        </div>

        <div class="mt-3 flex items-end gap-3 wide:block">
          <div class="relative w-full max-w-65">
            <table class="w-full border-collapse text-center text-note tabular-nums">
              <thead>
                <tr class="text-ink">
                  <For each={labels()}>{(label) => <th class="border-hair border-ink px-2 py-0.5">{label}</th>}</For>
                  <th class="w-12 border-hair border-ink px-1 py-0.5 text-xs font-normal text-pencil">test</th>
                </tr>
              </thead>
              <tbody>
                <For each={tableRows()}>
                  {(row, i) => {
                    const actual = (): Value[] | undefined => rowResults()[i()];
                    const ok = (): boolean => matches(actual() ?? [], row.expected);
                    const got = (): string | undefined => {
                      const values = actual();
                      return values === undefined || ok() ? undefined : `got ${written(values)}`;
                    };
                    return (
                      <tr class={currentRow() === i() ? "bg-wash font-bold" : ""}>
                        <For each={[...row.inputs, ...row.expected]}>
                          {(value, column) => {
                            const width = (): number => widths()[column()] ?? 1;
                            return (
                              <td
                                class="border-hair border-ink px-2 py-0.5"
                                title={width() > 1 ? binary(value, width()) : undefined}
                              >
                                {value}
                              </td>
                            );
                          }}
                        </For>
                        <td class="border-hair border-ink px-1 py-0.5" title={got()}>
                          <Show when={actual()} fallback={<span class="text-pencil/50">·</span>}>
                            {(values) => (
                              <span class={ok() ? "text-pass" : "text-fail"}>
                                {ok() ? "✓" : `✗${written(values())}`}
                              </span>
                            )}
                          </Show>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
            <Show when={stamped()}>
              <span id="stamp" class="stamp">
                PASSED
              </span>
            </Show>
          </div>

          <div class="flex shrink-0 flex-col items-start gap-2 wide:mt-3.5 wide:flex-row wide:items-center wide:gap-3">
            <button
              id="test"
              class="btn"
              disabled={testing()}
              onClick={() => {
                void runTest();
              }}
            >
              Run test
            </button>
            <button
              id="clear"
              class="btn btn-sm btn-ghost"
              disabled={clearing()}
              onClick={() => {
                setClearing(true);
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <Show when={clearing()}>
          <div class="mt-3 border-2 border-dashed border-fail p-2.5" role="alertdialog" aria-label="Clear this board?">
            <p class="mb-2 text-note">Clear this board?</p>
            <div class="flex gap-3">
              <button
                id="clear-confirm"
                class="btn border-fail bg-fail btn-sm"
                onClick={() => {
                  setClearing(false);
                  clearBoard();
                }}
              >
                Clear
              </button>
              <button
                id="clear-keep"
                class="btn btn-sm btn-ghost"
                onClick={() => {
                  setClearing(false);
                }}
              >
                Keep it
              </button>
            </div>
          </div>
        </Show>

        <Show when={status()}>
          {(s) => (
            <p id="status" class={`mt-2 font-bold ${s().tone}`}>
              {s().text}
            </p>
          )}
        </Show>
        <Show when={result()?.passed === true && levelIndex() + 1 < LEVELS.length}>
          <Show
            when={above()}
            fallback={
              <button
                id="next"
                class="mt-2.5 btn"
                onClick={() => {
                  startLevel(levelIndex() + 1);
                }}
              >
                Next level ▸
              </button>
            }
          >
            {(next) => (
              <button
                id="up"
                class="mt-2.5 btn"
                onClick={() => {
                  props.onStack(next().number);
                }}
              >
                Up to {next().floor} ▸
              </button>
            )}
          </Show>
        </Show>
        <RoughInk />
      </section>

      <nav class="fixed top-3 right-3 flex gap-1.5 max-wide:top-auto max-wide:right-auto max-wide:bottom-3 max-wide:left-3 wide:top-5 wide:right-5">
        <button
          id="open-stack"
          class="btn btn-sm btn-ghost"
          onClick={() => {
            props.onStack();
          }}
        >
          L{layer().number} · {layer().floor}
        </button>
        <button
          id="help"
          class="btn btn-sm btn-ghost"
          onClick={() => {
            say(script.help(level()));
          }}
        >
          ? Help
        </button>
        <SoundButton />
        <button
          id="menu"
          class="btn btn-sm btn-ghost"
          onClick={() => {
            props.onMenu();
          }}
        >
          Menu
        </button>
      </nav>

      <section
        id="parts-bin"
        class="fixed bottom-3 left-1/2 flex -translate-x-1/2 items-stretch sheet max-wide:right-3 max-wide:left-auto max-wide:translate-x-0"
      >
        <span class="flex items-center border-r-2 border-ink px-2.5 text-label tracking-label text-pencil uppercase max-wide:hidden">
          Parts bin
        </span>
        <For
          each={partsBin(levelIndex())}
          fallback={<span class="flex items-center px-3 py-2 text-xs text-pencil">Empty, for now</span>}
        >
          {(type) => (
            <button
              class="flex flex-col items-center gap-0.5 px-2.5 pt-1.5 pb-1 text-label font-bold text-ink hover:bg-wash disabled:opacity-40 max-wide:px-2"
              data-gate={type}
              disabled={testing()}
              onClick={() => {
                placePart(type);
              }}
            >
              <GateIcon type={type} class="h-6 w-9" />
              {type}
            </button>
          )}
        </For>
        {/* Split and join are wiring the level supplies, not parts, so they
            sit apart at the end, and only on levels with buses. */}
        <Show when={wiring(level()).length > 0}>
          <span class="flex items-center border-x-2 border-ink px-2.5 text-label tracking-label text-pencil uppercase max-wide:hidden">
            Wiring
          </span>
          <For each={wiring(level())}>
            {(w) => (
              <button
                class="flex flex-col items-center gap-0.5 px-2.5 pt-1.5 pb-1 text-label font-bold text-ink hover:bg-wash disabled:opacity-40 max-wide:px-2"
                data-gate={w.type}
                data-width={w.width}
                disabled={testing()}
                onClick={() => {
                  placePart(w.type, w.width);
                }}
              >
                <GateIcon type={w.type} width={Math.min(w.width, 4)} class="h-6 w-9" />
                {`${w.type} ${w.width}`}
              </button>
            )}
          </For>
        </Show>
      </section>
    </div>
  );
}

// Roughens the stamp's edges and leaves gaps in its ink, the way a rubber
// stamp prints.
function RoughInk(): JSX.Element {
  return (
    <svg class="absolute size-0" aria-hidden="true">
      <filter id="rough-ink" x="-10%" y="-20%" width="120%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="2.5"
          xChannelSelector="R"
          yChannelSelector="G"
          result="rough"
        />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.6"
          result="speckle"
        />
        <feComposite in="rough" in2="speckle" operator="in" />
      </filter>
    </svg>
  );
}
