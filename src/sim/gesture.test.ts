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

function setup(pixelsPerCell = 1): Setup {
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
    pixelsPerCell: () => pixelsPerCell,
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

// A press on a switch's left side.
const press = (game: Game, id: NodeID): { x: number; y: number } => {
  const r = game.nodes.get(id)!.rect;
  return { x: r.x + 0.4, y: r.y + r.height / 2 };
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

  test("over a pin it can join, the preview snaps to the pin", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const b = add("NOT", 20, 20);
    g.down(at(game, out(a)), 0);
    const p = at(game, inp(b));
    g.move({ x: p.x + 0.4, y: p.y - 0.3 });
    expect(g.preview).toMatchObject({ to: p, target: inp(b), valid: true });
  });

  test("over a pin of another width, the preview is refused and doesn't wire", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const bus = placeNode(game, "OUTPUT", { x: 20, y: 20 }, "Y", 4)!.id;
    g.down(at(game, out(a)), 0);
    g.move(at(game, inp(bus)));
    expect(g.preview).toMatchObject({ target: inp(bus), valid: false });
    g.up(at(game, inp(bus)));
    expect(game.edges.size).toBe(0);
  });

  test("dragging a wired input pin onto another input moves the wire", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const b = add("NOT", 20, 20);
    const c = add("NOT", 20, 30);
    wire(game, out(a), inp(b));
    g.down(at(game, inp(b)), 0);
    expect(g.preview).toMatchObject({ from: out(a) });
    expect(g.preview?.lifted).not.toBeNull();
    g.move(at(game, inp(c)));
    g.up(at(game, inp(c)));
    expect(edgeInto(game, b, 0)).toBeUndefined();
    expect(edgeInto(game, c, 0)?.from).toBe(a);
  });

  test("dropping a lifted wire on empty board removes it", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const b = add("NOT", 20, 20);
    wire(game, out(a), inp(b));
    g.down(at(game, inp(b)), 0);
    g.up({ x: 35, y: 35 });
    expect(game.edges.size).toBe(0);
  });

  test("dropping a lifted wire back on its pin, or on a pin it can't join, keeps it", () => {
    const { game, g, add } = setup();
    const a = add("INPUT", 5, 5);
    const b = add("NOT", 20, 20);
    const c = add("NOT", 20, 30);
    const edge = wire(game, out(a), inp(b))!;
    g.down(at(game, inp(b)), 0);
    g.up(at(game, inp(b)));
    g.down(at(game, inp(b)), 0);
    g.up(at(game, out(c)));
    expect([...game.edges.keys()]).toEqual([edge.id]);
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

  test("a pin reaches further over open board than over its part's body", () => {
    const { game, g, add } = setup();
    const n = add("NOT", 20, 20);
    const p = at(game, inp(n));
    g.move({ x: p.x - 1.3, y: p.y });
    expect(g.hoveredPin).toEqual(inp(n));
    g.move({ x: p.x + 1.3, y: p.y });
    expect(g.hoveredPin).toBeNull();
    expect(g.hoveredNode).toBe(n);
  });

  test("a pressed node is held until release", () => {
    const { game, g, add } = setup();
    const n = add("NOT", 20, 20);
    g.down(centre(game, n), 0);
    expect(g.pressedNode).toBe(n);
    g.up(centre(game, n));
    expect(g.pressedNode).toBeNull();
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

  describe("flipping a switch", () => {
    // At 8 px a cell, 4 px is half a cell: enough on its own to snap a node
    // to the next cell.
    const ZOOM = 8;

    test("a 4 px wobble is still a click: it flips and stays put", () => {
      const { game, g, add } = setup(ZOOM);
      const a = add("INPUT", 5, 5);
      const before = game.nodes.get(a)!.rect;
      const p = press(game, a);
      g.down(p, 0);
      g.move({ x: p.x + 4 / ZOOM, y: p.y });
      g.up({ x: p.x + 4 / ZOOM, y: p.y });
      expect(game.nodes.get(a)!.isHigh).toBe(true);
      expect(game.nodes.get(a)!.rect).toEqual(before);
    });

    test("6 px is a drag: no flip", () => {
      const { game, g, add } = setup(ZOOM);
      const a = add("INPUT", 5, 5);
      const before = game.nodes.get(a)!.rect;
      const p = press(game, a);
      const to = { x: p.x + 6 / ZOOM, y: p.y };
      g.down(p, 0);
      expect(g.dragging).toBe(true);
      g.move(to);
      g.up(to);
      expect(game.nodes.get(a)!.isHigh).toBe(false);
      expect(game.nodes.get(a)!.rect.x).toBe(before.x + 1);
    });

    test("pressing the switch's edge beside its pin flips it, with no wire", () => {
      const { game, g, add } = setup(ZOOM);
      const a = add("INPUT", 5, 5);
      const pin = at(game, out(a));
      const edge = { x: pin.x - 0.35, y: pin.y };
      g.down(edge, 0);
      expect(g.preview).toBeNull();
      g.up(edge);
      expect(game.nodes.get(a)!.isHigh).toBe(true);
    });

    test("a neighbour's pin reaching over the switch doesn't take the press", () => {
      const { game, g, add } = setup(ZOOM);
      const a = add("INPUT", 5, 5);
      const r = game.nodes.get(a)!.rect;
      const n = add("NOT", r.x + r.width + 3, r.y + r.height / 2);
      expect(at(game, inp(n)).x).toBe(r.x + r.width);
      const pin = at(game, inp(n));
      const edge = { x: pin.x - 0.35, y: pin.y };
      g.down(edge, 0);
      expect(g.preview).toBeNull();
      g.up(edge);
      expect(game.nodes.get(a)!.isHigh).toBe(true);
    });

    test("a jump past the dead zone with no move between is a drag", () => {
      const { game, g, add } = setup(ZOOM);
      const a = add("INPUT", 5, 5);
      const p = press(game, a);
      g.down(p, 0);
      g.up({ x: p.x + 6 / ZOOM, y: p.y });
      expect(game.nodes.get(a)!.isHigh).toBe(false);
    });

    test("pressing the pin itself still starts a wire", () => {
      const { game, g, add } = setup(ZOOM);
      const a = add("INPUT", 5, 5);
      g.down(at(game, out(a)), 0);
      expect(g.preview?.from).toEqual(out(a));
    });
  });
});
