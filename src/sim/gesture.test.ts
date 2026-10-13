import { describe, expect, test } from "bun:test";
import { edgeInto, newGame, pinPosition, placeNode, wire, type Game, type Pin } from "./circuit";
import { PARTS } from "./level";
import { createGestures, type Gestures } from "./gesture";
import type { NodeID, NodeType } from "./node";

interface Setup {
  game: Game;
  g: Gestures;
  add: (type: NodeType, x: number, y: number) => NodeID;
  lock: () => void;
  edits: () => number;
}

function setup(): Setup {
  const game = newGame(PARTS);
  let locked = false;
  let edits = 0;
  const g = createGestures({
    game: () => game,
    edit: (change) => {
      edits++;
      change(game);
    },
    locked: () => locked,
  });
  const add = (type: NodeType, x: number, y: number): NodeID => placeNode(game, type, { x, y })!.id;
  const lock = (): void => {
    locked = true;
  };
  return { game, g, add, lock, edits: () => edits };
}

const out = (node: NodeID): Pin => ({ node, side: "out", index: 0 });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });
const at = (game: Game, pin: Pin): { x: number; y: number } =>
  pinPosition(game, game.nodes.get(pin.node)!, pin.side, pin.index);
const centre = (game: Game, id: NodeID): { x: number; y: number } => {
  const r = game.nodes.get(id)!.rect;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

describe("gestures", () => {
  test("dragging pin to pin wires them, preview follows the pointer", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const b = add("NOT", 20, 20);
    g.down(at(game, out(a)), 0);
    expect(g.preview?.from).toEqual(out(a));
    g.move({ x: 12, y: 13 });
    expect(g.preview?.to).toEqual({ x: 12, y: 13 });
    g.move(at(game, inp(b)));
    g.up(at(game, inp(b)));
    expect(g.preview).toBeNull();
    expect(edgeInto(game, b, 0)?.from).toBe(a);
  });

  test("releasing off a pin wires nothing", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    g.down(at(game, out(a)), 0);
    g.up({ x: 30, y: 30 });
    expect(game.edges.size).toBe(0);
  });

  test("dragging a node moves it, snapped", () => {
    const { game, g, add } = setup();
    const n = add("AND", 10, 10);
    const start = centre(game, n);
    const before = game.nodes.get(n)!.rect;
    g.down(start, 0);
    g.move({ x: start.x + 5.3, y: start.y + 2.8 });
    g.up({ x: start.x + 5.3, y: start.y + 2.8 });
    const r = game.nodes.get(n)!.rect;
    expect({ x: r.x, y: r.y }).toEqual({ x: before.x + 5, y: before.y + 3 });
  });

  test("clicking an input toggles it", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    g.down(centre(game, a), 0);
    g.up(centre(game, a));
    expect(game.nodes.get(a)!.isHigh).toBe(true);
  });

  test("dragging an input then releasing does not toggle it", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const c = centre(game, a);
    g.down(c, 0);
    g.move({ x: c.x + 4, y: c.y + 4 });
    g.up({ x: c.x + 4, y: c.y + 4 });
    expect(game.nodes.get(a)!.isHigh).toBe(false);
  });

  test("right-clicking an input pin unwires it", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const b = add("NOT", 20, 20);
    wire(game, out(a), inp(b));
    g.contextMenu(at(game, inp(b)));
    expect(game.edges.size).toBe(0);
  });

  test("right-clicking a gate removes it; terminals stay", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const o = add("OUTPUT", 30, 5);
    const b = add("NAND", 20, 20);
    g.contextMenu(centre(game, a));
    g.contextMenu(centre(game, o));
    g.contextMenu(centre(game, b));
    expect([...game.nodes.keys()]).toEqual([a, o]);
  });

  test("hover prefers the pin, else the node", () => {
    const { game, g, add } = setup();
    const b = add("NAND", 20, 20);
    g.move(at(game, out(b)));
    expect(g.hoveredPin).toEqual(out(b));
    expect(g.hoveredNode).toBeNull();
    g.move(centre(game, b));
    expect(g.hoveredPin).toBeNull();
    expect(g.hoveredNode).toBe(b);
    g.move({ x: 40, y: 40 });
    expect(g.hoveredNode).toBeNull();
  });

  test("other buttons start nothing", () => {
    const { game, g, add, edits } = setup();
    const a = add("INPUT", 5, 5);
    g.down(centre(game, a), 2);
    g.up(centre(game, a));
    expect(edits()).toBe(0);
  });

  test("nothing is editable while locked", () => {
    const { game, g, add, lock, edits } = setup();
    const a = add("INPUT", 5, 5);
    const b = add("NAND", 20, 20);
    wire(game, out(a), inp(b));
    lock();
    const c = centre(game, a);
    g.down(c, 0);
    g.move({ x: c.x + 4, y: c.y + 4 });
    g.up(c);
    g.down(at(game, out(b)), 0);
    expect(g.preview).toBeNull();
    g.contextMenu(at(game, inp(b)));
    g.contextMenu(centre(game, b));
    expect(edits()).toBe(0);
    expect(game.nodes.size).toBe(2);
    expect(game.edges.size).toBe(1);
    expect(game.nodes.get(a)!.isHigh).toBe(false);
  });
});
