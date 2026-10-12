import { Show, createMemo } from "solid-js";
import type { NodeType } from "../sim/node";
import { glyph } from "./glyph";

// A gate's schematic symbol at icon size, inked in the current text colour.
// The width is how many signals a split or join carries.
export function GateIcon(props: { type: NodeType; width?: number; class?: string }) {
  const g = createMemo(() => glyph(props.type, props.width));
  return (
    <svg
      viewBox={`-0.2 0 ${g().width + 0.4} ${g().height}`}
      class={props.class}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="0.24"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={[...g().inLeads, ...g().outLeads].join(" ")} />
      <Show when={g().back}>{(d) => <path d={d()} />}</Show>
      <path d={g().body} fill="var(--color-surface)" />
      <Show when={g().bubble}>{(b) => <circle cx={b().cx} cy={b().cy} r={b().r} fill="var(--color-surface)" />}</Show>
    </svg>
  );
}
