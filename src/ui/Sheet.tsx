import { For, Match, Show, Switch, createEffect, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
import { CLOCK, hasClock, layerOf, type Layer, partGiven, partsBin, terminalWidth, wiring } from "../sim/level";
import type { Value } from "../sim/node";
import { say } from "./speech";
import { GateIcon } from "./GateIcon";
import { SoundButton } from "./SoundButton";
import * as script from "./script";
import { driver, placePart, running, session } from "./state";

const pad = (n: number): string => String(n).padStart(2, "0");
// A bus value's signals, high bit first, for hovering over its number.
const binary = (value: Value, width: number): string => value.toString(2).padStart(width, "0");

// The sheets pinned around the board: the menu bar across the top, the
// brief down the left with the level's truth table and test, and the parts
// bin along the bottom. Passing a layer's last level leads up to the next
// floor, through the stack.
const labels = (): string[] => [...session().level.inputs, ...session().level.outputs];
const widths = (): number[] => labels().map((label) => terminalWidth(session().level, label));
// A row's outputs as the test column writes them: single signals run
// together as bits, bus values are numbers apart.
const written = (values: Value[]): string => values.join(widths().some((width) => width > 1) ? " " : "");
// A timing table numbers its steps, and marks the steps that tick the clock.
const timed = (): boolean => session().level.steps !== undefined;
const layer = (): Layer => layerOf(session().levelIndex);
// The floor a passed level leads up to, if it's the last of its layer.
function floor(): Layer | null {
  const next = session().next;
  return next?.to === "floor" ? next.layer : null;
}

function status(): { text: string; tone: string } | null {
  if (session().testing) return { text: "Testing…", tone: "text-pencil" };
  const r = session().result;
  if (!r) return null;
  if (r.forbidden.length > 0)
    return { text: `${r.forbidden.join(", ")} isn't in this level's parts bin.`, tone: "text-fail" };
  if (r.unstable) return { text: "Unstable: a loop on the board never settles.", tone: "text-fail" };
  if (!r.passed) return { text: "Not quite. Some rows don't match.", tone: "text-fail" };
  return {
    text:
      session().next?.to === "end"
        ? "Tested! That's every level so far."
        : `Tested! ${partGiven(session().level).gate} is in your parts bin.`,
    tone: "text-pass",
  };
}

export function MenuBar(props: { onMenu: () => void; onStack: (arrive?: number) => void }): JSX.Element {
  return (
    <header id="menu-bar" class="col-span-2 flex items-stretch text-sm text-ink-deep sheet">
      <span class="flex items-center border-r-2 border-ink px-3 text-xs text-pencil">
        SH {pad(session().levelIndex + 1)}
      </span>
      <h1 class="flex items-center px-3 text-lg font-bold text-ink">
        {session().level.prebuilt === true ? "Meet" : "Build"} {session().level.gate}
      </h1>
      <nav class="ml-auto flex items-center gap-2.5 py-1.5 pr-3 pl-2">
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
            say(script.help(session().level));
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
    </header>
  );
}

export function Brief(props: { onStack: (arrive?: number) => void }): JSX.Element {
  const [clearing, setClearing] = createSignal(false);
  createEffect(
    on(
      () => session().levelIndex,
      (): void => {
        setClearing(false);
      },
    ),
  );

  return (
    <section
      id="brief"
      classList={{ shake: session().stamped }}
      class="flex min-h-0 flex-col p-4 text-sm leading-normal text-ink-deep sheet"
    >
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="flex items-center gap-3">
          <GateIcon type={session().level.gate} class="h-11 w-16 shrink-0 text-ink" />
          <p class="text-note leading-snug">{session().level.goal}</p>
        </div>

        <div class="mt-3">
          <div class="relative w-full">
            <table class="w-full border-collapse text-center text-note tabular-nums">
              <thead>
                <tr class="text-ink">
                  <Show when={timed()}>
                    <th class="border-hair border-ink px-1 py-0.5 text-xs font-normal text-pencil">step</th>
                  </Show>
                  <For each={labels()}>{(label) => <th class="border-hair border-ink px-2 py-0.5">{label}</th>}</For>
                  <th class="w-12 border-hair border-ink px-1 py-0.5 text-xs font-normal text-pencil">test</th>
                </tr>
              </thead>
              <tbody>
                <For each={session().rows}>
                  {(row, i) => {
                    const got = (): string | undefined =>
                      row.status === "failed" && row.actual ? `got ${written(row.actual)}` : undefined;
                    return (
                      <tr class={session().currentRow === i() ? "bg-wash font-bold" : ""}>
                        <Show when={timed()}>
                          <td class="border-hair border-ink px-1 py-0.5 text-pencil">{i() + 1}</td>
                        </Show>
                        <For each={[...row.inputs, ...row.expected]}>
                          {(value, column) => {
                            const width = (): number => widths()[column()] ?? 1;
                            const ticks = (): boolean => row.tick === true && labels()[column()] === CLOCK;
                            return (
                              <td
                                class="border-hair border-ink px-2 py-0.5"
                                title={width() > 1 ? binary(value, width()) : undefined}
                              >
                                <Show when={ticks()} fallback={value}>
                                  tick
                                </Show>
                              </td>
                            );
                          }}
                        </For>
                        <td class="border-hair border-ink px-1 py-0.5" title={got()}>
                          <Show when={row.actual} fallback={<span class="text-pencil/50">·</span>}>
                            {(values) => (
                              <span class={row.status === "passed" ? "text-pass" : "text-fail"}>
                                {row.status === "passed" ? "✓" : `✗${written(values())}`}
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
            <Show when={session().stamped}>
              <span id="stamp" class="stamp">
                PASSED
              </span>
            </Show>
          </div>
        </div>
      </div>

      <div class="shrink-0 border-t-2 border-ink pt-3">
        <div class="flex flex-wrap items-center gap-3">
          <button
            id="test"
            class="btn"
            disabled={session().testing}
            onClick={() => {
              driver.test();
            }}
          >
            Run test
          </button>
          <Show when={hasClock(session().level)}>
            <button
              id="tick"
              class="btn btn-sm"
              disabled={session().testing}
              onClick={() => {
                driver.tick();
              }}
            >
              Tick
            </button>
            <button
              id="run-clock"
              class="btn btn-sm"
              disabled={session().testing}
              onClick={() => {
                driver.toggleClock();
              }}
            >
              {running() ? "Pause" : "Run"}
            </button>
          </Show>
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

        <Show when={clearing()}>
          <div class="mt-3 border-2 border-dashed border-fail p-2.5" role="alertdialog" aria-label="Clear this board?">
            <p class="mb-2 text-note">Clear this board?</p>
            <div class="flex gap-3">
              <button
                id="clear-confirm"
                class="btn border-fail bg-fail btn-sm"
                onClick={() => {
                  setClearing(false);
                  driver.clear();
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
        <Switch>
          <Match when={session().next?.to === "level"}>
            <button
              id="next"
              class="mt-2.5 btn"
              onClick={() => {
                driver.start(session().levelIndex + 1);
              }}
            >
              Next level ▸
            </button>
          </Match>
          <Match when={floor()}>
            {(above) => (
              <button
                id="up"
                class="mt-2.5 btn"
                onClick={() => {
                  props.onStack(above().number);
                }}
              >
                Up to {above().floor} ▸
              </button>
            )}
          </Match>
        </Switch>
      </div>
      <RoughInk />
    </section>
  );
}

export function PartsBin(): JSX.Element {
  let shelf: HTMLDivElement | undefined;
  const [canBack, setCanBack] = createSignal(false);
  const [canOn, setCanOn] = createSignal(false);
  // The arrows only show when the bin holds more than fits.
  const arrow = (): string => `${BIN_ARROW} ${canBack() || canOn() ? "" : "invisible"}`;
  const measure = (): void => {
    if (!shelf) return;
    setCanBack(shelf.scrollLeft > 1);
    setCanOn(shelf.scrollLeft + shelf.clientWidth < shelf.scrollWidth - 1);
  };
  // Moves the shelf one column of cards along, to the next column's left
  // edge, so the bin never stops halfway through a card.
  let stepping = false;
  const step = (direction: 1 | -1): void => {
    if (!shelf) return;
    // Every edge is measured from the first card's, which sits at the left
    // with the shelf scrolled all the way back.
    const cards = [...shelf.querySelectorAll<HTMLElement>("[data-gate]")];
    const edges = cards.map((card) => card.offsetLeft - (cards[0]?.offsetLeft ?? 0));
    const from = shelf.scrollLeft;
    const target =
      direction > 0 ? edges.find((edge) => edge > from + 1) : Math.max(...edges.filter((edge) => edge < from - 1));
    if (target === undefined || !Number.isFinite(target)) return;
    stepping = true;
    shelf.scrollTo({ left: target, behavior: "smooth" });
  };
  // A level changes the parts on the shelf, so it starts again from the left.
  createEffect(
    on(
      () => session().levelIndex,
      (): void => {
        shelf?.scrollTo({ left: 0 });
        measure();
      },
    ),
  );
  onMount(() => {
    const resized = new ResizeObserver(measure);
    if (shelf) resized.observe(shelf);
    onCleanup(() => {
      resized.disconnect();
    });
  });

  return (
    <section id="parts-bin" class="flex min-h-0 min-w-0 flex-col text-ink-deep sheet">
      <span class="shrink-0 border-b-2 border-ink px-3 py-1 text-label tracking-label text-pencil uppercase">
        Parts bin
      </span>
      <div class="flex min-h-0 flex-1">
        <button
          id="bin-back"
          class={arrow()}
          aria-label="Earlier parts"
          disabled={!canBack()}
          onClick={() => {
            step(-1);
          }}
        >
          ‹
        </button>
        {/* Two rows of cards that fill a column at a time, so the bin pages
            sideways. A vertical mouse wheel steps it one column too. */}
        <div
          ref={(el) => {
            shelf = el;
          }}
          class="relative grid min-w-0 flex-1 scrollbar-none auto-cols-min grid-flow-col grid-rows-2 content-center gap-2 overflow-x-auto p-2"
          onScroll={measure}
          onScrollEnd={() => {
            stepping = false;
          }}
          onWheel={(event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.preventDefault();
            if (!stepping) step(event.deltaY > 0 ? 1 : -1);
          }}
        >
          <For
            each={partsBin(session().levelIndex)}
            fallback={
              <span class="row-span-2 self-center px-1 text-xs whitespace-nowrap text-pencil">Empty, for now</span>
            }
          >
            {(type) => (
              <button
                class={PART_CARD}
                data-gate={type}
                disabled={session().testing}
                onClick={() => {
                  placePart(type);
                }}
              >
                <GateIcon type={type} class="h-6 w-10 shrink-0" />
                {type}
              </button>
            )}
          </For>
          {/* Split and join are wiring the level supplies, not parts, so they
              sit apart at the end, from a fresh column, and only on levels
              with buses. */}
          <Show when={wiring(session().level).length > 0}>
            <span class="row-span-2 border-l-2 border-dashed border-ink" aria-hidden="true" />
            <For each={wiring(session().level)}>
              {(w) => (
                <button
                  class={PART_CARD}
                  data-gate={w.type}
                  data-width={w.width}
                  disabled={session().testing}
                  onClick={() => {
                    placePart(w.type, w.width);
                  }}
                >
                  <GateIcon type={w.type} width={Math.min(w.width, 4)} class="h-6 w-10 shrink-0" />
                  {`${w.type} ${w.width}`}
                </button>
              )}
            </For>
          </Show>
        </div>
        <button
          id="bin-on"
          class={arrow()}
          aria-label="More parts"
          disabled={!canOn()}
          onClick={() => {
            step(1);
          }}
        >
          ›
        </button>
      </div>
    </section>
  );
}

const BIN_ARROW =
  "w-7 shrink-0 text-xl font-bold text-ink hover:bg-wash disabled:cursor-default disabled:text-dead disabled:hover:bg-transparent";

// A part in the bin, drawn as a little card with its symbol over its name.
const PART_CARD =
  "flex h-15 w-20 flex-col items-center justify-center gap-0.5 border-hair border-ink bg-surface px-1 text-fine leading-tight font-bold text-ink hover:bg-wash disabled:opacity-40";

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
