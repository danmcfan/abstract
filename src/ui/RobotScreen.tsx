import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { Expression } from "../robot/expression";
import type { RobotStage, Shot } from "../robot/stage";

// A little window with the robot in it, live in 3D. Three.js loads the first
// time one opens; until then, or without WebGL, it shows the robot's sketch
// from the vision board.
export function RobotScreen(props: { expression: Expression; talking?: boolean; shot?: Shot; class?: string }) {
  let host!: HTMLDivElement;
  const [stage, setStage] = createSignal<RobotStage>();
  let gone = false;

  onMount(() => {
    import("../robot/stage")
      .then(({ robotStage }) => {
        if (gone) return;
        const s = robotStage();
        s.mount(host, props.shot);
        setStage(s);
      })
      .catch(() => {});
  });
  createEffect(() => stage()?.express(props.expression));
  createEffect(() => stage()?.talk(!!props.talking));
  onCleanup(() => {
    gone = true;
    stage()?.unmount(host);
  });

  return (
    <div class={`relative overflow-hidden ${props.class ?? ""}`}>
      {/* The stage's canvas goes in here, apart from anything Solid manages. */}
      <div ref={host} class="absolute inset-0" />
      <Show when={!stage()}>
        <Sketch />
      </Show>
    </div>
  );
}

// Concept B, the crate, as drawn on the vision board.
function Sketch() {
  return (
    <svg
      viewBox="20 0 160 240"
      class="absolute inset-0 m-auto h-[88%]"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <g class="text-ink" fill="var(--color-surface)">
        <rect x="48" y="196" width="104" height="30" rx="15" />
        <circle cx="66" cy="211" r="8" />
        <circle cx="100" cy="211" r="8" />
        <circle cx="134" cy="211" r="8" />
        <path d="M100 46 L94 40 L106 34 L94 28 L106 22 L100 18" fill="none" />
        <circle cx="100" cy="14" r="5" fill="var(--color-glow)" stroke-width="2" />
        <rect x="60" y="46" width="80" height="62" rx="8" />
        <rect x="70" y="56" width="60" height="42" rx="10" fill="var(--color-void)" />
        <rect x="82" y="70" width="11" height="11" rx="2" fill="var(--color-glow)" stroke="none" />
        <rect x="107" y="70" width="11" height="11" rx="2" fill="var(--color-glow)" stroke="none" />
        <rect x="92" y="108" width="16" height="12" />
        <rect x="56" y="120" width="88" height="76" rx="3" />
        <path d="M78 140 H122 M78 148 H122 M78 156 H122" stroke-width="2" />
        <path d="M144 140 L168 150 L170 170 M164 176 L170 170 L178 174" fill="none" />
        <path d="M56 142 L38 160 L42 176" fill="none" />
      </g>
    </svg>
  );
}
