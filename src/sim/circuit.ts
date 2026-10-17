import { DEFAULT_GRID, overlaps, snap, type Rect, type Size } from "./grid";
import { kindOf, pinOffset, PROGRAM_MEMORY, type NodeKind, type Parts } from "./kind";
import { mask, MAX_WIDTH, type Label, type Node, type NodeID, type NodeType, type State, type Value } from "./node";

// The board: nodes, the wires between them, and the signals on both. Every
// command leaves the circuit settled, so readers never see stale signals.
// Invariants: wires run output pin -> input pin, an input pin takes at most
// one wire, a wire joins pins of the same width, and every wire's nodes
// exist. Wires may form loops, so a board can be unstable.

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
  // The parts its nodes can be, from the levels.
  parts: Parts;
  // False when the last settle gave up because a loop kept changing its own
  // signals.
  stable: boolean;
}

// A connection point on a node. Input pins sit on the left edge, output pins
// on the right edge.
export interface Pin {
  node: NodeID;
  side: "in" | "out";
  index: number;
}

export function newGame(parts: Parts, grid: Size = DEFAULT_GRID): Game {
  return { nodes: new Map(), edges: new Map(), nextNodeID: 0, nextEdgeID: 0, grid: { ...grid }, parts, stable: true };
}

export function nodeKind(game: Game, node: Node): NodeKind {
  return kindOf(game.parts, node.type);
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
  const rect = freeRect(game, kindOf(game.parts, type).size(width), center);
  if (!rect) return null;
  const node: Node = { id: game.nextNodeID++, type, label, rect, width, isHigh: false, signals: [], state: [] };
  game.nodes.set(node.id, node);
  settle(game);
  return node;
}

// Moves a node to the snapped position nearest (x, y), unless that would
// overlap another node. Returns whether the node moved.
// The cells a part of this type and width would take, centred on a board
// point and snapped to the grid, whether or not they're free.
export function footprint(game: Game, type: NodeType, center: { x: number; y: number }, width = 1): Rect {
  const size = kindOf(game.parts, type).size(width);
  return snap({ x: center.x - size.width / 2, y: center.y - size.height / 2, ...size }, game.grid);
}

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
// join pins of different widths. Returns the new edge, or null if refused.
export function wire(game: Game, a: Pin, b: Pin): Edge | null {
  const [from, to] = a.side === "out" ? [a, b] : [b, a];
  if (from.side !== "out" || to.side !== "in") return null;
  const source = game.nodes.get(from.node);
  const target = game.nodes.get(to.node);
  if (!source || !target) return null;
  if (widthOf(game, source, from) !== widthOf(game, target, to)) return null;

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

// Sets a node's width, leaving any wire that no longer fits for
// dropUnfitWires. Refuses a width out of range.
export function setWidth(game: Game, id: NodeID, width: number): void {
  const node = game.nodes.get(id);
  if (!node || !Number.isInteger(width) || width < 1 || width > MAX_WIDTH) return;
  node.width = width;
}

// Removes every wire whose pins don't exist or don't match widths, which
// is what wire() refuses to make.
export function dropUnfitWires(game: Game): void {
  for (const edge of game.edges.values()) {
    const from = game.nodes.get(edge.from);
    const to = game.nodes.get(edge.to);
    const fits =
      from !== undefined &&
      to !== undefined &&
      edge.fromIndex < nodeKind(game, from).outputCount(from.width) &&
      edge.toIndex < nodeKind(game, to).inputCount(to.width) &&
      widthOf(game, from, { side: "out", index: edge.fromIndex }) ===
        widthOf(game, to, { side: "in", index: edge.toIndex });
    if (!fits) game.edges.delete(edge.id);
  }
  settle(game);
}

// Removes the wire into an input pin, if any.
export function unwire(game: Game, pin: Pin): void {
  const edge = edgeInto(game, pin.node, pin.index);
  if (!edge) return;
  game.edges.delete(edge.id);
  settle(game);
}

// Sets an input terminal's switches, keeping only as many bits as it has.
// Other nodes ignore it.
export function setInput(game: Game, id: NodeID, value: Value): void {
  setInputs(game, new Map([[id, value]]));
}

// Sets several input terminals at once, settling once.
export function setInputs(game: Game, values: Map<NodeID, Value>): void {
  for (const [id, value] of values) {
    const node = game.nodes.get(id);
    if (node && nodeKind(game, node).terminal === "input") node.signals = [mask(value, node.width)];
  }
  settle(game);
}

// Turns the clock on and then off, settling after each change.
export function tick(game: Game, clock: NodeID): void {
  setInput(game, clock, 1);
  setInput(game, clock, 0);
}

// Fills a node that keeps loaded contents, such as program memory, and
// settles. Other nodes ignore it.
export function loadContents(game: Game, id: NodeID, contents: State): void {
  const node = game.nodes.get(id);
  if (!node || nodeKind(game, node).keeps !== true) return;
  node.state = [...contents];
  settle(game);
}

// The board's program memory, if it has one.
export function programMemoryOf(nodes: ReadonlyMap<NodeID, Node>): Node | undefined {
  return [...nodes.values()].find((node) => node.type === PROGRAM_MEMORY);
}

// Puts the board back to off, so what happens next doesn't hang on what
// happened before. Memory parts go back to all 0 but keep loaded contents,
// and input terminals keep their values.
export function restart(game: Game): void {
  clearBoard(game, false);
}

// restart for a test run: the switches go off too, so no memory part takes in
// what they were left on. simulate starts from the same place.
export function restartForTest(game: Game): void {
  clearBoard(game, true);
}

function clearBoard(game: Game, switchesOff: boolean): void {
  for (const node of game.nodes.values()) {
    if (nodeKind(game, node).keeps !== true) node.state = [];
    if (nodeKind(game, node).terminal !== "input" || switchesOff) node.signals = [];
  }
  settle(game);
}

// Reads

// A level names its terminals by label, so wiring data and tests find them that way.
export function terminalNamed(game: Game, terminal: "input" | "output", label: Label): Node | undefined {
  return [...game.nodes.values()].find((node) => nodeKind(game, node).terminal === terminal && node.label === label);
}

export function edgeInto(game: Game, node: NodeID, index: number): Edge | undefined {
  for (const edge of game.edges.values()) {
    if (edge.to === node && edge.toIndex === index) return edge;
  }
  return undefined;
}

export function pinPosition(game: Game, node: Node, side: Pin["side"], index: number): { x: number; y: number } {
  const { x, y, width } = node.rect;
  return { x: side === "out" ? x + width : x, y: y + pinOffset(nodeKind(game, node), side, index, node.width) };
}

export function pins(game: Game, node: Node): Pin[] {
  const kind = nodeKind(game, node);
  const result: Pin[] = [];
  for (let i = 0; i < kind.inputCount(node.width); i++) result.push({ node: node.id, side: "in", index: i });
  for (let i = 0; i < kind.outputCount(node.width); i++) result.push({ node: node.id, side: "out", index: i });
  return result;
}

export const pinKey = (pin: Pin): string => `${pin.node}:${pin.side}:${pin.index}`;

// Pins with no wire: inputs nothing feeds, and outputs that go nowhere.
export function loosePins(game: Game): Pin[] {
  const wired = new Set<string>();
  for (const edge of game.edges.values()) {
    wired.add(pinKey({ node: edge.from, side: "out", index: edge.fromIndex }));
    wired.add(pinKey({ node: edge.to, side: "in", index: edge.toIndex }));
  }
  return [...game.nodes.values()].flatMap((node) => pins(game, node)).filter((pin) => !wired.has(pinKey(pin)));
}

// How many signals one of a node's pins carries.
export function widthOf(game: Game, node: Node, pin: Pick<Pin, "side" | "index">): number {
  return nodeKind(game, node).pinWidth(pin.side, pin.index, node.width);
}

// The bit whose switch is at (x, y) on a bus input terminal, or null if
// there's no switch there.
export function switchAt(game: Game, node: Node, x: number, y: number): number | null {
  if (!nodeKind(game, node).clickable || node.width === 1) return null;
  const cell = Math.floor(x - node.rect.x - 1);
  const dy = y - (node.rect.y + node.rect.height / 2);
  if (cell < 0 || cell >= node.width || Math.abs(dy) > node.rect.height / 2) return null;
  return node.width - 1 - cell;
}

// Returns the pin nearest (x, y) within radius cells.
export function pinAt(game: Game, x: number, y: number, radius = 1): Pin | null {
  let best: Pin | null = null;
  let bestDistance = radius;
  for (const node of game.nodes.values()) {
    for (const pin of pins(game, node)) {
      const p = pinPosition(game, node, pin.side, pin.index);
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

// The board in dependency order, each node with the wire into each of its
// input pins and the position of that wire's source in the order. Without
// loops or memory parts, one pass in this order settles the board; with
// them, a pass reads the signals a later node gave on the pass before, and
// passes repeat until nothing changes.
interface Step {
  node: Node;
  kind: NodeKind;
  inputs: ({ edge: Edge; from: number } | null)[];
}

interface Plan {
  steps: Step[];
  // Whether one pass settles the board.
  once: boolean;
}

function plan(game: Game): Plan {
  const into = new Map<NodeID, Edge[]>();
  for (const edge of game.edges.values()) {
    const wires = into.get(edge.to) ?? [];
    wires[edge.toIndex] = edge;
    into.set(edge.to, wires);
  }
  const order: Node[] = [];
  const position = new Map<NodeID, number>();
  const visiting = new Set<NodeID>();
  // Wires that lead back to a node still being visited: the loops.
  const loops: Edge[] = [];
  const visit = (node: Node): void => {
    if (position.has(node.id)) return;
    visiting.add(node.id);
    // A wire back to a node still being visited closes a loop: that node's
    // signal comes from the pass before.
    into.get(node.id)?.forEach((edge) => {
      const from = wiredNode(game, edge.from);
      if (visiting.has(from.id) && !position.has(from.id)) loops.push(edge);
      else visit(from);
    });
    position.set(node.id, order.length);
    order.push(node);
  };
  for (const node of game.nodes.values()) visit(node);
  const steps = order.map((node): Step => {
    const kind = nodeKind(game, node);
    const inputs = Array.from({ length: kind.inputCount(node.width) }, (_, i) => {
      const edge = into.get(node.id)?.[i];
      return edge ? { edge, from: position.get(edge.from) ?? -1 } : null;
    });
    return { node, kind, inputs };
  });
  return { steps, once: loops.length === 0 && steps.every((step) => step.kind.next === undefined) };
}

// Every step's output values, the values into its input pins and its state,
// by position.
interface Signals {
  outputs: Value[][];
  inputs: Value[][];
  states: State[];
}

// One pass over a plan, changing signals in place. Input terminals take
// their values from source. Unwired input pins read 0. A memory part gives
// the outputs of the state it had, then takes its next state. Returns
// whether anything changed.
function pass(steps: Step[], signals: Signals, source: (node: Node) => Value): boolean {
  // Plain loops: this runs for every node on every row of a test run.
  let changed = false;
  for (const [i, { node, kind, inputs: wires }] of steps.entries()) {
    const values: Value[] = [];
    for (const w of wires) values.push(w ? (signals.outputs[w.from]?.[w.edge.fromIndex] ?? 0) : 0);
    signals.inputs[i] = values;
    const state = signals.states[i] ?? [];
    const outputs =
      kind.terminal === "input" ? [mask(source(node), node.width)] : kind.evaluate(values, node.width, state);
    if (kind.next) {
      const next = kind.next(values, state);
      if (next.length !== state.length || next.some((value, j) => value !== state[j])) changed = true;
      signals.states[i] = next;
    }
    const old = signals.outputs[i] ?? [];
    if (outputs.length !== old.length || outputs.some((value, pin) => value !== old[pin])) changed = true;
    signals.outputs[i] = outputs;
  }
  return changed;
}

// Settling gives up after this many passes per node: a loop that still
// changes by then keeps flipping its own signal.
const PASSES_PER_NODE = 2;

// Passes over a plan until nothing changes. Returns whether it settled.
function run(board: Plan, signals: Signals, source: (node: Node) => Value): boolean {
  if (board.once) {
    pass(board.steps, signals, source);
    return true;
  }
  const limit = PASSES_PER_NODE * board.steps.length + 2;
  for (let i = 0; i < limit; i++) if (!pass(board.steps, signals, source)) return true;
  return false;
}

// Recomputes every node and wire from the input terminals, starting from
// the signals the board has, so a loop holds its value.
function settle(game: Game): void {
  const board = plan(game);
  const { steps } = board;
  const signals: Signals = {
    outputs: steps.map((step) => step.node.signals),
    inputs: [],
    states: steps.map((step) => step.node.state),
  };
  game.stable = run(board, signals, (node) => node.signals[0] ?? 0);
  steps.forEach(({ node, kind, inputs: wires }, i) => {
    node.signals = signals.outputs[i] ?? [];
    node.state = signals.states[i] ?? [];
    const into = signals.inputs[i] ?? [];
    wires.forEach((w, pin) => {
      if (w) w.edge.value = into[pin] ?? 0;
    });
    node.isHigh = (kind.terminal === "output" ? into : node.signals).some((value) => value !== 0);
  });
}

// Runs many sets of input values through the board without changing it,
// much faster than setting the switches and settling each time. It starts
// where restart would leave the board, and each set of values carries on
// from the last, so a loop or memory part keeps its value between them. The
// returned function takes one value per input terminal in inputs and gives
// one value per output terminal in outputs (the value on its wire, or 0 if
// unwired) and whether the board settled. Loaded contents are the board's,
// unless contents gives others by node.
export function simulate(
  game: Game,
  inputs: NodeID[],
  outputs: NodeID[],
  contents: ReadonlyMap<NodeID, State> = new Map(),
): (values: Value[]) => { outputs: Value[]; stable: boolean } {
  const board = plan(game);
  const signals: Signals = {
    outputs: board.steps.map((step) => (step.kind.terminal === "input" ? step.node.signals : [])),
    inputs: [],
    states: board.steps.map(({ node, kind }) => (kind.keeps === true ? (contents.get(node.id) ?? node.state) : [])),
  };
  // Every input starts off, so no memory part takes anything in before the first values.
  run(board, signals, () => 0);
  const slot = new Map(inputs.map((id, i) => [id, i]));
  const lamps = outputs.map((id) => board.steps.findIndex((step) => step.node.id === id));
  return (values) => {
    const stable = run(board, signals, (node) => values[slot.get(node.id) ?? -1] ?? 0);
    return { outputs: lamps.map((i) => signals.inputs[i]?.[0] ?? 0), stable };
  };
}
