import { For, Show } from "solid-js";
import { placeNode, type Game } from "../sim/circuit";
import { LEVELS, matches, partsBin, terminalWidth, wiring } from "../sim/level";
import type { NodeType, Value } from "../sim/node";
import { say } from "./speech";
import { GateIcon } from "./GateIcon";
import * as script from "./script";
import {
  currentRow,
  level,
  levelIndex,
  mutate,
  result,
  rowResults,
  runTest,
  stamped,
  startLevel,
  tableRows,
  testing,
  unlockedCount,
} from "./state";

const pad = (n: number) => String(n).padStart(2, "0");
// A bus value's signals, high bit first, for hovering over its number.
const binary = (value: Value, width: number) => value.toString(2).padStart(width, "0");

// New parts land in the middle of the board.
const place = (type: NodeType, width = 1) => mutate((g: Game) => placeNode(g, type, { x: g.grid.width / 2, y: g.grid.height / 2 }, "", width));

// The overlay, drawn like sheets pinned to the drafting board: the level's
// title block and truth table, the parts bin, and the sheet index.
export function Hud(props: { onMenu: () => void }) {
  const labels = () => [...level().inputs, ...level().outputs];
  const widths = () => labels().map((label) => terminalWidth(level(), label));
  // A row's outputs as the test column writes them: single signals run
  // together as bits, bus values are numbers apart.
  const written = (values: Value[]) => values.join(widths().some((width) => width > 1) ? " " : "");

  const status = () => {
    if (testing()) return { text: "Testing…", tone: "text-pencil" };
    const r = result();
    if (!r) return null;
    if (r.forbidden.length > 0) return { text: `${r.forbidden.join(", ")} isn't in this level's parts bin.`, tone: "text-fail" };
    if (!r.passed) return { text: "Not quite. Some rows don't match.", tone: "text-fail" };
    const hasNext = levelIndex() + 1 < LEVELS.length;
    return { text: hasNext ? `Tested! ${level().gate} is in your parts bin.` : "Tested! That's every level so far.", tone: "text-pass" };
  };

  return (
    <div class="text-sm leading-normal text-ink-deep">
      <section
        id="level-panel"
        classList={{ shake: stamped() }}
        class="sheet fixed top-3 right-3 left-3 p-3 min-[900px]:top-5 min-[900px]:right-auto min-[900px]:left-5 min-[900px]:w-[290px] min-[900px]:p-4"
      >
        <div class="flex w-fit max-w-full border-2 border-ink">
          <span class="flex items-center border-r-2 border-ink px-2 text-xs text-pencil">SH {pad(levelIndex() + 1)}</span>
          <h1 class="px-2.5 py-0.5 text-lg font-bold text-ink">
            {level().prebuilt ? "Meet" : "Build"} {level().gate}
          </h1>
        </div>

        <div class="mt-3 flex items-center gap-3">
          <GateIcon type={level().gate} class="h-11 w-16 shrink-0 text-ink" />
          <p class="text-[13px] leading-snug">{level().goal}</p>
        </div>

        <div class="mt-3 flex items-end gap-3 min-[900px]:block">
          <div class="relative w-full max-w-[260px]">
            <table class="w-full border-collapse text-center text-[13px] tabular-nums">
              <thead>
                <tr class="text-ink">
                  <For each={labels()}>{(label) => <th class="border-[1.5px] border-ink px-2 py-0.5">{label}</th>}</For>
                  <th class="w-12 border-[1.5px] border-ink px-1 py-0.5 text-xs font-normal text-pencil">test</th>
                </tr>
              </thead>
              <tbody>
                <For each={tableRows()}>
                  {(row, i) => {
                    const actual = () => rowResults()[i()];
                    const ok = () => matches(actual() ?? [], row.expected);
                    return (
                      <tr class={currentRow() === i() ? "bg-wash font-bold" : ""}>
                        <For each={[...row.inputs, ...row.expected]}>
                          {(value, column) => (
                            <td
                              class="border-[1.5px] border-ink px-2 py-0.5"
                              title={widths()[column()]! > 1 ? binary(value, widths()[column()]!) : undefined}
                            >
                              {value}
                            </td>
                          )}
                        </For>
                        <td class="border-[1.5px] border-ink px-1 py-0.5" title={actual() === undefined || ok() ? undefined : `got ${written(actual()!)}`}>
                          <Show when={actual() !== undefined} fallback={<span class="text-pencil/50">·</span>}>
                            <span class={ok() ? "text-pass" : "text-fail"}>{ok() ? "✓" : `✗${written(actual()!)}`}</span>
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

          <div class="shrink-0 min-[900px]:mt-3.5 min-[900px]:flex min-[900px]:items-center min-[900px]:gap-3">
            <button id="test" class="btn" disabled={testing()} onClick={() => void runTest()}>
              Run test
            </button>
          </div>
        </div>

        <Show when={status()}>
          {(s) => (
            <p id="status" class={`mt-2 font-bold ${s().tone}`}>
              {s().text}
            </p>
          )}
        </Show>
        <Show when={result()?.passed && levelIndex() + 1 < LEVELS.length}>
          <button id="next" class="btn mt-2.5" onClick={() => startLevel(levelIndex() + 1)}>
            Next level ▸
          </button>
        </Show>
        <RoughInk />
      </section>

      <nav class="fixed top-3 right-3 flex gap-1.5 max-[899px]:top-auto max-[899px]:right-auto max-[899px]:bottom-3 max-[899px]:left-3 min-[900px]:top-5 min-[900px]:right-5">
        <For each={Array.from({ length: unlockedCount() }, (_, i) => i)}>
          {(i) => (
            <button
              class={`size-8 border-2 border-ink text-xs font-bold max-[899px]:hidden ${i === levelIndex() ? "bg-ink text-paper" : "bg-surface text-ink hover:bg-wash"}`}
              aria-label={`Level ${i + 1}`}
              aria-current={i === levelIndex() ? "step" : undefined}
              onClick={() => startLevel(i)}
            >
              {pad(i + 1)}
            </button>
          )}
        </For>
        <button id="help" class="btn btn-ghost btn-sm ml-1.5 max-[899px]:ml-0" onClick={() => say(script.help(level()))}>
          ? Help
        </button>
        <button id="menu" class="btn btn-ghost btn-sm" onClick={() => props.onMenu()}>
          Menu
        </button>
      </nav>

      <section
        id="parts-bin"
        class="sheet fixed bottom-3 left-1/2 flex -translate-x-1/2 items-stretch max-[899px]:right-3 max-[899px]:left-auto max-[899px]:translate-x-0"
      >
        <span class="flex items-center border-r-2 border-ink px-2.5 text-[11px] tracking-[0.1em] text-pencil uppercase max-[899px]:hidden">Parts bin</span>
        <For
          each={partsBin(levelIndex())}
          fallback={<span class="flex items-center px-3 py-2 text-xs text-pencil">Empty, for now</span>}
        >
          {(type) => (
            <button
              class="flex flex-col items-center gap-0.5 px-2.5 pt-1.5 pb-1 text-[11px] font-bold text-ink hover:bg-wash disabled:opacity-40 max-[899px]:px-2"
              data-gate={type}
              disabled={testing()}
              onClick={() => place(type)}
            >
              <GateIcon type={type} class="h-6 w-9" />
              {type}
            </button>
          )}
        </For>
        {/* Split and join are wiring the level supplies, not parts, so they
            sit apart at the end, and only on levels with buses. */}
        <Show when={wiring(level()).length > 0}>
          <span class="flex items-center border-x-2 border-ink px-2.5 text-[11px] tracking-[0.1em] text-pencil uppercase max-[899px]:hidden">
            Wiring
          </span>
          <For each={wiring(level())}>
            {(w) => (
              <button
                class="flex flex-col items-center gap-0.5 px-2.5 pt-1.5 pb-1 text-[11px] font-bold text-ink hover:bg-wash disabled:opacity-40 max-[899px]:px-2"
                data-gate={w.type}
                data-width={w.width}
                disabled={testing()}
                onClick={() => place(w.type, w.width)}
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
function RoughInk() {
  return (
    <svg class="absolute size-0" aria-hidden="true">
      <filter id="rough-ink" x="-10%" y="-20%" width="120%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.6" result="speckle" />
        <feComposite in="rough" in2="speckle" operator="in" />
      </filter>
    </svg>
  );
}
