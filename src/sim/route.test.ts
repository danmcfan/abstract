import { describe, expect, test } from "bun:test";
import { moveNode, newGame, pinPosition, placeNode, setInput, wire, type Game, type Pin } from "./circuit";
import { contains } from "./grid";
import type { NodeID } from "./node";
import { createRouter, layoutKey, routeWires, type Point, type Routing } from "./route";

const out = (node: NodeID): Pin => ({ node, side: "out", index: 0 });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });

// Every unit segment of a route, as "x,y-x,y" keyed by its net.
function segments(game: Game, routing: Routing): { net: string; key: string }[] {
  const result: { net: string; key: string }[] = [];
  for (const [id, route] of routing.routes) {
    const edge = game.edges.get(id)!;
    const net = `${edge.from}:${edge.fromIndex}`;
    for (let i = 1; i < route.points.length; i++) {
      for (const [a, b] of unitSteps(route.points[i - 1]!, route.points[i]!)) {
        const [p, q] = [`${a.x},${a.y}`, `${b.x},${b.y}`].sort();
        result.push({ net, key: `${p}-${q}` });
      }
    }
  }
  return result;
}

function unitSteps(a: Point, b: Point): [Point, Point][] {
  const steps: [Point, Point][] = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  for (let p = a; p.x !== b.x || p.y !== b.y; ) {
    const q = { x: p.x + dx, y: p.y + dy };
    steps.push([p, q]);
    p = q;
  }
  return steps;
}

// Two inputs on the left, two gates whose wires have to cross.
function crossingCircuit() {
  const game = newGame();
  const a = placeNode(game, "INPUT", { x: 4, y: 10 })!.id;
  const b = placeNode(game, "INPUT", { x: 4, y: 30 })!.id;
  const top = placeNode(game, "NOT", { x: 25, y: 10 })!.id;
  const bottom = placeNode(game, "NOT", { x: 25, y: 30 })!.id;
  // Blockers force both wires through the same channel.
  placeNode(game, "AND", { x: 15, y: 20 })!;
  wire(game, out(a), inp(bottom));
  wire(game, out(b), inp(top));
  return game;
}

describe("routeWires", () => {
  test("wires start and end at their pins, leaving and entering heading right", () => {
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 4, y: 10 })!;
    const g = placeNode(game, "NAND", { x: 20, y: 25 })!;
    const edge = wire(game, out(a.id), inp(g.id, 1))!;
    const route = routeWires(game).routes.get(edge.id)!;
    expect(route.routed).toBe(true);
    expect(route.points[0]).toEqual(pinPosition(a, "out", 0));
    expect(route.points.at(-1)).toEqual(pinPosition(g, "in", 1));
    expect(route.points[1]!.y).toBe(route.points[0]!.y);
    expect(route.points.at(-2)!.y).toBe(route.points.at(-1)!.y);
  });

  test("wires go around gates, not through them", () => {
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 4, y: 20 })!;
    const wall = placeNode(game, "NAND", { x: 20, y: 20 })!;
    const o = placeNode(game, "OUTPUT", { x: 40, y: 20 })!;
    const edge = wire(game, out(a.id), inp(o.id))!;
    const route = routeWires(game).routes.get(edge.id)!;
    const points = route.points.slice(1, -1);
    for (let i = 1; i < points.length; i++) {
      for (const [p] of unitSteps(points[i - 1]!, points[i]!)) {
        expect(contains(wall.rect, p.x, p.y)).toBe(false);
      }
    }
  });

  test("different signals never share a segment, and cross with a hop", () => {
    const game = crossingCircuit();
    const routing = routeWires(game);
    expect([...routing.routes.values()].every((route) => route.routed)).toBe(true);
    const owner = new Map<string, string>();
    for (const { net, key } of segments(game, routing)) {
      expect(owner.get(key) ?? net).toBe(net);
      owner.set(key, net);
    }
    const hops = [...routing.routes.values()].flatMap((route) => route.hops);
    expect(hops.length).toBeGreaterThan(0);
  });

  test("one output fanning out shares a trunk with a junction", () => {
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 4, y: 20 })!.id;
    const g = placeNode(game, "NAND", { x: 25, y: 20 })!.id;
    wire(game, out(a), inp(g, 0));
    wire(game, out(a), inp(g, 1));
    const routing = routeWires(game);
    expect(routing.junctions.length).toBe(1);
  });
});

describe("createRouter", () => {
  function circuit() {
    const game = newGame();
    const a = placeNode(game, "INPUT", { x: 4, y: 20 })!.id;
    const g = placeNode(game, "NAND", { x: 25, y: 20 })!.id;
    wire(game, out(a), inp(g, 0));
    wire(game, out(a), inp(g, 1));
    return { game, a, g };
  }

  test("junctions report the driving pin", () => {
    const { game, a } = circuit();
    expect(routeWires(game).junctions.map((j) => j.source)).toEqual([out(a)]);
  });

  test("changing signals does not reroute", () => {
    const { game, a } = circuit();
    const route = createRouter();
    const key = layoutKey(game);
    const first = route(game);
    setInput(game, a, true);
    expect(layoutKey(game)).toBe(key);
    expect(route(game)).toBe(first);
  });

  test("moving a node reroutes", () => {
    const { game, g } = circuit();
    const route = createRouter();
    const first = route(game);
    const { x, y } = game.nodes.get(g)!.rect;
    expect(moveNode(game, g, x + 2, y + 3)).toBe(true);
    expect(route(game)).not.toBe(first);
  });

  test("wiring reroutes", () => {
    const { game, a } = circuit();
    const route = createRouter();
    const first = route(game);
    const o = placeNode(game, "OUTPUT", { x: 40, y: 10 })!.id;
    const key = layoutKey(game);
    const second = route(game);
    expect(second).not.toBe(first);
    wire(game, out(a), inp(o));
    expect(layoutKey(game)).not.toBe(key);
    expect(route(game)).not.toBe(second);
  });
});
