import { For, Show, batch, createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { render } from "solid-js/web";
import type { Arm, Pose } from "../robot/clips";
import { EXPRESSIONS, type Expression } from "../robot/expression";
import { createViewer, gameLighting, type Lighting, type View, type Viewer } from "../robot/viewer";
import "../styles.css";

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

// Backgrounds behind the canvas, and the solid colour each one snapshots on.
const BACKDROPS: Record<string, { style: JSX.CSSProperties; color: string }> = {
  paper: { style: {}, color: "#f5f8fc" },
  white: { style: { background: "#ffffff" }, color: "#ffffff" },
  blueprint: {
    style: {
      "background-color": "#123a7c",
      "background-image":
        "linear-gradient(rgba(234,242,255,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(234,242,255,.14) 1px, transparent 1px)",
      "background-size": "24px 24px",
    },
    color: "#123a7c",
  },
  void: { style: { background: "#0a2150" }, color: "#0a2150" },
  grey: { style: { background: "#8a94a6" }, color: "#8a94a6" },
  black: { style: { background: "#111111" }, color: "#111111" },
};

const VIEWS: View[] = ["game", "close", "front", "side", "back", "top", "low"];

type Range = [min: number, max: number];
const HALF = Math.PI / 2;
const BODY: [keyof Pose, Range][] = [
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
  const value = params.get(key) as T;
  return options.includes(value) ? value : fallback;
};

function ModelSheet() {
  let host!: HTMLDivElement;
  let faceSlot!: HTMLDivElement;
  let viewer: Viewer | undefined;

  const [expression, setExpression] = createSignal<Expression>(pick("e", EXPRESSIONS, "idle"));
  const [talking, setTalking] = createSignal(params.has("talk"));
  const [playing, setPlaying] = createSignal(true);
  const [rate, setRate] = createSignal(1);
  const [time, setTime] = createSignal(0);
  const [view, setView] = createSignal<View>(pick("view", VIEWS, "game"));
  const [spin, setSpin] = createSignal(0);
  const [preset, setPreset] = createSignal(pick("light", Object.keys(LIGHTS), "game"));
  const [lighting, setLighting] = createSignal<Lighting>(LIGHTS[preset()]!);
  const [backdrop, setBackdrop] = createSignal(pick("bg", Object.keys(BACKDROPS), "paper"));
  const [outlines, setOutlines] = createSignal(true);
  const [shadows, setShadows] = createSignal(true);
  const [grid, setGrid] = createSignal(false);
  const [held, setHeld] = createSignal<Pose | null>(null);
  const [live, setLive] = createSignal<Pose>();

  onMount(() => {
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

  const choosePreset = (name: string) => {
    batch(() => {
      setPreset(name);
      setLighting(LIGHTS[name]!);
    });
  };
  const tweak = (change: Partial<Lighting>) => {
    batch(() => {
      setPreset("custom");
      setLighting((l) => ({ ...l, ...change }));
    });
  };

  // Touching a pose slider freezes the robot in its current pose and edits that.
  const shown = () => held() ?? live();
  const edit = (change: (p: Pose) => void) => {
    const p = structuredClone(held() ?? viewer!.pose());
    change(p);
    setHeld(p);
  };
  const release = () => setHeld(null);
  const copyPose = async () =>
    navigator.clipboard.writeText(JSON.stringify(shown(), (_k, v) => (typeof v === "number" ? +v.toFixed(3) : v), 2));

  const snapshot = () => {
    const a = document.createElement("a");
    a.href = viewer!.snapshot(BACKDROPS[backdrop()]!.color);
    a.download = `bitbox-${expression()}-${preset()}-${view()}.png`;
    a.click();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const n = Number(event.key);
    if (n >= 1 && n <= EXPRESSIONS.length) setExpression(EXPRESSIONS[n - 1]!);
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
    <div class="fixed inset-0 grid grid-rows-[minmax(300px,1fr)_minmax(0,45%)] text-ink-deep md:grid-cols-[1fr_380px] md:grid-rows-1">
      <div class="relative min-h-0" style={BACKDROPS[backdrop()]!.style}>
        <div ref={host} id="stage" class="absolute inset-0" />
        <div
          class="pointer-events-none absolute top-3 left-4 text-xs"
          classList={{ "text-paper": ["blueprint", "void", "black"].includes(backdrop()) }}
        >
          <p class="font-bold tracking-[0.14em] uppercase">Dwg LOA-B01 · Bitbox model sheet</p>
          <p class="mt-1 opacity-70">Drag to orbit · scroll to zoom · right-drag to pan</p>
          <p class="opacity-70">1–8 expression · space pause · T talk · R restart</p>
        </div>
      </div>

      <aside class="min-h-0 overflow-y-auto border-t-2 border-ink bg-surface md:border-t-0 md:border-l-2">
        <Section title="Expression">
          <div class="grid grid-cols-4 gap-1.5">
            <For each={EXPRESSIONS}>
              {(e, i) => (
                <Choice on={expression() === e} onClick={() => setExpression(e)}>
                  <span class="opacity-50">{i() + 1}</span> {e}
                </Choice>
              )}
            </For>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button class="w-20 btn btn-sm" onClick={() => setPlaying((p) => !p)}>
              {playing() ? "Pause" : "Play"}
            </button>
            <button class="btn btn-sm btn-ghost" onClick={() => viewer?.restart()}>
              Restart
            </button>
            <Toggle label="Talking" value={talking()} onChange={setTalking} />
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
            onInput={setRate}
          />
        </Section>

        <Section title="Camera">
          <div class="grid grid-cols-4 gap-1.5">
            <For each={VIEWS}>
              {(v) => (
                <Choice on={view() === v} onClick={() => (setView(v), viewer?.view(v))}>
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
            onInput={setSpin}
          />
          <button class="btn btn-sm btn-ghost" onClick={() => (setSpin(0), viewer?.unspin())}>
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
          <div class="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
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
                <Choice on={backdrop() === name} onClick={() => setBackdrop(name)}>
                  <span
                    class="mr-1 inline-block size-2.5 border border-ink align-[-1px]"
                    style={{ background: BACKDROPS[name]!.color }}
                  />
                  {name}
                </Choice>
              )}
            </For>
          </div>
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Toggle label="Outlines" value={outlines()} onChange={setOutlines} />
            <Toggle label="Shadows" value={shadows()} onChange={setShadows} />
            <Toggle label="Floor grid" value={grid()} onChange={setGrid} />
          </div>
          <button class="mt-3 btn btn-sm" onClick={snapshot}>
            Save PNG
          </button>
        </Section>

        <Section title="Screen">
          <div ref={faceSlot} />
        </Section>

        <Section title="Pose">
          <p class="mb-2 text-[11px] text-pencil">
            <Show when={held()} fallback="Following the clip. Drag a slider to freeze and pose by hand.">
              Posed by hand.
            </Show>
          </p>
          <div class="mb-2 flex gap-2">
            <button class="btn btn-sm" disabled={!held()} onClick={release}>
              Back to clip
            </button>
            <button class="btn btn-sm btn-ghost" onClick={copyPose}>
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
                      value={p()[key] as number}
                      onInput={(v) => {
                        edit((q) => ((q[key] as number) = v));
                      }}
                    />
                  )}
                </For>
                <For each={["leftArm", "rightArm"] as const}>
                  {(side) => (
                    <>
                      <p class="mt-3 text-[11px] font-bold tracking-wider text-pencil uppercase">
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
                              edit((q) => (q[side][key] = v));
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

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="border-b-[1.5px] border-ink px-4 py-3">
      <h2 class="mb-2 text-[11px] font-bold tracking-[0.14em] text-pencil uppercase">{props.title}</h2>
      {props.children}
    </section>
  );
}

function Choice(props: { on: boolean; onClick: () => void; children: JSX.Element }) {
  return (
    <button
      class="truncate border-[1.5px] border-ink px-1.5 py-1 text-left text-[11px]"
      classList={{ "bg-ink text-paper": props.on, "bg-surface text-ink hover:bg-wash": !props.on }}
      onClick={props.onClick}
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
}) {
  return (
    <label class="mt-1.5 grid grid-cols-[88px_1fr_56px] items-center gap-2 text-xs">
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

function Toggle(props: { label: string; value: boolean; onChange: (on: boolean) => void }) {
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

function Swatch(props: { label: string; value: string; onInput: (v: string) => void }) {
  return (
    <label class="flex flex-col items-center gap-0.5">
      <input
        type="color"
        class="h-6 w-full cursor-pointer border-[1.5px] border-ink"
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
