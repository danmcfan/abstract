import { nodeKind, pinPosition, wiredNode, type Edge, type EdgeID, type Game, type Pin } from "./circuit";
import type { Size } from "./grid";

// Wires run along grid lines between lattice points. A wire leaves its output
// pin heading right and enters its input pin heading right.
//
// Rules, so every wire can be followed by eye:
// - Wires never pass through gates.
// - Wires carrying different signals never share a segment, and only meet
//   where one crosses straight over the other. Crossings are drawn with a hop.
// - Wires carrying the same signal (fanning out from one output) may share a
//   trunk; where they split there's a junction dot.

export interface Point {
  x: number;
  y: number;
}

export interface Route {
  // Corners of the wire, from the output pin to the input pin.
  points: Point[];
  // Where this wire hops over another signal's wire.
  hops: Point[];
  // False when no clean route exists and the wire was drawn directly.
  routed: boolean;
}

export interface Routing {
  routes: Map<EdgeID, Route>;
  // Where one signal's wire splits, with the output pin driving it.
  junctions: { point: Point; source: Pin }[];
}

// Changes whenever wires need rerouting: positions and connections, not signals.
export function layoutKey(game: Game): string {
  const nodes = [...game.nodes.values()].map((n) => `${n.id}@${n.rect.x},${n.rect.y}`).join(";");
  const edges = [...game.edges.values()].map((e) => `${e.id}:${e.from}.${e.fromIndex}>${e.to}.${e.toIndex}`).join(";");
  return `${nodes}|${edges}`;
}

// A router that reroutes only when the layout changed, returning the same
// Routing otherwise. Each reroute keeps the last routes that still fit, so
// the wires the player didn't touch stay put.
export function createRouter(): (game: Game) => Routing {
  let last: { key: string; routing: Routing } | null = null;
  return (game) => {
    const key = layoutKey(game);
    if (last?.key !== key) last = { key, routing: routeWires(game, last?.routing.routes) };
    return last.routing;
  };
}

const TURN_COST = 3;
const CROSS_COST = 2;
const SHARED_COST = 0.2;
// Running right beside another signal reads as a double line, so prefer a
// gap of at least one cell.
const BESIDE_COST = 1.5;

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const axisOf = (dir: number): "h" | "v" => (dir % 2 === 0 ? "h" : "v");

type Usage = "h" | "v" | "bend";

// Lattice points of a board, numbered row by row, and back.
interface Lattice {
  key: (x: number, y: number) => number;
  point: (k: number) => Point;
  inside: (x: number, y: number) => boolean;
}

function lattice(grid: Size): Lattice {
  const stride = grid.width + 1;
  return {
    key: (x, y) => y * stride + x,
    point: (k) => ({ x: k % stride, y: Math.floor(k / stride) }),
    inside: (x, y) => x >= 0 && y >= 0 && x <= grid.width && y <= grid.height,
  };
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

// How many times routing starts over with the wires that found no route
// moved to the front, so they get first pick of the board.
const RETRIES = 4;

// Routes every wire. A wire whose previous route still fits keeps it; the
// rest are searched for. When some wire finds no route, routing starts over
// with that wire first, keeping whichever pass routes the most wires. Nodes
// never move: only routes change.
export function routeWires(game: Game, previous?: ReadonlyMap<EdgeID, Route>): Routing {
  const grid = lattice(game.grid);
  const key = grid.key;
  const blocked = new Set<number>();
  for (const node of game.nodes.values()) {
    const { x, y, width, height } = node.rect;
    for (let px = x; px <= x + width; px++) {
      for (let py = y; py <= y + height; py++) blocked.add(key(px, py));
    }
  }

  // The point just outside each pin belongs to that pin's signal, so no
  // other wire can squeeze past and look connected.
  const reserved = new Map<number, string>();
  for (const node of game.nodes.values()) {
    const kind = nodeKind(game, node);
    for (let i = 0; i < kind.outputCount(node.width); i++) {
      const p = pinPosition(game, node, "out", i);
      reserved.set(key(p.x + 1, p.y), `${node.id}:${i}`);
    }
    for (let i = 0; i < kind.inputCount(node.width); i++) {
      const p = pinPosition(game, node, "in", i);
      reserved.set(key(p.x - 1, p.y), "none");
    }
  }
  for (const edge of game.edges.values()) {
    const p = pinPosition(game, wiredNode(game, edge.to), "in", edge.toIndex);
    reserved.set(key(p.x - 1, p.y), `${edge.from}:${edge.fromIndex}`);
  }

  const wires: Wire[] = [...game.edges.values()].map((edge) => {
    const a = pinPosition(game, wiredNode(game, edge.from), "out", edge.fromIndex);
    const b = pinPosition(game, wiredNode(game, edge.to), "in", edge.toIndex);
    const old = previous?.get(edge.id);
    const kept = old?.routed === true ? expand(old.points) : undefined;
    return {
      edge,
      a,
      b,
      length: Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
      // A previous route only fits if both its pins are where they were.
      kept: kept && same(kept[0], a) && same(kept.at(-1), b) ? kept.slice(1, -1) : undefined,
    };
  });
  // Wires keeping their routes go first, so new wires go around them. Then
  // short wires: they have the fewest options.
  wires.sort(
    (p, q) =>
      Number(p.kept === undefined) - Number(q.kept === undefined) || p.length - q.length || p.edge.id - q.edge.id,
  );

  let best = routeInOrder(grid, blocked, reserved, wires);
  for (let i = 0; i < RETRIES && best.failed.size > 0; i++) {
    const failed = best.failed;
    const order = [...wires.filter((w) => failed.has(w.edge.id)), ...wires.filter((w) => !failed.has(w.edge.id))];
    const next = routeInOrder(grid, blocked, reserved, order);
    if (next.failed.size < best.failed.size) best = next;
    else break;
  }
  return best.routing;
}

interface Wire {
  edge: Edge;
  a: Point;
  b: Point;
  length: number;
  // The lattice points of the wire's last route, between its pin stubs.
  kept: Point[] | undefined;
}

const same = (p: Point | undefined, q: Point): boolean => p?.x === q.x && p.y === q.y;

// Every lattice point along a route's corners.
function expand(points: Point[]): Point[] {
  const [first] = points;
  if (first === undefined) return [];
  const result = [first];
  for (const corner of points.slice(1)) {
    let at = result.at(-1) ?? first;
    const dx = Math.sign(corner.x - at.x);
    const dy = Math.sign(corner.y - at.y);
    while (at.x !== corner.x || at.y !== corner.y) {
      at = { x: at.x + dx, y: at.y + dy };
      result.push(at);
    }
  }
  return result;
}

// Routes the wires one at a time in the given order, each avoiding the ones
// before it.
function routeInOrder(
  grid: Lattice,
  blocked: Set<number>,
  reserved: Map<number, string>,
  wires: Wire[],
): { routing: Routing; failed: Set<EdgeID> } {
  const key = grid.key;
  const pointUse = new Map<number, Map<string, Usage>>();
  const edgeUse = new Map<string, string>();
  const netEdges = new Map<string, Set<string>>();
  const sources = new Map<string, Pin>();
  const routes = new Map<EdgeID, Route>();
  const failed = new Set<EdgeID>();
  const lattices = new Map<EdgeID, { net: string; path: Point[]; route: Route }>();

  for (const { edge, a, b, kept } of wires) {
    const net = `${edge.from}:${edge.fromIndex}`;
    sources.set(net, { node: edge.from, side: "out", index: edge.fromIndex });
    const board: Board = { grid, net, blocked, reserved, pointUse, edgeUse };
    const start = { x: a.x + 1, y: a.y };
    const goal = { x: b.x - 1, y: b.y };
    const path = kept && fits(board, kept, start, goal) ? kept : search(board, start, goal);
    if (!path) {
      const midX = (a.x + b.x) / 2;
      routes.set(edge.id, {
        points: simplify([a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]),
        hops: [],
        routed: false,
      });
      failed.add(edge.id);
      continue;
    }
    const full = [a, ...path, b];
    for (const [i, p] of full.entries()) {
      const prev = full[i - 1];
      const next = full[i + 1];
      const usage = pointUsage(prev, next);
      const uses = pointUse.get(key(p.x, p.y)) ?? new Map<string, Usage>();
      // A point the net already turns at stays a turn.
      if (uses.get(net) !== "bend") uses.set(net, uses.has(net) && uses.get(net) !== usage ? "bend" : usage);
      pointUse.set(key(p.x, p.y), uses);
      if (next) {
        const e = edgeKey(key(p.x, p.y), key(next.x, next.y));
        edgeUse.set(e, net);
        const set = netEdges.get(net) ?? new Set<string>();
        set.add(e);
        netEdges.set(net, set);
      }
    }
    const route: Route = { points: simplify(full), hops: [], routed: true };
    lattices.set(edge.id, { net, path: full, route });
    routes.set(edge.id, route);
  }

  // A horizontal run hops wherever another signal crosses it vertically.
  for (const { net, path, route } of lattices.values()) {
    const hops: Point[] = [];
    for (const [i, p] of path.entries()) {
      if (path[i - 1]?.y !== p.y || path[i + 1]?.y !== p.y) continue;
      const uses = pointUse.get(key(p.x, p.y)) ?? new Map<string, Usage>();
      if ([...uses].some(([other, usage]) => other !== net && usage === "v")) hops.push(p);
    }
    route.hops = hops;
  }

  // A junction is where three or more of one signal's segments meet.
  const junctions: Routing["junctions"] = [];
  for (const [net, set] of netEdges) {
    const source = sources.get(net);
    if (source === undefined) continue;
    const degree = new Map<number, number>();
    for (const e of set) {
      for (const end of e.split("-").map(Number)) degree.set(end, (degree.get(end) ?? 0) + 1);
    }
    for (const [k, d] of degree) {
      if (d >= 3) junctions.push({ point: grid.point(k), source });
    }
  }

  return { routing: { routes, junctions }, failed };
}

// How a net uses a point of its path: running straight through it, or
// turning (which includes the path's ends).
function pointUsage(prev: Point | undefined, next: Point | undefined): Usage {
  if (prev === undefined || next === undefined) return "bend";
  if (prev.x !== next.x && prev.y !== next.y) return "bend";
  return prev.y === next.y ? "h" : "v";
}

const stateOf = (k: number, dir: number): number => k * 4 + dir;

// The board as one net's wire sees it: what blocks it and what the wires
// routed before it already use.
interface Board {
  grid: Lattice;
  net: string;
  blocked: Set<number>;
  reserved: Map<number, string>;
  pointUse: Map<number, Map<string, Usage>>;
  edgeUse: Map<string, string>;
}

function passable(board: Board, x: number, y: number): boolean {
  if (!board.grid.inside(x, y)) return false;
  const k = board.grid.key(x, y);
  if (board.blocked.has(k)) return false;
  const owner = board.reserved.get(k);
  return owner === undefined || owner === board.net;
}

const others = (board: Board, k: number): [string, Usage][] =>
  [...(board.pointUse.get(k) ?? [])].filter(([other]) => other !== board.net);

// The cost of stepping from (x, y), heading dir, one point in direction d,
// or null if the step isn't allowed.
function stepCost(board: Board, x: number, y: number, dir: number, d: number): number | null {
  const { grid, net } = board;
  if (d === (dir + 2) % 4) return null;
  const dx = DX[d] ?? 0;
  const dy = DY[d] ?? 0;
  const nx = x + dx;
  const ny = y + dy;
  if (!passable(board, nx, ny)) return null;
  const k = grid.key(x, y);
  const owner = board.edgeUse.get(edgeKey(k, grid.key(nx, ny)));
  if (owner !== undefined && owner !== net) return null;

  const here = others(board, k);
  let step = owner === net ? SHARED_COST : 1;
  if (d !== dir) {
    // Turning where another signal is would look like a connection.
    if (here.length > 0) return null;
    step += TURN_COST;
  } else if (here.length > 0) {
    // Only cross straight over a wire running the other way.
    const across = axisOf(d) === "h" ? "v" : "h";
    if (here.some(([, usage]) => usage !== across)) return null;
    step += CROSS_COST;
  }

  const sideX = dy;
  const sideY = dx;
  const beside = (bx: number, by: number): boolean => grid.inside(bx, by) && others(board, grid.key(bx, by)).length > 0;
  if (beside(nx + sideX, ny + sideY) || beside(nx - sideX, ny - sideY)) step += BESIDE_COST;
  return step;
}

// Whether a wire's earlier path, from start to goal, is still allowed.
function fits(board: Board, path: Point[], start: Point, goal: Point): boolean {
  if (!same(path[0], start) || !same(path.at(-1), goal) || !passable(board, start.x, start.y)) return false;
  let dir = 0;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    if (from === undefined || to === undefined) return false;
    const d = DX.findIndex((dx, j) => dx === to.x - from.x && DY[j] === to.y - from.y);
    if (d === -1 || stepCost(board, from.x, from.y, dir, d) === null) return false;
    dir = d;
  }
  return dir !== 2;
}

// A* over (point, heading) from start to goal, both of which are pin stubs.
// Returns the lattice points from start to goal, or null.
function search(board: Board, start: Point, goal: Point): Point[] | null {
  const { grid } = board;
  const key = grid.key;
  if (!passable(board, start.x, start.y) || !passable(board, goal.x, goal.y)) return null;

  const cost = new Map<number, number>();
  const parent = new Map<number, number>();
  const heap = new Heap();
  const h = (x: number, y: number): number => Math.abs(x - goal.x) + Math.abs(y - goal.y);

  const s0 = stateOf(key(start.x, start.y), 0);
  cost.set(s0, 0);
  heap.push(s0, h(start.x, start.y));

  while (heap.size > 0) {
    const s = heap.pop();
    const dir = s % 4;
    const k = Math.floor(s / 4);
    const { x, y } = grid.point(k);
    // Arriving heading left would need a U-turn into the input pin.
    if (x === goal.x && y === goal.y && dir !== 2) return unwind(grid, s, parent);

    for (let d = 0; d < 4; d++) {
      const step = stepCost(board, x, y, dir, d);
      if (step === null) continue;
      const nx = x + (DX[d] ?? 0);
      const ny = y + (DY[d] ?? 0);
      const ns = stateOf(key(nx, ny), d);
      const total = (cost.get(s) ?? Infinity) + step;
      if (total < (cost.get(ns) ?? Infinity)) {
        cost.set(ns, total);
        parent.set(ns, s);
        heap.push(ns, total + h(nx, ny));
      }
    }
  }
  return null;
}

function unwind(grid: Lattice, s: number, parent: Map<number, number>): Point[] {
  const points: Point[] = [];
  for (let at: number | undefined = s; at !== undefined; at = parent.get(at))
    points.push(grid.point(Math.floor(at / 4)));
  points.reverse();
  return points;
}

// Drops points that lie on a straight line between their neighbours.
function simplify(points: Point[]): Point[] {
  return points.filter((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    if (!prev || !next) return true;
    return !((prev.x === p.x && p.x === next.x) || (prev.y === p.y && p.y === next.y));
  });
}

// A binary min-heap of states keyed by priority.
class Heap {
  private readonly items: { state: number; priority: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(state: number, priority: number): void {
    const item = { state, priority };
    const items = this.items;
    let i = items.length;
    items.push(item);
    while (i > 0) {
      const up = (i - 1) >> 1;
      const parent = items[up];
      if (parent === undefined || parent.priority <= priority) break;
      items[i] = parent;
      items[up] = item;
      i = up;
    }
  }

  // Throws when empty; callers check size first.
  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined) throw new Error("Heap is empty");
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        let min = i;
        let minItem = last;
        for (const child of [i * 2 + 1, i * 2 + 2]) {
          const candidate = items[child];
          if (candidate !== undefined && candidate.priority < minItem.priority) {
            min = child;
            minItem = candidate;
          }
        }
        if (min === i) break;
        items[min] = last;
        items[i] = minItem;
        i = min;
      }
    }
    return top.state;
  }
}
