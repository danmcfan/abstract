import { For, Show } from "solid-js";
import { GRID_HEIGHT, GRID_WIDTH } from "../sim/grid";
import { LEVELS, toolbox, truthTable } from "../sim/level";
import { placeNode } from "../sim/circuit";
import { GATE_ACCENTS } from "./NodeView";
import {
  currentRow,
  level,
  levelIndex,
  mutate,
  result,
  rowResults,
  runTest,
  startLevel,
  testing,
  unlockedCount,
} from "./state";

const bit = (value: boolean) => (value ? "1" : "0");
const INPUT_NAMES = { ALPHA: "A", BETA: "B", NONE: "" };

// Frosted glass, Apple style.
const glass = "bg-white/70 backdrop-blur-xl backdrop-saturate-180 border border-black/8 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]";
const pill = "rounded-full px-3.5 py-1.5 font-medium transition-colors hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent";
const primary = "rounded-full px-5 py-2 font-medium text-white bg-action hover:bg-[#0077ed] disabled:opacity-40";

export function Hud() {
  const rows = () => truthTable(level());

  const status = () => {
    if (testing()) return { text: "Testing…", tone: "" };
    const r = result();
    if (!r) return null;
    if (r.forbidden.length > 0) return { text: `${r.forbidden.join(", ")} isn't in this level's toolbox.`, tone: "text-fail" };
    if (!r.passed) return { text: "Not quite. Check the rows marked ✗.", tone: "text-fail" };
    const hasNext = levelIndex() + 1 < LEVELS.length;
    return { text: hasNext ? `Solved! ${level().gate} is now in your toolbox.` : "Solved! That's every level so far.", tone: "text-pass" };
  };

  return (
    <div class="font-sans text-sm leading-normal text-ink antialiased">
      <div class={`fixed top-5 left-5 w-69 rounded-[18px] p-5 ${glass}`}>
        <p class="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Level {levelIndex() + 1}</p>
        <h1 class="text-xl font-semibold tracking-tight">Build {level().gate}</h1>
        <p class="my-2 text-muted">{level().goal}</p>

        <table class="my-3.5 w-full border-collapse text-[13px] tabular-nums">
          <thead>
            <tr class="border-b border-black/8 text-[11px] font-semibold tracking-wide text-muted">
              <For each={level().inputs}>{(label) => <th class="px-2 pb-1.5">{INPUT_NAMES[label]}</th>}</For>
              <th class="px-2 pb-1.5">OUT</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row, i) => {
                const actual = () => rowResults()[i()];
                return (
                  <tr class={currentRow() === i() ? "bg-signal/12" : ""}>
                    <For each={row.inputs}>{(value) => <td class="px-2 py-1 text-center">{bit(value)}</td>}</For>
                    <td class="px-2 py-1 text-center">{bit(row.expected)}</td>
                    <td class="px-2 py-1 text-center">
                      <Show when={actual() !== undefined}>
                        <span class={actual() === row.expected ? "text-pass" : "text-fail"}>
                          {actual() === row.expected ? "✓" : `✗ got ${bit(actual()!)}`}
                        </span>
                      </Show>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>

        <button id="test" class={primary} disabled={testing()} onClick={() => void runTest()}>
          Test
        </button>
        <Show when={status()}>
          {(s) => (
            <p id="status" class={`my-2 font-medium ${s().tone}`}>
              {s().text}
            </p>
          )}
        </Show>
        <Show when={result()?.passed && levelIndex() + 1 < LEVELS.length}>
          <button id="next" class={`${primary} mt-2 block`} onClick={() => startLevel(levelIndex() + 1)}>
            Next level →
          </button>
        </Show>
        <p class="mt-3.5 border-t border-black/8 pt-3 text-xs text-muted">
          Drag between pins to wire. Click an input to flip it. Right-click a gate or input pin to remove it.
        </p>
      </div>

      <div class={`fixed bottom-5 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full p-1.5 ${glass}`}>
        <For each={toolbox(levelIndex())}>
          {(type) => (
            <button
              class={`${pill} flex items-center gap-2`}
              data-gate={type}
              disabled={testing()}
              onClick={() => mutate((g) => placeNode(g, type, { x: GRID_WIDTH / 2, y: GRID_HEIGHT / 2 }))}
            >
              <span class="size-2 rounded-full" style={{ background: GATE_ACCENTS[type], "box-shadow": `0 0 6px ${GATE_ACCENTS[type]}` }} />
              {type}
            </button>
          )}
        </For>
      </div>

      <div class={`fixed top-5 right-5 flex gap-0.5 rounded-full p-1 ${glass}`}>
        <For each={Array.from({ length: unlockedCount() }, (_, i) => i)}>
          {(i) => (
            <button
              class={`${pill} min-w-8.5 px-2.5 ${i === levelIndex() ? "bg-white shadow-[0_1px_4px_rgba(0,0,0,0.12)] hover:bg-white" : ""}`}
              onClick={() => startLevel(i)}
            >
              {i + 1}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
