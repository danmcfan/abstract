import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { connect, disconnect, pinAt, pinPosition, type Pin } from "../sim/circuit";
import { GRID_HEIGHT, GRID_WIDTH } from "../sim/grid";
import { deleteNode, moveNode, type Game, type NodeID } from "../sim/node";
import { routeWires } from "../sim/route";
import { NodeView } from "./NodeView";
import { current, mutate, testing } from "./state";
import { wirePath } from "./wirePath";

// A clean breadboard drawn in SVG. The viewBox is in grid cells, so one user
// unit is one cell and the drawing stays crisp at any size. Colours and
// strokes live in styles.css.

const BOARD_MARGIN = 1.5;
const VIEW_MARGIN = 1;
// Screen space, in pixels, kept clear for the HUD on wide windows.
const HUD_INSET = { left: 296, right: 24, top: 24, bottom: 84 };

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

function nodeAt(clientX: number, clientY: number): NodeID | null {
  const target = document.elementFromPoint(clientX, clientY)?.closest("[data-node]");
  return target ? Number(target.getAttribute("data-node")) : null;
}

// Changes whenever wires need rerouting.
function layoutKey(game: Game): string {
  const nodes = [...game.nodes.values()].map((n) => `${n.id}@${n.rect.x},${n.rect.y}`).join(";");
  const edges = [...game.edges.values()].map((e) => `${e.id}:${e.from}>${e.to}.${e.toIndex}`).join(";");
  return `${nodes}|${edges}`;
}

export function Board() {
  const [viewBox, setViewBox] = createSignal(fitViewBox());
  const onResize = () => setViewBox(fitViewBox());
  window.addEventListener("resize", onResize);
  onCleanup(() => window.removeEventListener("resize", onResize));

  const [hovered, setHovered] = createSignal<NodeID | null>(null);
  const [hoveredPin, setHoveredPin] = createSignal<Pin | null>(null, {
    equals: (a, b) => a?.node === b?.node && a?.side === b?.side && a?.index === b?.index,
  });
  const [wiring, setWiring] = createSignal<{ pin: Pin; to: { x: number; y: number } } | null>(null);
  let drag: { id: NodeID; offsetX: number; offsetY: number; moved: boolean } | null = null;

  const nodes = createMemo(() => [...current().nodes.values()]);
  const layout = createMemo(() => layoutKey(current()));
  // Rerouting only happens when the layout changes, not when signals do.
  const routing = createMemo(() => (layout(), routeWires(current())));
  const wires = createMemo(() => [...routing().routes].map(([id, route]) => ({ id, route, d: wirePath(route) })));

  const isEdgeHigh = (id: number) => !!current().edges.get(id)?.isHigh;
  const isNetHigh = (net: string) => !!current().nodes.get(Number(net.split(":")[0]))?.isHigh;
  const preview = () => {
    const w = wiring();
    const from = w && current().nodes.get(w.pin.node);
    if (!w || !from) return null;
    const p = pinPosition(from, w.pin.side, w.pin.index);
    return `M ${p.x} ${p.y} L ${w.to.x} ${w.to.y}`;
  };

  const onPointerMove = (event: PointerEvent) => {
    const point = toBoard(event.clientX, event.clientY);
    const pin = pinAt(current(), point.x, point.y);
    setHoveredPin(pin);
    setHovered(pin ? null : nodeAt(event.clientX, event.clientY));
    const w = wiring();
    if (w) setWiring({ ...w, to: point });
    if (drag) {
      const { id, offsetX, offsetY } = drag;
      const node = current().nodes.get(id)!;
      const before = node.rect;
      mutate((g) => moveNode(g, id, point.x - offsetX, point.y - offsetY));
      if (node.rect !== before) drag.moved = true;
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || testing()) return;
    const point = toBoard(event.clientX, event.clientY);
    const pin = pinAt(current(), point.x, point.y);
    if (pin) {
      setWiring({ pin, to: point });
    } else {
      const node = current().nodes.get(nodeAt(event.clientX, event.clientY) ?? -1);
      if (!node) return;
      drag = { id: node.id, offsetX: point.x - node.rect.x, offsetY: point.y - node.rect.y, moved: false };
    }
    svg!.setPointerCapture(event.pointerId);
  };

  const onPointerUp = () => {
    const w = wiring();
    const target = hoveredPin();
    if (w && target) mutate((g) => connect(g, w.pin, target));
    if (drag && !drag.moved) {
      const id = drag.id;
      mutate((g) => {
        const node = g.nodes.get(id);
        if (node?.type === "INPUT") node.isHigh = !node.isHigh;
      });
    }
    setWiring(null);
    drag = null;
  };

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (testing()) return;
    const pin = hoveredPin();
    if (pin?.side === "in") {
      mutate((g) => disconnect(g, pin));
      return;
    }
    const node = current().nodes.get(nodeAt(event.clientX, event.clientY) ?? -1);
    if (node && node.type !== "INPUT" && node.type !== "OUTPUT") mutate((g) => deleteNode(g, node.id));
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
        <pattern id="dots" width="1" height="1" patternUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="0.06" class="dot" />
          <circle cx="1" cy="0" r="0.06" class="dot" />
          <circle cx="0" cy="1" r="0.06" class="dot" />
          <circle cx="1" cy="1" r="0.06" class="dot" />
        </pattern>
        <pattern id="major" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" class="major" />
        </pattern>
        <filter id="lift" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="0.12" stdDeviation="0.12" flood-color="#000" flood-opacity="0.10" />
          <feDropShadow dx="0" dy="0.35" stdDeviation="0.4" flood-color="#000" flood-opacity="0.06" />
        </filter>
        {/* In user space, so perfectly straight wires (a zero-height bounding
            box) aren't clipped away. */}
        <filter id="glow" filterUnits="userSpaceOnUse" x="-5" y="-5" width={GRID_WIDTH + 10} height={GRID_HEIGHT + 10}>
          <feGaussianBlur stdDeviation="0.18" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        class="plate"
        x={-BOARD_MARGIN}
        y={-BOARD_MARGIN}
        width={GRID_WIDTH + BOARD_MARGIN * 2}
        height={GRID_HEIGHT + BOARD_MARGIN * 2}
        rx={1}
      />
      <rect x={0} y={0} width={GRID_WIDTH} height={GRID_HEIGHT} fill="url(#major)" />
      <rect x={0} y={0} width={GRID_WIDTH} height={GRID_HEIGHT} fill="url(#dots)" />
      <rect class="work-area" x={0} y={0} width={GRID_WIDTH} height={GRID_HEIGHT} rx={0.3} />

      <g class="wires">
        <For each={wires()}>
          {(wire) => (
            <g class="wire" classList={{ high: isEdgeHigh(wire.id), unrouted: !wire.route.routed }} data-edge={wire.id}>
              <path class="core" d={wire.d} />
              <path class="flow" d={wire.d} />
            </g>
          )}
        </For>
      </g>
      <g class="junctions">
        <For each={routing().junctions}>
          {(j) => <circle cx={j.point.x} cy={j.point.y} r={0.24} classList={{ high: isNetHigh(j.net) }} />}
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

// A viewBox that fits the whole board into the part of the window the HUD
// leaves free.
function fitViewBox(): string {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const inset = w >= 900 ? HUD_INSET : { left: 0, right: 0, top: 0, bottom: 72 };
  const freeWidth = w - inset.left - inset.right;
  const freeHeight = h - inset.top - inset.bottom;
  const span = Math.max(GRID_WIDTH, GRID_HEIGHT) + (BOARD_MARGIN + VIEW_MARGIN) * 2;
  const unitsPerPixel = span / Math.min(freeWidth, freeHeight);
  // Place the board's centre in the middle of the free area.
  const x = GRID_WIDTH / 2 - (inset.left + freeWidth / 2) * unitsPerPixel;
  const y = GRID_HEIGHT / 2 - (inset.top + freeHeight / 2) * unitsPerPixel;
  return `${x} ${y} ${w * unitsPerPixel} ${h * unitsPerPixel}`;
}
