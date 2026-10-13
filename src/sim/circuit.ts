import { DEFAULT_GRID, overlaps, snap, type Rect, type Size } from "./grid";
import {
  evaluate,
  inputCount,
  mask,
  MAX_WIDTH,
  nodeSize,
  outputCount,
  pinOffset,
  pinWidth,
  type Label,
  type Node,
  type NodeID,
  type NodeType,
  type Value,
} from "./node";

// The board: nodes, the wires between them, and the signals on both. Every
// command leaves the circuit settled, so readers never see stale signals.
// Invariants: wires run output pin -> input pin, an input pin takes at most
// one wire, wires never form a loop, a wire joins pins of the same width, and
// every wire's nodes exist.

export type EdgeID = number;

export interface Edge {
  id: EdgeID;
  from: NodeID;
  fromIndex: number;
  to: NodeID;
  toIndex: number;
  // The signals it carries, as wide as its pins. A bus is lit when any of
  // them is on.
  value: Value;
}

export interface Game {
  nodes: Map<NodeID, Node>;
  edges: Map<EdgeID, Edge>;
  nextNodeID: NodeID;
  nextEdgeID: EdgeID;
  // The board's size in cells.
  grid: Size;
}

// A connection point on a node. Input pins sit on the left edge, output pins
// on the right edge.
export interface Pin {
  node: NodeID;
  side: "in" | "out";
  index: number;
}

export function newGame(grid: Size = DEFAULT_GRID): Game {
  return { nodes: new Map(), edges: new Map(), nextNodeID: 0, nextEdgeID: 0, grid: { ...grid } };
}

// The node a wire names. Every wire's nodes exist, so a missing one is a bug.
export function wiredNode(game: Game, id: NodeID): Node {
  const node = game.nodes.get(id);
  if (node === undefined) throw new Error(`Wire names node ${id}, which isn't on the board`);
  return node;
}

// Commands

// Adds a node at the free spot nearest center, searching outward ring by
// ring. The width sets how many signals a terminal, split or join carries.
// Returns null when the board has no room or the width is out of range.
export function placeNode(
  game: Game,
  type: NodeType,
  center: { x: number; y: number },
  label: Label = "",
  width = 1,
): Node | null {
  if (!Number.isInteger(width) || width < 1 || width > MAX_WIDTH) return null;
  const rect = freeRect(game, nodeSize(type, width), center);
  if (!rect) return null;
  const node: Node = { id: game.nextNodeID++, type, label, rect, width, isHigh: false, signals: [] };
  game.nodes.set(node.id, node);
  settle(game);
  return node;
}

// Moves a node to the snapped position nearest (x, y), unless that would
// overlap another node. Returns whether the node moved.
export function moveNode(game: Game, id: NodeID, x: number, y: number): boolean {
  const node = game.nodes.get(id);
  if (!node) return false;
  const rect = snap({ ...node.rect, x, y }, game.grid);
  if (collides(game, rect, id)) return false;
  node.rect = rect;
  return true;
}

// Removes a node and every wire touching it.
export function removeNode(game: Game, id: NodeID): void {
  if (!game.nodes.delete(id)) return;
  for (const edge of game.edges.values()) {
    if (edge.from === id || edge.to === id) game.edges.delete(edge.id);
  }
  settle(game);
}

// Wires an output pin to an input pin, in either order. An input pin takes
// one wire, so an existing wire into it is replaced. Refuses wires that
// would form a loop or join pins of different widths. Returns the new edge,
// or null if refused.
export function wire(game: Game, a: Pin, b: Pin): Edge | null {
  const [from, to] = a.side === "out" ? [a, b] : [b, a];
  if (from.side !== "out" || to.side !== "in" || from.node === to.node) return null;
  const source = game.nodes.get(from.node);
  const target = game.nodes.get(to.node);
  if (!source || !target) return null;
  if (widthOf(source, from) !== widthOf(target, to)) return null;
  if (reaches(game, to.node, from.node)) return null;

  const old = edgeInto(game, to.node, to.index);
  if (old) game.edges.delete(old.id);
  const edge: Edge = {
    id: game.nextEdgeID++,
    from: from.node,
    fromIndex: from.index,
    to: to.node,
    toIndex: to.index,
    value: 0,
  };
  game.edges.set(edge.id, edge);
  settle(game);
  return edge;
}

// Removes the wire into an input pin, if any.
export function unwire(game: Game, pin: Pin): void {
  const edge = edgeInto(game, pin.node, pin.index);
  if (!edge) return;
  game.edges.delete(edge.id);
  settle(game);
}

// Sets an INPUT terminal's switches, keeping only as many bits as it has.
// Other node types ignore it.
export function setInput(game: Game, id: NodeID, value: Value): void {
  setInputs(game, new Map([[id, value]]));
}

// Sets several INPUT terminals at once, settling once.
export function setInputs(game: Game, values: Map<NodeID, Value>): void {
  for (const [id, value] of values) {
    const node = game.nodes.get(id);
    if (node?.type === "INPUT") node.signals = [mask(value, node.width)];
  }
  settle(game);
}

// Reads

export function edgeInto(game: Game, node: NodeID, index: number): Edge | undefined {
  for (const edge of game.edges.values()) {
    if (edge.to === node && edge.toIndex === index) return edge;
  }
  return undefined;
}

export function pinPosition(node: Node, side: Pin["side"], index: number): { x: number; y: number } {
  const { x, y, width } = node.rect;
  return { x: side === "out" ? x + width : x, y: y + pinOffset(node.type, side, index, node.width) };
}

export function pins(node: Node): Pin[] {
  const result: Pin[] = [];
  for (let i = 0; i < inputCount(node.type, node.width); i++) result.push({ node: node.id, side: "in", index: i });
  for (let i = 0; i < outputCount(node.type, node.width); i++) result.push({ node: node.id, side: "out", index: i });
  return result;
}

// How many signals one of a node's pins carries.
export function widthOf(node: Node, pin: Pick<Pin, "side" | "index">): number {
  return pinWidth(node.type, pin.side, pin.index, node.width);
}

// The bit whose switch is at (x, y) on a bus INPUT terminal, or null if
// there's no switch there.
export function switchAt(node: Node, x: number, y: number): number | null {
  if (node.type !== "INPUT" || node.width === 1) return null;
  const cell = Math.floor(x - node.rect.x - 1);
  const dy = y - (node.rect.y + node.rect.height / 2);
  if (cell < 0 || cell >= node.width || Math.abs(dy) > 0.75) return null;
  return node.width - 1 - cell;
}

// Returns the pin nearest (x, y) within radius cells.
export function pinAt(game: Game, x: number, y: number, radius = 1): Pin | null {
  let best: Pin | null = null;
  let bestDistance = radius;
  for (const node of game.nodes.values()) {
    for (const pin of pins(node)) {
      const p = pinPosition(node, pin.side, pin.index);
      const distance = Math.hypot(p.x - x, p.y - y);
      if (distance < bestDistance) {
        best = pin;
        bestDistance = distance;
      }
    }
  }
  return best;
}

// Internals

function freeRect(
  game: Game,
  { width, height }: { width: number; height: number },
  center: { x: number; y: number },
): Rect | null {
  for (let ring = 0; ring < game.grid.width + game.grid.height; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const rect = snap({ x: center.x - width / 2 + dx, y: center.y - height / 2 + dy, width, height }, game.grid);
        if (!collides(game, rect)) return rect;
      }
    }
  }
  return null;
}

function collides(game: Game, rect: Rect, except?: NodeID): boolean {
  for (const other of game.nodes.values()) {
    if (other.id !== except && overlaps(rect, other.rect)) return true;
  }
  return false;
}

// Whether signals flow from start to target along wires.
function reaches(game: Game, start: NodeID, target: NodeID): boolean {
  const seen = new Set<NodeID>();
  const stack = [start];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of game.edges.values()) {
      if (edge.from === id) stack.push(edge.to);
    }
  }
  return false;
}

// The board in dependency order, each node with the wire into each of its
// input pins and the position of that wire's source in the order. The
// circuit has no loops, so one pass in this order settles it.
interface Step {
  node: Node;
  inputs: ({ edge: Edge; from: number } | null)[];
}

function plan(game: Game): Step[] {
  const into = new Map<NodeID, Edge[]>();
  for (const edge of game.edges.values()) {
    const wires = into.get(edge.to) ?? [];
    wires[edge.toIndex] = edge;
    into.set(edge.to, wires);
  }
  const steps: Step[] = [];
  const position = new Map<NodeID, number>();
  const visit = (node: Node): number => {
    const seen = position.get(node.id);
    if (seen !== undefined) return seen;
    const inputs = Array.from({ length: inputCount(node.type, node.width) }, (_, i) => {
      const edge = into.get(node.id)?.[i];
      return edge ? { edge, from: visit(wiredNode(game, edge.from)) } : null;
    });
    position.set(node.id, steps.length);
    steps.push({ node, inputs });
    return steps.length - 1;
  };
  for (const node of game.nodes.values()) visit(node);
  return steps;
}

// One pass over a plan: each step's output values and the values into its
// input pins, by position. INPUT terminals take their values from source.
// Unwired input pins read 0.
function pass(steps: Step[], source: (node: Node) => Value): { signals: Value[][]; inputs: Value[][] } {
  // Plain loops: this runs for every node on every row of a test run.
  const signals: Value[][] = [];
  const inputs: Value[][] = [];
  for (const { node, inputs: wires } of steps) {
    const values: Value[] = [];
    for (const w of wires) values.push(w ? (signals[w.from]?.[w.edge.fromIndex] ?? 0) : 0);
    inputs.push(values);
    signals.push(node.type === "INPUT" ? [mask(source(node), node.width)] : evaluate(node.type, values, node.width));
  }
  return { signals, inputs };
}

// Recomputes every node and wire from the INPUT terminals.
function settle(game: Game): void {
  const steps = plan(game);
  const { signals, inputs } = pass(steps, (node) => node.signals[0] ?? 0);
  // pass gives one entry per step and one value per wired pin.
  steps.forEach(({ node, inputs: wires }, i) => {
    node.signals = signals[i] ?? [];
    const into = inputs[i] ?? [];
    wires.forEach((w, pin) => {
      if (w) w.edge.value = into[pin] ?? 0;
    });
    node.isHigh = (node.type === "OUTPUT" ? into : node.signals).some((value) => value !== 0);
  });
}

// Runs many sets of input values through the board without changing it,
// much faster than setting the switches and settling each time. The returned
// function takes one value per INPUT terminal in inputs and gives one value
// per OUTPUT terminal in outputs: the value on its wire, or 0 if unwired.
export function simulate(game: Game, inputs: NodeID[], outputs: NodeID[]): (values: Value[]) => Value[] {
  const steps = plan(game);
  const slot = new Map(inputs.map((id, i) => [id, i]));
  const lamps = outputs.map((id) => steps.findIndex((step) => step.node.id === id));
  return (values) => {
    const { inputs: into } = pass(steps, (node) => values[slot.get(node.id) ?? -1] ?? 0);
    return lamps.map((i) => into[i]?.[0] ?? 0);
  };
}
