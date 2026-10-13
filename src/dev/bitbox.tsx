import { For, Show, batch, createEffect, createSignal, onCleanup, onMount, untrack, type JSX } from "solid-js";
import { render } from "solid-js/web";
import type { Arm, Pose } from "../robot/clips";
import { EXPRESSIONS, type Expression } from "../robot/expression";
import { createViewer, gameLighting, type Lighting, type View, type Viewer } from "../robot/viewer";

// Bitbox's model sheet, a dev-only page at /bitbox.html: the robot under
// lights you can move, from any side, in any expression, or posed by hand.
// Settings live in the URL, so a view can be bookmarked or shared.

const LIGHTS: Record<string, Lighting> = {
  game: gameLighting(),
  flat: { ...gameLighting(), fill: 3.1, sun: 0 },
  side: { ...gameLighting(), fill: 1.4, sun: 2.2, azimuth: -80, elevation: 12 },
  noon: { ...gameLighting(), fill: 1.8, sun: 1.6, azimuth: 10, elevation: 85 },
  backlit: { ...gameLighting(), fill: 1.6, sun: 0.8, azimuth: 150, elevation: 35, rim: 2.5, rimColor: "#7fd0ff" },
  under: { ...gameLighting(), fill: 1.2, sun: 2, azimuth: 10, elevation: -40 },
  night: {
    fill: 0.9,
    fillColor: "#3a5a99",
    sun: 0.9,
    sunColor: "#7fd0ff",
    azimuth: -40,
    elevation: 30,
    rim: 1.4,
    rimColor: "#7fd0ff",
  },
};

// Backgrounds behind the canvas, each named by the theme colour (from
// src/styles.css) its swatch shows and its snapshot is filled with.
type Backdrop = { class: string; swatch: string; token: string };
const BACKDROPS: Record<string, Backdrop> = {
  paper: { class: "", swatch: "bg-paper", token: "paper" },
  white: { class: "bg-surface", swatch: "bg-surface", token: "surface" },
  blueprint: { class: "blueprint-grid", swatch: "bg-blueprint", token: "blueprint" },
  void: { class: "bg-void", swatch: "bg-void", token: "void" },
  grey: { class: "bg-slate", swatch: "bg-slate", token: "slate" },
  black: { class: "bg-soot", swatch: "bg-soot", token: "soot" },
};
// The canvas needs the colour itself, so read the token rather than copy it.
// Tailwind only emits theme colours a class uses, so a missing one throws
// rather than snapshotting on black.
const backdropColor = (name: string): string => {
  const { token } = backdropFor(name);
  const color = getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
  if (color === "") throw new Error(`no theme colour --color-${token}`);
  return color;
};

const VIEWS: View[] = ["game", "close", "front", "side", "back", "top", "low"];

type Range = [min: number, max: number];
const HALF = Math.PI / 2;
// Every pose field but the arms is a single number.
type BodyKey = Exclude<keyof Pose, "leftArm" | "rightArm">;
const BODY: [BodyKey, Range][] = [
  ["slide", [-0.5, 0.5]],
  ["hop", [-0.1, 0.3]],
  ["squash", [-0.2, 0.2]],
  ["lean", [-HALF, HALF]],
  ["roll", [-HALF, HALF]],
  ["turn", [-Math.PI, Math.PI]],
  ["nod", [-HALF, HALF]],
  ["tilt", [-HALF, HALF]],
  ["look", [-HALF, HALF]],
  ["antenna", [-1, 1]],
  ["spring", [0.5, 1.6]],
  ["led", [0, 1]],
  ["wheels", [-Math.PI, Math.PI]],
];
const ARM: [keyof Arm, Range][] = [
  ["raise", [-0.5, 3.2]],
  ["reach", [-1.5, 2.2]],
  ["bend", [-0.3, 2.6]],
];

const params = new URLSearchParams(location.search);
const pick = <T extends string>(key: string, options: readonly T[], fallback: T): T => {
  const value = params.get(key);
  return options.find((option) => option === value) ?? fallback;
};
const lightingFor = (name: string): Lighting => {
  const lighting = LIGHTS[name];
  if (lighting === undefined) throw new Error(`no lighting preset named ${name}`);
  return lighting;
};
const backdropFor = (name: string): Backdrop => {
  const backdrop = BACKDROPS[name];
  if (backdrop === undefined) throw new Error(`no backdrop named ${name}`);
  return backdrop;
};

function ModelSheet(): JSX.Element {
  let host: HTMLDivElement | undefined;
  let faceSlot: HTMLDivElement | undefined;
  let viewer: Viewer | undefined;

  const [expression, setExpression] = createSignal<Expression>(pick("e", EXPRESSIONS, "idle"));
  const [talking, setTalking] = createSignal(params.has("talk"));
  const [playing, setPlaying] = createSignal(true);
  const [rate, setRate] = createSignal(1);
  const [time, setTime] = createSignal(0);
  const [view, setView] = createSignal<View>(pick("view", VIEWS, "game"));
  const [spin, setSpin] = createSignal(0);
  const [preset, setPreset] = createSignal(pick("light", Object.keys(LIGHTS), "game"));
  const [lighting, setLighting] = createSignal<Lighting>(lightingFor(untrack(preset)));
  const [backdrop, setBackdrop] = createSignal(pick("bg", Object.keys(BACKDROPS), "paper"));
  const [outlines, setOutlines] = createSignal(true);
  const [shadows, setShadows] = createSignal(true);
  const [grid, setGrid] = createSignal(false);
  const [held, setHeld] = createSignal<Pose | null>(null);
  const [live, setLive] = createSignal<Pose>();

  onMount(() => {
    if (host === undefined || faceSlot === undefined) throw new Error("model sheet mounted without its stage");
    let lastTick = 0;
    viewer = createViewer(host, (t) => {
      const now = performance.now();
      if (now - lastTick < 100) return;
      lastTick = now;
      setTime(t);
      if (!held()) setLive(viewer?.pose());
    });
    faceSlot.append(viewer.face);
    viewer.face.className = "block w-full border-2 border-ink";
    Object.assign(window, { __bitbox: viewer });
  });
  onCleanup(() => viewer?.dispose());

  createEffect(() => viewer?.express(expression()));
  createEffect(() => viewer?.talk(talking()));
  createEffect(() => viewer?.play(playing()));
  createEffect(() => viewer?.speed(rate()));
  createEffect(() => viewer?.spin(spin()));
  createEffect(() => viewer?.view(view()));
  createEffect(() => viewer?.light(lighting()));
  createEffect(() => viewer?.outlines(outlines()));
  createEffect(() => viewer?.shadows(shadows()));
  createEffect(() => viewer?.grid(grid()));
  createEffect(() => viewer?.hold(held()));

  createEffect(() => {
    const q = new URLSearchParams({ e: expression(), view: view(), light: preset(), bg: backdrop() });
    if (talking()) q.set("talk", "");
    history.replaceState(null, "", `?${q}`);
  });

  const choosePreset = (name: string): void => {
    batch(() => {
      setPreset(name);
      setLighting(lightingFor(name));
    });
  };
  const tweak = (change: Partial<Lighting>): void => {
    batch(() => {
      setPreset("custom");
      setLighting((l) => ({ ...l, ...change }));
    });
  };

  // Touching a pose slider freezes the robot in its current pose and edits that.
  const shown = (): Pose | undefined => held() ?? live();
  const edit = (change: (p: Pose) => void): void => {
    const current = held() ?? viewer?.pose();
    if (current === undefined) return;
    const p = structuredClone(current);
    change(p);
    setHeld(p);
  };
  const release = (): void => {
    setHeld(null);
  };
  const copyPose = async (): Promise<void> => {
    await navigator.clipboard.writeText(
      JSON.stringify(shown(), (_k: string, v: unknown): unknown => (typeof v === "number" ? +v.toFixed(3) : v), 2),
    );
  };

  const snapshot = (): void => {
    if (viewer === undefined) return;
    const a = document.createElement("a");
    a.href = viewer.snapshot(backdropColor(backdrop()));
    a.download = `bitbox-${expression()}-${preset()}-${view()}.png`;
    a.click();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const n = Number(event.key);
    const chosen = n >= 1 ? EXPRESSIONS[n - 1] : undefined;
    if (chosen !== undefined) setExpression(chosen);
    else if (event.key === " ") setPlaying((p) => !p);
    else if (event.key === "t") setTalking((t) => !t);
    else if (event.key === "r") viewer?.restart();
    else return;
    event.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  onCleanup(() => {
    window.removeEventListener("keydown", onKey);
  });

  return (
    <div class="fixed inset-0 grid grid-rows-bench text-ink-deep md:grid-cols-bench md:grid-rows-1">
      <div class={`relative min-h-0 ${backdropFor(backdrop()).class}`}>
        <div
          ref={(el) => {
            host = el;
          }}
          id="stage"
          class="absolute inset-0"
        />
        <div
          class={`pointer-events-none absolute top-3 left-4 text-xs ${["blueprint", "void", "black"].includes(backdrop()) ? "text-paper" : ""}`}
        >
          <p class="font-bold tracking-stamp uppercase">Dwg LOA-B01 · Bitbox model sheet</p>
          <p class="mt-1 opacity-70">Drag to orbit · scroll to zoom · right-drag to pan</p>
          <p class="opacity-70">1–8 expression · space pause · T talk · R restart</p>
        </div>
      </div>

      <aside class="min-h-0 overflow-y-auto border-t-2 border-ink bg-surface md:border-t-0 md:border-l-2">
        <Section title="Expression">
          <div class="grid grid-cols-4 gap-1.5">
            <For each={EXPRESSIONS}>
              {(e, i) => (
                <Choice
                  on={expression() === e}
                  onClick={() => {
                    setExpression(e);
                  }}
                >
                  <span class="opacity-50">{i() + 1}</span> {e}
                </Choice>
              )}
            </For>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button
              class="w-20 btn btn-sm"
              onClick={() => {
                setPlaying((p) => !p);
              }}
            >
              {playing() ? "Pause" : "Play"}
            </button>
            <button
              class="btn btn-sm btn-ghost"
              onClick={() => {
                viewer?.restart();
              }}
            >
              Restart
            </button>
            <Toggle
              label="Talking"
              value={talking()}
              onChange={(on) => {
                setTalking(on);
              }}
            />
          </div>
          <Slider
            label="Time"
            min={0}
            max={Math.max(10, Math.ceil(time()))}
            step={0.01}
            value={time()}
            format={(t) => `${t.toFixed(2)}s`}
            onInput={(t) => {
              setPlaying(false);
              viewer?.seek(t);
              setTime(t);
            }}
          />
          <Slider
            label="Speed"
            min={0.1}
            max={2}
            step={0.05}
            value={rate()}
            format={(r) => `${r.toFixed(2)}×`}
            onInput={(r) => {
              setRate(r);
            }}
          />
        </Section>

        <Section title="Camera">
          <div class="grid grid-cols-4 gap-1.5">
            <For each={VIEWS}>
              {(v) => (
                <Choice
                  on={view() === v}
                  onClick={() => {
                    setView(v);
                    viewer?.view(v);
                  }}
                >
                  {v}
                </Choice>
              )}
            </For>
          </div>
          <Slider
            label="Turntable"
            min={-120}
            max={120}
            step={5}
            value={spin()}
            format={(d) => `${d}°/s`}
            onInput={(d) => {
              setSpin(d);
            }}
          />
          <button
            class="btn btn-sm btn-ghost"
            onClick={() => {
              setSpin(0);
              viewer?.unspin();
            }}
          >
            Face front
          </button>
        </Section>

        <Section title="Lighting">
          <div class="grid grid-cols-4 gap-1.5">
            <For each={Object.keys(LIGHTS)}>
              {(name) => (
                <Choice
                  on={preset() === name}
                  onClick={() => {
                    choosePreset(name);
                  }}
                >
                  {name}
                </Choice>
              )}
            </For>
          </div>
          <Slider
            label="Fill"
            min={0}
            max={4}
            step={0.05}
            value={lighting().fill}
            onInput={(fill) => {
              tweak({ fill });
            }}
          />
          <Slider
            label="Sun"
            min={0}
            max={4}
            step={0.05}
            value={lighting().sun}
            onInput={(sun) => {
              tweak({ sun });
            }}
          />
          <Slider
            label="Sun around"
            min={-180}
            max={180}
            step={1}
            value={lighting().azimuth}
            format={(d) => `${d}°`}
            onInput={(azimuth) => {
              tweak({ azimuth });
            }}
          />
          <Slider
            label="Sun height"
            min={-60}
            max={90}
            step={1}
            value={lighting().elevation}
            format={(d) => `${d}°`}
            onInput={(elevation) => {
              tweak({ elevation });
            }}
          />
          <Slider
            label="Rim"
            min={0}
            max={4}
            step={0.05}
            value={lighting().rim}
            onInput={(rim) => {
              tweak({ rim });
            }}
          />
          <div class="mt-2 grid grid-cols-3 gap-1.5 text-label">
            <Swatch
              label="Fill"
              value={lighting().fillColor}
              onInput={(fillColor) => {
                tweak({ fillColor });
              }}
            />
            <Swatch
              label="Sun"
              value={lighting().sunColor}
              onInput={(sunColor) => {
                tweak({ sunColor });
              }}
            />
            <Swatch
              label="Rim"
              value={lighting().rimColor}
              onInput={(rimColor) => {
                tweak({ rimColor });
              }}
            />
          </div>
        </Section>

        <Section title="Scene">
          <div class="grid grid-cols-3 gap-1.5">
            <For each={Object.keys(BACKDROPS)}>
              {(name) => (
                <Choice
                  on={backdrop() === name}
                  onClick={() => {
                    setBackdrop(name);
                  }}
                >
                  <span
                    class={`relative top-px mr-1 inline-block size-2.5 border border-ink ${backdropFor(name).swatch}`}
                  />
                  {name}
                </Choice>
              )}
            </For>
          </div>
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Toggle
              label="Outlines"
              value={outlines()}
              onChange={(on) => {
                setOutlines(on);
              }}
            />
            <Toggle
              label="Shadows"
              value={shadows()}
              onChange={(on) => {
                setShadows(on);
              }}
            />
            <Toggle
              label="Floor grid"
              value={grid()}
              onChange={(on) => {
                setGrid(on);
              }}
            />
          </div>
          <button class="mt-3 btn btn-sm" onClick={snapshot}>
            Save PNG
          </button>
        </Section>

        <Section title="Screen">
          <div
            ref={(el) => {
              faceSlot = el;
            }}
          />
        </Section>

        <Section title="Pose">
          <p class="mb-2 text-label text-pencil">
            <Show when={held()} fallback="Following the clip. Drag a slider to freeze and pose by hand.">
              Posed by hand.
            </Show>
          </p>
          <div class="mb-2 flex gap-2">
            <button class="btn btn-sm" disabled={!held()} onClick={release}>
              Back to clip
            </button>
            <button
              class="btn btn-sm btn-ghost"
              onClick={() => {
                void copyPose();
              }}
            >
              Copy JSON
            </button>
          </div>
          <Show when={shown()}>
            {(p) => (
              <>
                <For each={BODY}>
                  {([key, [min, max]]) => (
                    <Slider
                      label={key}
                      min={min}
                      max={max}
                      step={0.005}
                      value={p()[key]}
                      onInput={(v) => {
                        edit((q) => {
                          q[key] = v;
                        });
                      }}
                    />
                  )}
                </For>
                <For each={["leftArm", "rightArm"] as const}>
                  {(side) => (
                    <>
                      <p class="mt-3 text-label font-bold tracking-wider text-pencil uppercase">
                        {side === "leftArm" ? "Left arm (mitt)" : "Right arm (claw)"}
                      </p>
                      <For each={ARM}>
                        {([key, [min, max]]) => (
                          <Slider
                            label={key}
                            min={min}
                            max={max}
                            step={0.005}
                            value={p()[side][key]}
                            onInput={(v) => {
                              edit((q) => {
                                q[side][key] = v;
                              });
                            }}
                          />
                        )}
                      </For>
                    </>
                  )}
                </For>
              </>
            )}
          </Show>
        </Section>
      </aside>
    </div>
  );
}

function Section(props: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <section class="border-b-hair border-ink px-4 py-3">
      <h2 class="mb-2 text-label font-bold tracking-stamp text-pencil uppercase">{props.title}</h2>
      {props.children}
    </section>
  );
}

function Choice(props: { on: boolean; onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      class={`truncate border-hair border-ink px-1.5 py-1 text-left text-label ${props.on ? "bg-ink text-paper" : "bg-surface text-ink hover:bg-wash"}`}
      onClick={() => {
        props.onClick();
      }}
    >
      {props.children}
    </button>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  onInput: (v: number) => void;
}): JSX.Element {
  return (
    <label class="mt-1.5 grid grid-cols-slider items-center gap-2 text-xs">
      <span class="truncate">{props.label}</span>
      <input
        type="range"
        class="accent-ink"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => {
          props.onInput(e.currentTarget.valueAsNumber);
        }}
      />
      <span class="text-right text-pencil tabular-nums">
        {props.format ? props.format(props.value) : props.value.toFixed(2)}
      </span>
    </label>
  );
}

function Toggle(props: { label: string; value: boolean; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <label class="flex cursor-pointer items-center gap-1.5 text-xs">
      <input
        type="checkbox"
        class="accent-ink"
        checked={props.value}
        onChange={(e) => {
          props.onChange(e.currentTarget.checked);
        }}
      />
      {props.label}
    </label>
  );
}

function Swatch(props: { label: string; value: string; onInput: (v: string) => void }): JSX.Element {
  return (
    <label class="flex flex-col items-center gap-0.5">
      <input
        type="color"
        class="h-6 w-full cursor-pointer border-hair border-ink"
        value={props.value}
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
        }}
      />
      {props.label}
    </label>
  );
}

render(() => <ModelSheet />, document.body);
