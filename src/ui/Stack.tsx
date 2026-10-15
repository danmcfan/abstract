import { For, Show, createEffect, createSignal, onCleanup, onMount, untrack, type JSX } from "solid-js";
import {
  LAYERS,
  LEVELS,
  layerLevels,
  levelId,
  layerOf,
  layerState,
  playableCount,
  type LayerState,
} from "../sim/level";
import { GateIcon } from "./GateIcon";
import { session } from "./state";

const pad = (n: number): string => String(n).padStart(2, "0");

const ROW: Record<LayerState, string> = {
  built: "border-solid border-ink bg-surface",
  "in progress": "border-solid border-ink bg-wash",
  locked: "border-dashed border-pencil bg-paper",
};
const BADGE: Record<LayerState, string> = {
  built: "border-ink bg-ink text-paper",
  "in progress": "border-ink bg-surface text-ink",
  locked: "border-pencil text-pencil",
};

// The stack, drawn as on the vision board: nine layers read
// bottom to top, inked in once built and dashed pencil while locked. Opening
// a layer shows its sheets, and picking one starts that level. The elevator
// in the shaft beside it sits at the current layer; arriving from the floor
// below, it rides up one floor.
const here = (): number => layerOf(session().levelIndex).number;

export function Stack(props: {
  arrive?: number | undefined;
  onPick: (index: number) => void;
  onClose: () => void;
}): JSX.Element {
  // The ride up plays once, from the floor the stack opened on.
  const arrive = untrack(() => props.arrive);
  const arriving = arrive !== undefined && arrive !== 0;
  const [open, setOpen] = createSignal(arrive ?? here());
  const [floor, setFloor] = createSignal(arriving ? arrive - 1 : here());
  const [car, setCar] = createSignal({ top: 0, height: 0 });
  const rows = new Map<number, HTMLElement>();
  let list: HTMLOListElement | undefined;

  const measure = (): void => {
    const li = rows.get(floor());
    const row = li?.firstElementChild;
    if (li && row instanceof HTMLElement) setCar({ top: li.offsetTop, height: row.offsetHeight });
  };
  createEffect(() => {
    floor();
    open();
    measure();
  });
  onMount(() => {
    const observer = new ResizeObserver(measure);
    if (list !== undefined) observer.observe(list);
    onCleanup(() => {
      observer.disconnect();
    });
    rows.get(open())?.scrollIntoView({ block: "center" });
    if (arriving) {
      // Two frames, so the car is drawn on the floor below before it moves.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFloor(arrive);
        });
      });
    }
  });

  return (
    <main id="stack" class="fixed inset-0 z-30 overflow-y-auto bg-paper/95 p-4 text-ink-deep">
      <div class="pop mx-auto my-4 w-full max-w-190 sheet">
        <header class="flex items-center justify-between gap-4 border-b-2 border-ink px-5 py-3">
          <div>
            <p class="text-xs text-pencil">Dwg LOA-001: each layer is built from the ones below it.</p>
            <h1 class="text-2xl font-bold text-ink">The stack</h1>
          </div>
          <button
            id="stack-close"
            class="btn btn-sm btn-ghost"
            onClick={() => {
              props.onClose();
            }}
          >
            Back
          </button>
        </header>

        <div class="relative px-5 py-4 pl-14">
          <div
            class="absolute top-4 bottom-4 left-5 w-6 border-x-2 border-dashed border-pencil/50"
            aria-hidden="true"
          />
          <div
            id="elevator"
            class="absolute top-(--car-top) left-5 flex h-(--car-height) w-6 items-center justify-center border-2 border-ink bg-glow/40 transition-elevator duration-700 ease-in-out"
            style={{ "--car-top": `${car().top}px`, "--car-height": `${car().height}px` }}
            aria-hidden="true"
          >
            <span class="h-3/5 w-0 border-l-2 border-ink" />
          </div>

          <ol
            ref={(el) => {
              list = el;
            }}
            class="flex flex-col-reverse"
            aria-label="Layers, bottom to top"
          >
            <For each={LAYERS}>
              {(layer) => {
                const state = (): LayerState => layerState(layer.number, session().solved);
                const locked = (): boolean => state() === "locked";
                const isOpen = (): boolean => open() === layer.number && !locked();
                return (
                  <li
                    ref={(el) => {
                      rows.set(layer.number, el);
                    }}
                    class={`-mt-0.5 border-2 ${ROW[state()]}`}
                    data-state={state()}
                  >
                    <button
                      class="grid w-full grid-cols-floor items-center gap-x-3 px-3.5 py-1.5 text-left enabled:cursor-pointer enabled:hover:bg-wash/60"
                      data-layer={layer.number}
                      disabled={locked()}
                      aria-expanded={locked() ? undefined : isOpen()}
                      onClick={() => {
                        setOpen(layer.number);
                      }}
                    >
                      <span class={`text-xs ${locked() ? "text-pencil" : "font-bold text-ink"}`}>L{layer.number}</span>
                      <span>
                        <span class={`block text-copy leading-snug font-bold ${locked() ? "text-pencil" : "text-ink"}`}>
                          {layer.name}
                        </span>
                        <span class="block text-note leading-snug text-pencil">{layer.parts}</span>
                        <span class="block font-hand text-copy leading-snug text-ink">Floor: {layer.floor}</span>
                      </span>
                      <span class={`border-hair px-2 py-0.5 text-xs whitespace-nowrap ${BADGE[state()]}`}>
                        {state()}
                      </span>
                    </button>
                    <Show when={isOpen()}>
                      <div class="flex flex-wrap gap-2.5 px-3.5 pb-3.5 pl-floor-text">
                        <For each={layerLevels(layer.number)}>
                          {(i) => {
                            const level = LEVELS[i];
                            if (level === undefined)
                              throw new Error(`Layer ${layer.number} lists a missing level ${i}`);
                            const playable = (): boolean => i < playableCount(session().solved);
                            const current = (): boolean => i === session().levelIndex;
                            const look = (): string => {
                              if (!playable()) return "border-dashed border-pencil text-pencil";
                              return current()
                                ? "cursor-pointer border-ink bg-wash text-ink shadow-[3px_3px_0_var(--color-ink)]"
                                : "cursor-pointer border-ink bg-surface text-ink hover:bg-wash";
                            };
                            return (
                              <button
                                class={`flex flex-col items-start gap-0.5 border-2 px-2.5 py-1.5 text-left ${look()}`}
                                data-level={i + 1}
                                disabled={!playable()}
                                aria-current={current() ? "step" : undefined}
                                onClick={() => {
                                  props.onPick(i);
                                }}
                              >
                                <span class="text-fine text-pencil">SH {pad(i + 1)}</span>
                                <span class="flex items-center gap-1.5 text-note font-bold">
                                  <Show when={level.kind !== "instruction set" && level}>
                                    {(circuit) => <GateIcon type={circuit().gate} class="h-5 w-7" />}
                                  </Show>
                                  {levelId(level)}
                                </span>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ol>
        </div>
      </div>
    </main>
  );
}
