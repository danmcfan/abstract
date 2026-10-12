import { For, Show, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";
import { pinPosition, widthOf, type Pin } from "../sim/circuit";
import { createGestures, type Gestures } from "../sim/gesture";
import type { Size } from "../sim/grid";
import { createRouter } from "../sim/route";
import { NodeView } from "./NodeView";
import { current, mutate, testing } from "./state";
import { wirePath } from "./wirePath";

// A drafting sheet drawn in SVG. The viewBox is in grid cells, so one user
// unit is one cell and the drawing stays crisp at any size, and a level's
// larger board scales down to fit. Colours and strokes live in styles.css.

const BOARD_MARGIN = 1.5;
const VIEW_MARGIN = 1;
const GAP = 16;

let svg: SVGSVGElement | undefined;

// Board-space point to client coordinates.
export function toScreen(x: number, y: number): { x: number; y: number } {
  const p = new DOMPoint(x, y).matrixTransform(svg!.getScreenCTM()!);
  return { x: p.x, y: p.y };
}

function toBoard(clientX: number, clientY: number): { x: number; y: number } {
  const p = new DOMPoint(clientX, clientY).matrixTransform(svg!.getScreenCTM()!.inverse());
  return { x: p.x, y: p.y };
}

export function Board() {
  const grid = createMemo(() => current().grid, undefined, { equals: (a, b) => a.width === b.width && a.height === b.height });
  const [resized, setResized] = createSignal(0);
  const viewBox = createMemo(() => (resized(), fitViewBox(grid())));
  const onResize = () => setResized((n) => n + 1);
  window.addEventListener("resize", onResize);
  // The HUD changes size with the level, so fit around it whenever it does.
  const hud = new ResizeObserver(onResize);
  onMount(() => {
    for (const id of HUD_IDS) {
      const el = document.getElementById(id);
      if (el) hud.observe(el);
    }
  });
  onCleanup(() => {
    window.removeEventListener("resize", onResize);
    hud.disconnect();
  });

  const gestures = createGestures({ game: current, edit: mutate, locked: testing });
  // The gesture module is plain state; mirror it into signals after each event.
  const [view, setView] = createSignal(snapshot(gestures), { equals: false });
  const hovered = () => view().hoveredNode;
  const hoveredPin = () => view().hoveredPin;
  const wiring = () => view().preview;
  const handle = (event: MouseEvent, run: (p: { x: number; y: number }) => void) => {
    run(toBoard(event.clientX, event.clientY));
    setView(snapshot(gestures));
  };

  const nodes = createMemo(() => [...current().nodes.values()]);
  // Rerouting only happens when the layout changes, not when signals do.
  const route = createRouter();
  const routing = createMemo(() => route(current()));
  // A wire's width only changes along with the layout, so reading the board
  // here mustn't rerun this on every signal change.
  const wires = createMemo(() =>
    [...routing().routes].map(([id, route]) => {
      const width = untrack(() => {
        const edge = current().edges.get(id)!;
        return widthOf(current().nodes.get(edge.from)!, { side: "out", index: edge.fromIndex });
      });
      return { id, route, d: wirePath(route), width };
    }),
  );

  const isEdgeHigh = (id: number) => !!current().edges.get(id)?.value;
  const isPinHigh = (pin: Pin) => !!current().nodes.get(pin.node)?.signals[pin.index];
  const preview = () => {
    const w = wiring();
    const from = w && current().nodes.get(w.from.node);
    if (!w || !from) return null;
    const p = pinPosition(from, w.from.side, w.from.index);
    return `M ${p.x} ${p.y} L ${w.to.x} ${w.to.y}`;
  };

  const onPointerMove = (event: PointerEvent) => handle(event, (p) => gestures.move(p));
  const onPointerDown = (event: PointerEvent) => {
    handle(event, (p) => gestures.down(p, event.button));
    if (gestures.preview || gestures.dragging) svg!.setPointerCapture(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent) => handle(event, (p) => gestures.up(p));
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    handle(event, (p) => gestures.contextMenu(p));
  };

  return (
    <svg
      id="board"
      ref={svg}
      viewBox={viewBox()}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
    >
      <defs>
        <pattern id="minor" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" class="minor" />
        </pattern>
        <pattern id="major" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" class="major" />
        </pattern>
        {/* A cyan glow under live wires and lit lamps. In user space, so
            perfectly straight wires (a zero-height bounding box) aren't
            clipped away. */}
        <filter id="glow" filterUnits="userSpaceOnUse" x="-5" y="-5" width={grid().width + 10} height={grid().height + 10}>
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.22" result="blur" />
          <feFlood flood-color="#7FD0FF" flood-opacity="0.9" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        class="plate-shadow"
        x={-BOARD_MARGIN + 0.5}
        y={-BOARD_MARGIN + 0.5}
        width={grid().width + BOARD_MARGIN * 2}
        height={grid().height + BOARD_MARGIN * 2}
      />
      <rect
        class="plate"
        x={-BOARD_MARGIN}
        y={-BOARD_MARGIN}
        width={grid().width + BOARD_MARGIN * 2}
        height={grid().height + BOARD_MARGIN * 2}
      />
      <rect x={0} y={0} width={grid().width} height={grid().height} fill="url(#minor)" />
      <rect x={0} y={0} width={grid().width} height={grid().height} fill="url(#major)" />
      <rect class="work-area" x={0} y={0} width={grid().width} height={grid().height} />

      <g class="wires">
        <For each={wires()}>
          {(wire) => (
            <g class="wire" classList={{ high: isEdgeHigh(wire.id), unrouted: !wire.route.routed, bus: wire.width > 1 }} data-edge={wire.id}>
              <path class="core" d={wire.d} />
              <path class="flow" d={wire.d} />
              <Show when={wire.width > 1}>
                <BusMark at={wire.route.points[0]!} width={wire.width} />
              </Show>
            </g>
          )}
        </For>
      </g>
      <g class="junctions">
        <For each={routing().junctions}>
          {(j) => <circle cx={j.point.x} cy={j.point.y} r={0.24} classList={{ high: isPinHigh(j.source) }} />}
        </For>
      </g>
      <g class="nodes">
        <For each={nodes()}>
          {(node) => (
            <NodeView
              node={node}
              hovered={hovered() === node.id}
              hoveredPin={hoveredPin()?.node === node.id ? hoveredPin() : null}
            />
          )}
        </For>
      </g>
      <Show when={preview()}>{(d) => <path class="preview" d={d()} />}</Show>
    </svg>
  );
}

// A bus is marked with its width the schematic way: a short slash across it
// just after it leaves its pin, with the width beside it.
function BusMark(props: { at: { x: number; y: number }; width: number }) {
  const x = props.at.x + 0.8;
  const y = props.at.y;
  return (
    <>
      <path class="bus-mark" d={`M ${x - 0.3} ${y + 0.4} L ${x + 0.3} ${y - 0.4}`} />
      <text class="bus-width" x={x + 0.35} y={y - 0.7}>
        {props.width}
      </text>
    </>
  );
}

function snapshot(g: Gestures): Pick<Gestures, "hoveredNode" | "hoveredPin" | "preview"> {
  return { hoveredNode: g.hoveredNode, hoveredPin: g.hoveredPin, preview: g.preview };
}

// The HUD's level panel and parts bin, which the board fits around.
const HUD_IDS = ["level-panel", "parts-bin"];

// A viewBox that fits the whole board into the part of the window the HUD
// leaves free: right of the level panel on wide windows, below it on narrow
// ones, and above the parts bin.
function fitViewBox(grid: Size): string {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const panel = document.getElementById("level-panel")?.getBoundingClientRect();
  const bin = document.getElementById("parts-bin")?.getBoundingClientRect();
  const wide = w >= 900;
  const inset = {
    left: wide && panel ? panel.right + GAP : 0,
    right: wide ? GAP : 0,
    top: !wide && panel ? panel.bottom : GAP,
    bottom: bin ? h - bin.top + 4 : GAP,
  };
  const freeWidth = w - inset.left - inset.right;
  const freeHeight = h - inset.top - inset.bottom;
  const span = Math.max(grid.width, grid.height) + (BOARD_MARGIN + VIEW_MARGIN) * 2;
  const unitsPerPixel = span / Math.min(freeWidth, freeHeight);
  // Place the board's centre in the middle of the free area.
  const x = grid.width / 2 - (inset.left + freeWidth / 2) * unitsPerPixel;
  const y = grid.height / 2 - (inset.top + freeHeight / 2) * unitsPerPixel;
  return `${x} ${y} ${w * unitsPerPixel} ${h * unitsPerPixel}`;
}
