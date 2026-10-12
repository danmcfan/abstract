import { For, Show, createMemo } from "solid-js";
import { pinPosition, pins, type Pin } from "../sim/circuit";
import type { Node } from "../sim/node";
import { glyph } from "./glyph";
import { current } from "./state";

const samePin = (a: Pin | null, b: Pin) => !!a && a.node === b.node && a.side === b.side && a.index === b.index;

// Gates are inked schematic symbols. Inputs are knife switches and the
// output is a lamp, each on a small white panel. Drawn in node-local cells.
export function NodeView(props: { node: Node; hovered: boolean; hoveredPin: Pin | null }) {
  // moveNode replaces rect, so these only change when the node does.
  const rect = createMemo(() => (current(), props.node.rect));
  const isHigh = createMemo(() => (current(), props.node.isHigh));
  const { width, height } = props.node.rect;
  const type = props.node.type;

  return (
    <g
      class={`node ${type.toLowerCase()}`}
      classList={{ high: isHigh(), hovered: props.hovered }}
      data-node={props.node.id}
      data-type={type}
      transform={`translate(${rect().x} ${rect().y})`}
    >
      <rect class="hit" x={0} y={0} width={width} height={height} />
      <rect class="halo" x={0.1} y={0.1} width={width - 0.2} height={height - 0.2} rx={0.3} />
      <Show when={type === "INPUT"}>
        <KnifeSwitch name={props.node.label} on={isHigh()} width={width} height={height} />
      </Show>
      <Show when={type === "OUTPUT"}>
        <Lamp name={props.node.label} width={width} height={height} />
      </Show>
      <Show when={type !== "INPUT" && type !== "OUTPUT"}>
        <Gate node={props.node} />
      </Show>
      <For each={pins(props.node)}>
        {(pin) => {
          // Offsets within the node, worked out once: the attribute bindings
          // below rerun on hover, after the node may have moved.
          const p = pinPosition(props.node, pin.side, pin.index);
          const cx = p.x - props.node.rect.x;
          const cy = p.y - props.node.rect.y;
          return (
            <circle
              class="pin"
              classList={{ hovered: samePin(props.hoveredPin, pin) }}
              cx={cx}
              cy={cy}
              r={0.26}
              data-pin={`${pin.node}:${pin.side}:${pin.index}`}
            />
          );
        }}
      </For>
    </g>
  );
}

function Gate(props: { node: Node }) {
  const g = glyph(props.node.type);
  const signal = (i: number) => (current(), !!props.node.signals[i]);
  return (
    <>
      <path class="lead in" d={g.inLeads} />
      <For each={g.outLeads}>{(d, i) => <path class="lead out" classList={{ high: signal(i()) }} d={d} />}</For>
      <Show when={g.back}>{(d) => <path class="body-line" d={d()} />}</Show>
      <path class="body" d={g.body} />
      <Show when={g.bubble}>{(b) => <circle class="bubble" cx={b().cx} cy={b().cy} r={b().r} />}</Show>
      <text class="gate-label" x={g.label.x} y={g.label.y} style={{ "font-size": `${g.label.size}px` }}>
        {props.node.type}
      </text>
      <For each={g.pinLabels}>
        {(p) => (
          <text class="pin-label" x={p.x} y={p.y} style={{ "text-anchor": p.anchor }}>
            {p.text}
          </text>
        )}
      </For>
    </>
  );
}

// A knife switch: the lever lifts open when off and closes onto its contact
// when on.
function KnifeSwitch(props: { name: string; on: boolean; width: number; height: number }) {
  const y = props.height / 2;
  return (
    <>
      <rect class="panel" x={0.35} y={0.35} width={props.width - 0.7} height={props.height - 0.7} rx={0.25} />
      <text class="terminal-label" x={2} y={props.height - 0.78}>
        {props.name}
      </text>
      <path class="lead out" classList={{ high: props.on }} d={`M 3 ${y} H ${props.width}`} />
      <circle class="contact" cx={3} cy={y} r={0.2} />
      <line class="lever" x1={1.05} y1={y} x2={2.95} y2={y} />
      <circle class="pivot" cx={1.05} cy={y} r={0.24} />
    </>
  );
}

// A lamp: the schematic bulb, a circle with a cross, lit when on.
function Lamp(props: { name: string; width: number; height: number }) {
  const x = props.width / 2 + 0.2;
  const y = props.height / 2;
  const r = 0.75;
  const d = r * 0.7;
  return (
    <>
      <rect class="panel" x={0.35} y={0.35} width={props.width - 0.7} height={props.height - 0.7} rx={0.25} />
      <text class="terminal-label small" x={x} y={props.height - 0.72}>
        {props.name}
      </text>
      <path class="lead in" d={`M 0 ${y} H ${x - r}`} />
      <circle class="bulb" cx={x} cy={y} r={r} />
      <path class="filament" d={`M ${x - d} ${y - d} L ${x + d} ${y + d} M ${x + d} ${y - d} L ${x - d} ${y + d}`} />
    </>
  );
}
