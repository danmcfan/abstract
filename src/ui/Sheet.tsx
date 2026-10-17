import { For, Show, createEffect, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
import {
  CLOCK,
  hasClock,
  layerOf,
  type CircuitLevel,
  type Layer,
  partsBin,
  terminalWidth,
  TICK_LIMIT,
  wiring,
} from "../sim/level";
import { goalText } from "../sim/level";
import type { Value } from "../sim/node";
import { CLOCK_SPEED } from "../sim/session";
import { CLUES } from "./clues";
import { hush, say } from "./speech";
import { GateIcon, partName } from "./GateIcon";
import { SoundButton } from "./SoundButton";
import * as script from "./script";
import { boardPointAt } from "./Board";
import { binDrag, driver, placePart, running, session, setBinDrag } from "./state";
import { pastDeadZone } from "../sim/gesture";
import type { NodeType } from "../sim/node";

const pad = (n: number): string => String(n).padStart(2, "0");
// A bus value's signals, high bit first, for hovering over its number.
const binary = (value: Value, width: number): string => value.toString(2).padStart(width, "0");

// The sheets pinned around the board: the menu bar across the top, the
// brief down the left with the level's truth table and test, and the parts
// bin along the bottom. Passing a layer's last level leads up to the next
// floor, through the stack. The instruction set level has no circuit, so
// its brief has no table or test, and its parts bin is shut.
const circuit = (): CircuitLevel | null => session().circuit;
const labels = (): string[] => {
  const level = circuit();
  return level ? [...level.inputs, ...level.outputs] : [];
};
const widths = (): number[] => {
  const level = circuit();
  return level ? labels().map((label) => terminalWidth(level, label)) : [];
};
// A row's outputs as the test column writes them: single signals run
// together as bits, bus values are numbers apart.
const written = (values: Value[]): string => values.join(widths().some((width) => width > 1) ? " " : "");
// A timing table numbers its steps, and marks the steps that tick the clock.
const clocked = (): boolean => {
  const level = circuit();
  return level !== null && hasClock(level);
};
const timed = (): boolean => circuit()?.steps !== undefined;
// The CPU's level is tested by programs, one row each.
const programmed = (): boolean => circuit()?.programs !== undefined;
const list = (values: Value[]): string => (values.length > 0 ? values.join(", ") : "–");
const layer = (): Layer => layerOf(session().levelIndex);
// The floor a passed level leads up to, if it's the last of its layer.
function floor(): Layer | null {
  const next = session().next;
  return next?.to === "floor" ? next.layer : null;
}

function status(): { text: string; tone: string } | null {
  const { door } = session();
  if (door?.outcome === "open") return { text: "The door is open. You made it out!", tone: "text-pass" };
  if (door?.outcome === "shut") return { text: `The door got ${door.sent ?? 0}. It stays shut.`, tone: "text-fail" };
  if (door?.outcome === "halted") return { text: "HALT, with nothing sent to the door.", tone: "text-fail" };
  if (session().testing) return { text: "Testing…", tone: "text-pencil" };
  const r = session().result;
  if (!r) return null;
  if (r.forbidden.length > 0)
    return { text: `${r.forbidden.join(", ")} isn't in this level's parts bin.`, tone: "text-fail" };
  if (r.unstable) return { text: "Unstable: a loop on the board never settles.", tone: "text-fail" };
  if (r.endless) return { text: `A test program never stopped at HALT in ${TICK_LIMIT} ticks.`, tone: "text-fail" };
  if (!r.passed) return { text: "Not quite. Some rows don't match.", tone: "text-fail" };
  // A pass says itself with the stamp, the part in the bin and the green
  // Next level button.
  return null;
}

export function MenuBar(props: { onMenu: () => void; onStack: (arrive?: number) => void }): JSX.Element {
  return (
    <header id="menu-bar" class="col-span-2 flex items-stretch text-sm text-ink-deep sheet">
      <span class="flex items-center border-r-2 border-ink px-3 text-xs text-pencil">
        SH {pad(session().levelIndex + 1)}
      </span>
      <h1 class="flex items-center px-3 text-lg font-bold text-ink">{script.heading(session().level)}</h1>
      <nav class="ml-auto flex items-center gap-2.5 py-1.5 pr-3 pl-2">
        <LevelBulbs />
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

// One bulb for each level of this layer, lit once it's solved. The bulb
// that lights on this visit lights with a bounce.
function LevelBulbs(): JSX.Element {
  return (
    <span id="bulbs" class="flex items-center gap-1" aria-label="Levels solved in this layer">
      <For each={session().bulbs}>
        {(bulb) => (
          <span
            data-lit={bulb.lit}
            classList={{ "bulb-lit": bulb.current && bulb.lit && session().justSolved }}
            class={`size-2.5 rounded-full border-hair ${bulb.lit ? "border-live bg-glow" : "border-pencil"} ${bulb.current ? "outline-2 outline-offset-1 outline-ink" : ""}`}
          />
        )}
      </For>
    </span>
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
          <Show when={circuit()}>
            {(level) => <GateIcon type={level().gate} class="h-11 w-16 shrink-0 text-ink" />}
          </Show>
          <p class="text-note leading-snug">{goalText(session().level)}</p>
        </div>

        <Show when={session().level.kind === "instruction set"}>
          <p class="mt-3 text-note leading-snug text-pencil">
            The table is checked as you type. Every mnemonic and every opcode must be different.
          </p>
        </Show>

        <Show when={session().level.kind === "door program"}>
          <ul class="mt-3 list-disc pl-4 text-note leading-snug text-pencil">
            <li>One instruction per line: a mnemonic, then its operands, split by commas.</li>
            <li>Registers are R0 to R3. Devices are DOOR and KEYPAD. Numbers are 0 to 255, or hex as 0x1f.</li>
            <li>
              <code>name:</code> at the start of a line is a label a jump can go to. <code>;</code> starts a comment.
            </li>
          </ul>
        </Show>

        <Show when={circuit() && programmed()}>
          <div class="mt-3">
            <div class="relative w-full">
              <table id="programs" class="w-full border-collapse text-center text-note tabular-nums">
                <thead>
                  <tr class="text-ink">
                    <th class="border-hair border-ink px-2 py-0.5">test program</th>
                    <th class="border-hair border-ink px-2 py-0.5">DIN</th>
                    <th class="border-hair border-ink px-2 py-0.5">out</th>
                    <th class="w-12 border-hair border-ink px-1 py-0.5 text-xs font-normal text-pencil">test</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={session().rows}>
                    {(row, i) => (
                      <tr class={session().currentRow === i() ? "bg-wash font-bold" : ""}>
                        <td class="border-hair border-ink px-2 py-0.5 text-left">{row.name}</td>
                        <td class="border-hair border-ink px-2 py-0.5">{list(row.inputs)}</td>
                        <td class="border-hair border-ink px-2 py-0.5">{list(row.expected)}</td>
                        <td class="border-hair border-ink px-1 py-0.5">
                          <Show when={row.actual} fallback={<span class="text-pencil/50">·</span>}>
                            {(values) => (
                              <span class={row.status === "passed" ? "text-pass" : "text-fail"}>
                                {row.status === "passed" ? "✓" : `✗${list(values())}`}
                              </span>
                            )}
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={session().stamped}>
                <span id="stamp" class="stamp">
                  PASSED
                </span>
              </Show>
            </div>
            {/* While a program runs, the instruction the execute unit is
                doing, and its registers. */}
            <Show when={session().now}>
              {(now) => (
                <div id="doing" class="mt-3 text-note">
                  <p>
                    <span class="text-pencil">Doing </span>
                    <span class="font-bold text-ink">{now().instruction}</span>
                  </p>
                  <p class="mt-1 flex gap-3 tabular-nums">
                    <For each={now().registers}>
                      {(value, r) => (
                        <span>
                          <span class="text-pencil">R{r()} </span>
                          {value}
                        </span>
                      )}
                    </For>
                  </p>
                </div>
              )}
            </Show>
          </div>
        </Show>

        <Show when={circuit() && !programmed()}>
          {/* The execute unit's table is wider than the brief, so it scrolls
              sideways. */}
          <div class="mt-3">
            <div class="relative w-full overflow-x-auto">
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
        </Show>
      </div>

      {/* The last sheet of each of the first six floors has a pencil note in
          its margin once it's solved. */}
      <Show when={session().clue}>
        {(clueLayer) => (
          <p id="clue" class="mb-3 shrink-0 -rotate-2 font-hand text-copy leading-snug text-pencil">
            {CLUES[clueLayer()]}
          </p>
        )}
      </Show>

      <div class="shrink-0 border-t-2 border-ink pt-3">
        <Show when={circuit()}>
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
            <Show when={clocked()}>
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
              <ClockSpeed />
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
            <div
              class="mt-3 border-2 border-dashed border-fail p-2.5"
              role="alertdialog"
              aria-label="Clear this board?"
            >
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
        </Show>

        <Show when={status()}>
          {(s) => (
            <p id="status" class={`mt-2 font-bold ${s().tone}`}>
              {s().text}
            </p>
          )}
        </Show>
        {/* The way on keeps its place, disabled until the level is solved,
            so nothing moves when it is. The last level has none. */}
        <Show when={!session().isLastLevel}>
          <Show
            when={session().floorAhead}
            fallback={
              <button
                id="next"
                class="mt-2.5 btn btn-go"
                disabled={session().next?.to !== "level"}
                onClick={() => {
                  hush();
                  driver.start(session().levelIndex + 1);
                }}
              >
                Next level ▸
              </button>
            }
          >
            {(above) => (
              <button
                id="up"
                class="mt-2.5 btn btn-go"
                disabled={floor() === null}
                onClick={() => {
                  props.onStack(above().number);
                }}
              >
                Up to {above().floor} ▸
              </button>
            )}
          </Show>
        </Show>
      </div>
      <RoughInk />
    </section>
  );
}

// The clock speed gauge, on every level with a clock and in the door
// program. It steps through doublings, 1 to 64 ticks a second.
export function ClockSpeed(): JSX.Element {
  return (
    <label class="flex items-center gap-1.5 text-xs text-pencil">
      Clock speed
      <input
        id="clock-speed"
        type="range"
        min={Math.log2(CLOCK_SPEED.min)}
        max={Math.log2(CLOCK_SPEED.max)}
        step={1}
        value={Math.log2(session().clockSpeed)}
        class="w-20 accent-ink"
        onInput={(event) => {
          driver.setClockSpeed(2 ** Number(event.currentTarget.value));
        }}
      />
      <output for="clock-speed" class="w-8 font-bold text-ink">
        {session().clockSpeed}/s
      </output>
    </label>
  );
}

const wiringHere = (): ReturnType<typeof wiring> => {
  const level = circuit();
  return level ? wiring(level) : [];
};

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
            each={circuit() ? partsBin(session().levelIndex) : []}
            fallback={
              <Show when={session().earned === null}>
                <span class="row-span-2 self-center px-1 text-xs whitespace-nowrap text-pencil">Empty, for now</span>
              </Show>
            }
          >
            {(type) => {
              const hand = pickUp(type, 1);
              return (
                <button
                  class={PART_CARD}
                  data-gate={type}
                  disabled={session().testing}
                  onPointerDown={hand.onPointerDown}
                  onClick={hand.onClick}
                >
                  <GateIcon type={type} class="h-9 w-15 shrink-0" />
                  {type}
                </button>
              );
            }}
          </For>
          {/* The open level's own part, once it's solved, for the levels
              after it; it can't go on this level's board. */}
          <Show when={circuit() && session().earned}>
            {(type) => (
              <button
                class={PART_CARD}
                classList={{ earned: session().justSolved }}
                data-gate={type()}
                data-earned
                aria-disabled="true"
                title="For the levels after this one"
              >
                <GateIcon type={type()} class="h-9 w-15 shrink-0" />
                {type()}
              </button>
            )}
          </Show>
          {/* Splits, joins and constants are wiring the level supplies, not
              parts, so they sit apart at the end, from a fresh column, and
              only on levels that have some. */}
          <Show when={wiringHere().length > 0}>
            <span class="row-span-2 border-l-2 border-dashed border-ink" aria-hidden="true" />
            <For each={wiringHere()}>
              {(w) => {
                const hand = pickUp(w.type, w.width);
                return (
                  <button
                    class={PART_CARD}
                    data-gate={w.type}
                    data-width={w.width}
                    disabled={session().testing}
                    onPointerDown={hand.onPointerDown}
                    onClick={hand.onClick}
                  >
                    <GateIcon type={w.type} width={Math.min(w.width, 4)} class="h-9 w-15 shrink-0" />
                    {partName(w.type, w.width)}
                  </button>
                );
              }}
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

// A bin card's handlers: a click drops its part in the middle of the board;
// pressing and dragging past the dead zone carries it, previewed on the
// board, to the cell it's let go over, or nowhere if that's off the board.
function pickUp(
  type: NodeType,
  width: number,
): {
  onPointerDown: (event: PointerEvent & { currentTarget: HTMLButtonElement }) => void;
  onClick: () => void;
} {
  // Whether the last press was a drag, so the click that ends it places nothing more.
  let dragged = false;
  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      dragged = false;
      const card = event.currentTarget;
      const start = { x: event.clientX, y: event.clientY };
      card.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent): void => {
        if (!dragged && !pastDeadZone(e.clientX - start.x, e.clientY - start.y)) return;
        dragged = true;
        setBinDrag({ type, width, at: boardPointAt(e.clientX, e.clientY) });
      };
      const end = (e: PointerEvent): void => {
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerup", end);
        card.removeEventListener("pointercancel", end);
        // A cancelled press is followed by no click, so nothing else clears the flag.
        const at = e.type === "pointerup" ? binDrag()?.at : null;
        if (e.type === "pointercancel") dragged = false;
        setBinDrag(null);
        if (dragged && at && !session().testing) placePart(type, width, at);
      };
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerup", end);
      card.addEventListener("pointercancel", end);
    },
    onClick: () => {
      if (dragged) {
        dragged = false;
        return;
      }
      placePart(type, width);
    },
  };
}

const BIN_ARROW =
  "w-7 shrink-0 text-xl font-bold text-ink hover:bg-wash disabled:cursor-default disabled:text-dead disabled:hover:bg-transparent";

// A part in the bin, drawn as a card with its symbol over its name, big enough
// to read and pick up.
const PART_CARD =
  "flex h-22.5 w-30 flex-col items-center justify-center gap-0.5 border-hair border-ink bg-surface px-1 text-copy leading-tight font-bold text-ink hover:bg-wash disabled:opacity-40";

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
