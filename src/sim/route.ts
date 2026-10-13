import { pinPosition, wiredNode, type EdgeID, type Game, type Pin } from "./circuit";
import type { Size } from "./grid";
import { inputCount, outputCount } from "./node";

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
// Routing otherwise.
export function createRouter(): (game: Game) => Routing {
  let last: { key: string; routing: Routing } | null = null;
  return (game) => {
    const key = layoutKey(game);
    if (last?.key !== key) last = { key, routing: routeWires(game) };
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

export function routeWires(game: Game): Routing {
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
    for (let i = 0; i < outputCount(node.type, node.width); i++) {
      const p = pinPosition(node, "out", i);
      reserved.set(key(p.x + 1, p.y), `${node.id}:${i}`);
    }
    for (let i = 0; i < inputCount(node.type, node.width); i++) {
      const p = pinPosition(node, "in", i);
      reserved.set(key(p.x - 1, p.y), "none");
    }
  }
  for (const edge of game.edges.values()) {
    const p = pinPosition(wiredNode(game, edge.to), "in", edge.toIndex);
    reserved.set(key(p.x - 1, p.y), `${edge.from}:${edge.fromIndex}`);
  }

  const pointUse = new Map<number, Map<string, Usage>>();
  const edgeUse = new Map<string, string>();
  const netEdges = new Map<string, Set<string>>();
  const sources = new Map<string, Pin>();
  const routes = new Map<EdgeID, Route>();
  const lattices = new Map<EdgeID, { net: string; path: Point[]; route: Route }>();

  // Short wires first: they have the fewest options.
  const edges = [...game.edges.values()].map((edge) => {
    const a = pinPosition(wiredNode(game, edge.from), "out", edge.fromIndex);
    const b = pinPosition(wiredNode(game, edge.to), "in", edge.toIndex);
    return { edge, a, b, length: Math.abs(a.x - b.x) + Math.abs(a.y - b.y) };
  });
  edges.sort((p, q) => p.length - q.length || p.edge.id - q.edge.id);

  for (const { edge, a, b } of edges) {
    const net = `${edge.from}:${edge.fromIndex}`;
    sources.set(net, { node: edge.from, side: "out", index: edge.fromIndex });
    const path = search(
      grid,
      net,
      { x: a.x + 1, y: a.y },
      { x: b.x - 1, y: b.y },
      blocked,
      reserved,
      pointUse,
      edgeUse,
    );
    if (!path) {
      const midX = (a.x + b.x) / 2;
      routes.set(edge.id, {
        points: simplify([a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]),
        hops: [],
        routed: false,
      });
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

  return { routes, junctions };
}

// How a net uses a point of its path: running straight through it, or
// turning (which includes the path's ends).
function pointUsage(prev: Point | undefined, next: Point | undefined): Usage {
  if (prev === undefined || next === undefined) return "bend";
  if (prev.x !== next.x && prev.y !== next.y) return "bend";
  return prev.y === next.y ? "h" : "v";
}

const stateOf = (k: number, dir: number): number => k * 4 + dir;

// A* over (point, heading) from start to goal, both of which are pin stubs.
// Returns the lattice points from start to goal, or null.
function search(
  grid: Lattice,
  net: string,
  start: Point,
  goal: Point,
  blocked: Set<number>,
  reserved: Map<number, string>,
  pointUse: Map<number, Map<string, Usage>>,
  edgeUse: Map<string, string>,
): Point[] | null {
  const key = grid.key;
  const passable = (x: number, y: number): boolean => {
    if (!grid.inside(x, y)) return false;
    const k = key(x, y);
    if (blocked.has(k)) return false;
    const owner = reserved.get(k);
    return owner === undefined || owner === net;
  };
  if (!passable(start.x, start.y) || !passable(goal.x, goal.y)) return null;

  const others = (k: number): [string, Usage][] => [...(pointUse.get(k) ?? [])].filter(([other]) => other !== net);
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
    const here = others(k);

    for (let d = 0; d < 4; d++) {
      if (d === (dir + 2) % 4) continue;
      const dx = DX[d] ?? 0;
      const dy = DY[d] ?? 0;
      const nx = x + dx;
      const ny = y + dy;
      if (!passable(nx, ny)) continue;
      const nk = key(nx, ny);
      const owner = edgeUse.get(edgeKey(k, nk));
      if (owner !== undefined && owner !== net) continue;

      let step = owner === net ? SHARED_COST : 1;
      if (d !== dir) {
        // Turning where another signal is would look like a connection.
        if (here.length > 0) continue;
        step += TURN_COST;
      } else if (here.length > 0) {
        // Only cross straight over a wire running the other way.
        const across = axisOf(d) === "h" ? "v" : "h";
        if (here.some(([, usage]) => usage !== across)) continue;
        step += CROSS_COST;
      }

      const sideX = dy;
      const sideY = dx;
      const beside = (bx: number, by: number): boolean => grid.inside(bx, by) && others(key(bx, by)).length > 0;
      if (beside(nx + sideX, ny + sideY) || beside(nx - sideX, ny - sideY)) step += BESIDE_COST;

      const ns = stateOf(nk, d);
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
