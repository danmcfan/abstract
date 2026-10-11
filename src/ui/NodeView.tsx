import { For, Show, createMemo } from "solid-js";
import { pinPosition, pins, type Pin } from "../sim/circuit";
import type { Node, NodeType } from "../sim/node";
import { current } from "./state";

export const GATE_ACCENTS: Record<NodeType, string> = {
  INPUT: "#2997ff",
  OUTPUT: "#2997ff",
  NAND: "#0a84ff",
  NOT: "#ff9f0a",
  AND: "#30d158",
  OR: "#bf5af2",
  NOR: "#ff375f",
  XOR: "#64d2ff",
  XNOR: "#ffd60a",
};

const samePin = (a: Pin | null, b: Pin) => !!a && a.node === b.node && a.side === b.side && a.index === b.index;

// Gates are white cards with a coloured accent bar and a status light.
// Terminals are cards with a round lamp. Drawn in node-local cells.
export function NodeView(props: { node: Node; hovered: boolean; hoveredPin: Pin | null }) {
  // moveNode replaces rect, so these only change when the node does.
  const rect = createMemo(() => (current(), props.node.rect));
  const isHigh = createMemo(() => (current(), props.node.isHigh));
  const { width, height } = props.node.rect;
  const type = props.node.type;
  const isTerminal = type === "INPUT" || type === "OUTPUT";

  return (
    <g
      class={`node ${type.toLowerCase()}`}
      classList={{ high: isHigh(), hovered: props.hovered }}
      data-node={props.node.id}
      data-type={type}
      style={{ "--accent": GATE_ACCENTS[type] }}
      transform={`translate(${rect().x} ${rect().y})`}
    >
      <rect class="card" x={0.25} y={0.25} width={width - 0.5} height={height - 0.5} rx={0.55} />
      <Show
        when={isTerminal}
        fallback={
          <>
            <rect class="accent" x={0.9} y={height - 0.85} width={width - 1.8} height={0.18} rx={0.09} />
            <circle class="led" cx={width - 0.85} cy={0.85} r={0.17} />
            <text class="gate-label" x={width / 2} y={height / 2 - 0.1}>
              {type}
            </text>
          </>
        }
      >
        <circle class="bezel" cx={width / 2} cy={1.65} r={0.95} />
        <circle class="lamp" cx={width / 2} cy={1.65} r={0.7} />
        <text class="terminal-label" x={width / 2} y={3.2}>
          {type === "OUTPUT" ? "OUT" : props.node.label === "BETA" ? "B" : "A"}
        </text>
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
              r={0.3}
              data-pin={`${pin.node}:${pin.side}:${pin.index}`}
            />
          );
        }}
      </For>
    </g>
  );
}
