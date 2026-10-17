import { For, Show, createMemo, untrack, type JSX } from "solid-js";
import { edgeInto, nodeKind, pinPosition, pins, widthOf, type Pin } from "../sim/circuit";
import { bitCell, type Node } from "../sim/node";
import { glyph } from "./glyph";
import { current, session } from "./state";

const samePin = (a: Pin | null, b: Pin): boolean =>
  a !== null && a.node === b.node && a.side === b.side && a.index === b.index;

// Gates are inked schematic symbols. Inputs are knife switches and the
// output is a lamp, each on a small white panel; a bus terminal is a row of
// bit switches or lamps with its value written beside them. Drawn in
// node-local cells.
export function NodeView(props: { node: Node; hovered: boolean; hoveredPin: Pin | null }): JSX.Element {
  // moveNode replaces rect, so these only change when the node does.
  const rect = createMemo(() => (current(), props.node.rect));
  const isHigh = createMemo(() => (current(), props.node.isHigh));
  // A node keeps its type and size, so they're read once.
  const { width, height } = untrack(() => props.node.rect);
  const type = untrack(() => props.node.type);
  const { look } = untrack(() => nodeKind(current(), props.node));

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
      <Show when={look.shape === "switch" && props.node.width === 1}>
        <KnifeSwitch name={props.node.label} on={isHigh()} width={width} height={height} />
      </Show>
      <Show when={look.shape === "lamp" && props.node.width === 1}>
        <Lamp name={props.node.label} width={width} height={height} />
      </Show>
      <Show when={(look.shape === "switch" || look.shape === "lamp") && props.node.width > 1}>
        <BitRow node={props.node} input={look.shape === "switch"} />
      </Show>
      <Show when={look.shape !== "switch" && look.shape !== "lamp"}>
        <Gate node={props.node} />
      </Show>
      <For each={pins(current(), props.node)}>
        {(pin) => {
          // Offsets within the node, worked out once: the attribute bindings
          // below rerun on hover, after the node may have moved.
          const p = pinPosition(current(), props.node, pin.side, pin.index);
          const cx = p.x - props.node.rect.x;
          const cy = p.y - props.node.rect.y;
          return (
            <circle
              class="pin"
              classList={{
                hovered: samePin(props.hoveredPin, pin),
                bus: widthOf(current(), props.node, pin) > 1,
                hint: session().hints.some((hint) => samePin(hint, pin)),
              }}
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

function Gate(props: { node: Node }): JSX.Element {
  // A gate's type and width never change, so its symbol is drawn once.
  const g = untrack(() => glyph(nodeKind(current(), props.node), props.node.width));
  const signal = (i: number): boolean => (current(), (props.node.signals[i] ?? 0) !== 0);
  const bus = (side: Pin["side"], index: number): boolean => widthOf(current(), props.node, { side, index }) > 1;
  return (
    <>
      <For each={g.inLeads}>{(d, i) => <path class="lead" classList={{ bus: bus("in", i()) }} d={d} />}</For>
      <For each={g.outLeads}>
        {(d, i) => <path class="lead out" classList={{ high: signal(i()), bus: bus("out", i()) }} d={d} />}
      </For>
      <Show when={g.back}>{(d) => <path class="body-line" d={d()} />}</Show>
      <path class="body" d={g.body} />
      <Show when={g.bubble}>{(b) => <circle class="bubble" cx={b().cx} cy={b().cy} r={b().r} />}</Show>
      <Show when={g.label}>
        {(label) => (
          <text class="gate-label" x={label().x} y={label().y} style={{ "--label-size": `${label().size}px` }}>
            {props.node.type}
          </text>
        )}
      </Show>
      <For each={g.pinLabels}>
        {(p) => (
          <text class={p.anchor === "start" ? "pin-label start" : "pin-label end"} x={p.x} y={p.y}>
            {p.text}
          </text>
        )}
      </For>
    </>
  );
}

// A knife switch: the lever lifts open when off and closes onto its contact
// when on.
function KnifeSwitch(props: { name: string; on: boolean; width: number; height: number }): JSX.Element {
  const y = (): number => props.height / 2;
  return (
    <>
      <rect class="panel" x={0.35} y={0.35} width={props.width - 0.7} height={props.height - 0.7} rx={0.25} />
      <text classList={{ "terminal-label": true, small: props.name.length > 1 }} x={2} y={props.height - 0.78}>
        {props.name}
      </text>
      <path class="lead out" classList={{ high: props.on }} d={`M 3 ${y()} H ${props.width}`} />
      <circle class="contact" cx={3} cy={y()} r={0.2} />
      <line class="lever" x1={1.05} y1={y()} x2={2.95} y2={y()} />
      <circle class="pivot" cx={1.05} cy={y()} r={0.24} />
    </>
  );
}

// A lamp: the schematic bulb, a circle with a cross, lit when on.
function Lamp(props: { name: string; width: number; height: number }): JSX.Element {
  const x = (): number => props.width / 2 + 0.2;
  const y = (): number => props.height / 2;
  const r = 0.75;
  const d = r * 0.7;
  return (
    <>
      <rect class="panel" x={0.35} y={0.35} width={props.width - 0.7} height={props.height - 0.7} rx={0.25} />
      <text class="terminal-label small" x={x()} y={props.height - 0.72}>
        {props.name}
      </text>
      <path class="lead" d={`M 0 ${y()} H ${x() - r}`} />
      <circle class="bulb" cx={x()} cy={y()} r={r} />
      <path
        class="filament"
        d={`M ${x() - d} ${y() - d} L ${x() + d} ${y() + d} M ${x() + d} ${y() - d} L ${x() - d} ${y() + d}`}
      />
    </>
  );
}

// A bus terminal: a row of bit switches (an input) or lamps (an output), high
// bit first, with the value they make as a number after them. An input's
// value is its switches; an output shows the value on its wire.
function BitRow(props: { node: Node; input: boolean }): JSX.Element {
  // A terminal keeps its width, kind and size, so they're read once.
  const { width: bits } = untrack(() => props.node);
  const { width, height } = untrack(() => props.node.rect);
  const y = height / 2;
  const isInput = untrack(() => props.input);
  const value = (): number => {
    current();
    return isInput ? (props.node.signals[0] ?? 0) : (edgeInto(current(), props.node.id, 0)?.value ?? 0);
  };
  const numberX = bitCell(bits, 0) + 1 + 1.5;
  return (
    <>
      <rect class="panel" x={0.35} y={0.35} width={width - 0.7} height={height - 0.7} rx={0.25} />
      <text class="terminal-label small" x={1 + bits / 2} y={height - 0.72}>
        {props.node.label}
      </text>
      <path
        class={isInput ? "lead bus out" : "lead bus"}
        classList={{ high: value() !== 0 }}
        d={isInput ? `M ${width - 1} ${y} H ${width}` : `M 0 ${y} H 1`}
      />
      <For each={Array.from({ length: bits }, (_, i) => bits - 1 - i)}>
        {(bit) => {
          const on = (): boolean => ((value() >> bit) & 1) === 1;
          const x = bitCell(bits, bit) + 0.5;
          return isInput ? (
            <rect
              class="bit"
              classList={{ high: on() }}
              x={x - 0.36}
              y={y - 0.36}
              width={0.72}
              height={0.72}
              rx={0.12}
            />
          ) : (
            <circle class="bit lamp" classList={{ high: on() }} cx={x} cy={y} r={0.36} />
          );
        }}
      </For>
      <text class="bus-value" x={numberX} y={y}>
        {value()}
      </text>
    </>
  );
}
