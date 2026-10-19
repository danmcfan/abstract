import { For, Show, createMemo, createSignal, onCleanup, onMount, untrack, type JSX } from "solid-js";
import { landing, nodeKind, pinPosition, widthOf, type EdgeID, type Pin } from "../sim/circuit";
import { createGestures, type Gestures } from "../sim/gesture";
import type { Size } from "../sim/grid";
import { createRouter } from "../sim/route";
import { partName } from "./GateIcon";
import { NodeView } from "./NodeView";
import { sound } from "./sound";
import { binDrag, current, mutate, session } from "./state";
import { wirePath } from "./wirePath";

// A drafting sheet drawn in SVG. The viewBox is in grid cells, so one user
// unit is one cell and the drawing stays crisp at any size, and a level's
// larger board scales down to fit. Colours and strokes live in styles.css.

const BOARD_MARGIN = 1.5;
const VIEW_MARGIN = 1;
// How long ink takes to run along a newly connected wire; matches the ink
// animation in styles.css.
const INK_MS = 200;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

let svg: SVGSVGElement | undefined;

// Board-space point to client coordinates.
export function toScreen(x: number, y: number): { x: number; y: number } {
  if (svg === undefined) throw new Error("The board isn't on the page");
  const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM() ?? undefined);
  return { x: p.x, y: p.y };
}

// The board point under a client point, or null if it's off the board's
// work area.
export function boardPointAt(clientX: number, clientY: number): { x: number; y: number } | null {
  if (svg === undefined) return null;
  const p = toBoard(clientX, clientY);
  const { width, height } = current().grid;
  return p.x >= 0 && p.x < width && p.y >= 0 && p.y < height ? p : null;
}

function toBoard(clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg?.getScreenCTM();
  if (ctm === undefined || ctm === null) throw new Error("The board isn't on the page");
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

const isEdgeHigh = (id: number): boolean => (current().edges.get(id)?.value ?? 0) !== 0;
const isPinHigh = (pin: Pin): boolean => (current().nodes.get(pin.node)?.signals[pin.index] ?? 0) !== 0;

export function Board(): JSX.Element {
  const grid = createMemo(() => current().grid, undefined, {
    equals: (a, b) => a.width === b.width && a.height === b.height,
  });
  // The board fills its cell of the sheet; fit the drawing to the cell
  // whenever it changes size.
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  const viewBox = createMemo(() => fitViewBox(grid(), size()));
  const cell = new ResizeObserver(([entry]) => {
    if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
  });
  onMount(() => {
    if (svg) cell.observe(svg);
  });
  onCleanup(() => {
    cell.disconnect();
  });

  const gestures = createGestures({
    game: current,
    edit: mutate,
    locked: () => session().testing,
    pixelsPerCell: () => svg?.getScreenCTM()?.a ?? 1,
    sound,
  });
  // The gesture module is plain state; mirror it into signals after each event.
  const [view, setView] = createSignal(snapshot(gestures), { equals: false });
  const hovered = (): number | null => view().hoveredNode;
  const hoveredPin = (): Pin | null => view().hoveredPin;
  const pressed = (): number | null => view().pressedNode;
  // A held part shows the closed hand; a held switch keeps its pointer.
  const grabbing = (): boolean => {
    const node = current().nodes.get(pressed() ?? -1);
    return node !== undefined && !nodeKind(current(), node).clickable;
  };
  const wiring = (): Gestures["preview"] => view().preview;
  const handle = (event: MouseEvent, run: (p: { x: number; y: number }) => void): void => {
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
    [...routing().routes].map(([id, path]) => {
      const width = untrack(() => {
        const edge = current().edges.get(id);
        const from = edge && current().nodes.get(edge.from);
        if (edge === undefined || from === undefined) throw new Error(`Wire ${id} has no node to come from`);
        return widthOf(current(), from, { side: "out", index: edge.fromIndex });
      });
      return { id, route: path, d: wirePath(path), width };
    }),
  );

  // Wires the player just connected, still being inked over their pencil line.
  const [inking, setInking] = createSignal<ReadonlySet<EdgeID>>(new Set());
  const inkNewWires = (firstNew: EdgeID): void => {
    if (still) return;
    const fresh = [...current().edges.keys()].filter((id) => id >= firstNew);
    if (fresh.length === 0) return;
    setInking((ids) => new Set([...ids, ...fresh]));
    setTimeout(() => {
      setInking((ids) => new Set([...ids].filter((id) => !fresh.includes(id))));
    }, INK_MS);
  };

  const preview = (): { d: string; valid: boolean; snapped: boolean } | null => {
    const w = wiring();
    const from = w && current().nodes.get(w.from.node);
    if (!w || !from) return null;
    const p = pinPosition(current(), from, w.from.side, w.from.index);
    return { d: `M ${p.x} ${p.y} L ${w.to.x} ${w.to.y}`, valid: w.valid, snapped: w.target !== null && w.valid };
  };
  const lifted = (): EdgeID | null => wiring()?.lifted ?? null;
  // The pin under a wire being drawn that the wire can't join.
  const refusedPin = (): Pin | null => {
    const w = wiring();
    return w && !w.valid ? w.target : null;
  };

  const ghost = createMemo(() => {
    const drag = binDrag();
    const at = drag?.at;
    if (!drag || !at) return null;
    const rect = landing(current(), drag.type, at, drag.width);
    return rect && { rect, label: partName(drag.type, drag.width) };
  });

  const onPointerMove = (event: PointerEvent): void => {
    handle(event, (p) => {
      gestures.move(p);
    });
  };
  const onPointerDown = (event: PointerEvent): void => {
    handle(event, (p) => {
      gestures.down(p, event.button);
    });
    if (gestures.preview || gestures.dragging) svg?.setPointerCapture(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent): void => {
    const firstNew = current().nextEdgeID;
    handle(event, (p) => {
      gestures.up(p);
    });
    inkNewWires(firstNew);
  };
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    handle(event, (p) => {
      gestures.contextMenu(p);
    });
  };

  return (
    <svg
      id="board"
      ref={(el) => {
        svg = el;
      }}
      viewBox={viewBox()}
      classList={{ unstable: !current().stable, grabbing: grabbing() }}
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
        <filter
          id="glow"
          filterUnits="userSpaceOnUse"
          x="-5"
          y="-5"
          width={grid().width + 10}
          height={grid().height + 10}
        >
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
      <Show when={!current().stable}>
        <text id="unstable" class="unstable-note" x={0.4} y={-0.4}>
          UNSTABLE: a loop never settles
        </text>
      </Show>

      <g>
        <For each={wires()}>
          {(wire) => (
            <g
              class="wire"
              classList={{
                high: isEdgeHigh(wire.id),
                unrouted: !wire.route.routed,
                bus: wire.width > 1,
                inking: inking().has(wire.id),
                lifted: lifted() === wire.id,
              }}
              data-edge={wire.id}
            >
              <Show when={inking().has(wire.id)}>
                <path class="pencil" d={wire.d} />
              </Show>
              {/* A unit path length lets the ink animation run any wire in the same time. */}
              <path class="core" d={wire.d} pathLength={inking().has(wire.id) ? 1 : undefined} />
              <path class="flow" d={wire.d} />
              <Show when={wire.width > 1 && wire.route.points[0]}>
                {(at) => <BusMark at={at()} width={wire.width} />}
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
              pressed={pressed() === node.id}
              hoveredPin={hoveredPin()?.node === node.id ? hoveredPin() : null}
              refusedPin={refusedPin()?.node === node.id ? refusedPin() : null}
            />
          )}
        </For>
      </g>
      <Show when={preview()}>
        {(p) => <path class="preview" classList={{ refused: !p().valid, snapped: p().snapped }} d={p().d} />}
      </Show>
      {/* Where a part dragged from the parts bin will land. */}
      <Show when={ghost()}>
        {(g) => (
          <g class="ghost">
            <rect x={g().rect.x} y={g().rect.y} width={g().rect.width} height={g().rect.height} />
            <text x={g().rect.x + g().rect.width / 2} y={g().rect.y + g().rect.height / 2}>
              {g().label}
            </text>
          </g>
        )}
      </Show>
    </svg>
  );
}

// A bus is marked with its width the schematic way: a short slash across it
// just after it leaves its pin, with the width beside it.
function BusMark(props: { at: { x: number; y: number }; width: number }): JSX.Element {
  const x = (): number => props.at.x + 0.8;
  const y = (): number => props.at.y;
  return (
    <>
      <path class="bus-mark" d={`M ${x() - 0.3} ${y() + 0.4} L ${x() + 0.3} ${y() - 0.4}`} />
      <text class="bus-width" x={x() + 0.35} y={y() - 0.7}>
        {props.width}
      </text>
    </>
  );
}

function snapshot(g: Gestures): Pick<Gestures, "hoveredNode" | "hoveredPin" | "preview" | "pressedNode"> {
  return { hoveredNode: g.hoveredNode, hoveredPin: g.hoveredPin, preview: g.preview, pressedNode: g.pressedNode };
}

// A viewBox that fits the whole board, centred and as large as it fits, into
// an SVG of this size.
function fitViewBox(grid: Size, view: Size): string {
  const margin = (BOARD_MARGIN + VIEW_MARGIN) * 2;
  const unitsPerPixel = Math.max(
    (grid.width + margin) / Math.max(1, view.width),
    (grid.height + margin) / Math.max(1, view.height),
  );
  const x = grid.width / 2 - (view.width / 2) * unitsPerPixel;
  const y = grid.height / 2 - (view.height / 2) * unitsPerPixel;
  return `${x} ${y} ${view.width * unitsPerPixel} ${view.height * unitsPerPixel}`;
}
