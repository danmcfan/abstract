import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { pinPosition, type EdgeID, type Pin } from "../sim/circuit";
import { createGestures, type Gestures } from "../sim/gesture";
import { GRID_HEIGHT, GRID_WIDTH } from "../sim/grid";
import { createRouter } from "../sim/route";
import { NodeView } from "./NodeView";
import { current, mutate, testing } from "./state";
import { wirePath } from "./wirePath";

// A drafting sheet drawn in SVG. The viewBox is in grid cells, so one user
// unit is one cell and the drawing stays crisp at any size. Colours and
// strokes live in styles.css.

const BOARD_MARGIN = 1.5;
const VIEW_MARGIN = 1;
const GAP = 16;
// How long ink takes to run along a newly connected wire; matches the ink
// animation in styles.css.
const INK_MS = 200;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const [viewBox, setViewBox] = createSignal(fitViewBox());
  const onResize = () => setViewBox(fitViewBox());
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
  const wires = createMemo(() => [...routing().routes].map(([id, route]) => ({ id, route, d: wirePath(route) })));

  // Wires the player just connected, still being inked over their pencil line.
  const [inking, setInking] = createSignal<ReadonlySet<EdgeID>>(new Set());
  const inkNewWires = (firstNew: EdgeID) => {
    if (still) return;
    const fresh = [...current().edges.keys()].filter((id) => id >= firstNew);
    if (fresh.length === 0) return;
    setInking((ids) => new Set([...ids, ...fresh]));
    setTimeout(() => setInking((ids) => new Set([...ids].filter((id) => !fresh.includes(id)))), INK_MS);
  };

  const isEdgeHigh = (id: number) => !!current().edges.get(id)?.isHigh;
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
  const onPointerUp = (event: PointerEvent) => {
    const firstNew = current().nextEdgeID;
    handle(event, (p) => gestures.up(p));
    inkNewWires(firstNew);
  };
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
        <filter id="glow" filterUnits="userSpaceOnUse" x="-5" y="-5" width={GRID_WIDTH + 10} height={GRID_HEIGHT + 10}>
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
        width={GRID_WIDTH + BOARD_MARGIN * 2}
        height={GRID_HEIGHT + BOARD_MARGIN * 2}
      />
      <rect
        class="plate"
        x={-BOARD_MARGIN}
        y={-BOARD_MARGIN}
        width={GRID_WIDTH + BOARD_MARGIN * 2}
        height={GRID_HEIGHT + BOARD_MARGIN * 2}
      />
      <rect x={0} y={0} width={GRID_WIDTH} height={GRID_HEIGHT} fill="url(#minor)" />
      <rect x={0} y={0} width={GRID_WIDTH} height={GRID_HEIGHT} fill="url(#major)" />
      <rect class="work-area" x={0} y={0} width={GRID_WIDTH} height={GRID_HEIGHT} />

      <g class="wires">
        <For each={wires()}>
          {(wire) => (
            <g
              class="wire"
              classList={{ high: isEdgeHigh(wire.id), unrouted: !wire.route.routed, inking: inking().has(wire.id) }}
              data-edge={wire.id}
            >
              <Show when={inking().has(wire.id)}>
                <path class="pencil" d={wire.d} />
              </Show>
              {/* A unit path length lets the ink animation run any wire in the same time. */}
              <path class="core" d={wire.d} pathLength={inking().has(wire.id) ? 1 : undefined} />
              <path class="flow" d={wire.d} />
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

function snapshot(g: Gestures): Pick<Gestures, "hoveredNode" | "hoveredPin" | "preview"> {
  return { hoveredNode: g.hoveredNode, hoveredPin: g.hoveredPin, preview: g.preview };
}

// The HUD's level panel and parts bin, which the board fits around.
const HUD_IDS = ["level-panel", "parts-bin"];

// A viewBox that fits the whole board into the part of the window the HUD
// leaves free: right of the level panel on wide windows, below it on narrow
// ones, and above the parts bin.
function fitViewBox(): string {
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
  const span = Math.max(GRID_WIDTH, GRID_HEIGHT) + (BOARD_MARGIN + VIEW_MARGIN) * 2;
  const unitsPerPixel = span / Math.min(freeWidth, freeHeight);
  // Place the board's centre in the middle of the free area.
  const x = GRID_WIDTH / 2 - (inset.left + freeWidth / 2) * unitsPerPixel;
  const y = GRID_HEIGHT / 2 - (inset.top + freeHeight / 2) * unitsPerPixel;
  return `${x} ${y} ${w * unitsPerPixel} ${h * unitsPerPixel}`;
}
