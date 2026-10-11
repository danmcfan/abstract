import { evaluate, inputCount, outputCount, type Edge, type EdgeID, type Game, type Node, type NodeID } from "./node";

// A connection point on a node. Input pins sit on the left edge, the output
// pin on the right edge.
export interface Pin {
  node: NodeID;
  side: "in" | "out";
  index: number;
}

export function pinPosition(node: Node, side: Pin["side"], index: number): { x: number; y: number } {
  const { x, y, width, height } = node.rect;
  if (side === "out") return { x: x + width, y: y + height / 2 };
  if (inputCount(node.type) === 1) return { x, y: y + height / 2 };
  return { x, y: y + 1 + index * (height - 2) };
}

export function pins(node: Node): Pin[] {
  const result: Pin[] = [];
  for (let i = 0; i < inputCount(node.type); i++) result.push({ node: node.id, side: "in", index: i });
  for (let i = 0; i < outputCount(node.type); i++) result.push({ node: node.id, side: "out", index: i });
  return result;
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

export function edgeInto(game: Game, node: NodeID, index: number): Edge | undefined {
  for (const edge of game.edges.values()) {
    if (edge.to === node && edge.toIndex === index) return edge;
  }
  return undefined;
}

// Wires an output pin to an input pin, in either order. An input pin takes
// one wire, so an existing wire into it is replaced. Refuses wires that
// would form a loop. Returns the new edge, or null if refused.
export function connect(game: Game, a: Pin, b: Pin): Edge | null {
  const [from, to] = a.side === "out" ? [a, b] : [b, a];
  if (from.side !== "out" || to.side !== "in" || from.node === to.node) return null;
  if (reaches(game, to.node, from.node)) return null;

  disconnect(game, to);
  const edge: Edge = {
    id: game.nextEdgeID++,
    from: from.node,
    fromIndex: from.index,
    to: to.node,
    toIndex: to.index,
    isHigh: false,
  };
  game.edges.set(edge.id, edge);
  game.nodes.get(from.node)?.edges.push(edge.id);
  game.nodes.get(to.node)?.edges.push(edge.id);
  return edge;
}

// Removes the wire into an input pin, if any.
export function disconnect(game: Game, pin: Pin): void {
  const edge = edgeInto(game, pin.node, pin.index);
  if (edge) removeEdge(game, edge.id);
}

function removeEdge(game: Game, id: EdgeID): void {
  const edge = game.edges.get(id);
  if (!edge) return;
  for (const nodeID of [edge.from, edge.to]) {
    const node = game.nodes.get(nodeID);
    if (node) node.edges = node.edges.filter((e) => e !== id);
  }
  game.edges.delete(id);
}

// Whether signals flow from start to target along wires.
function reaches(game: Game, start: NodeID, target: NodeID): boolean {
  const seen = new Set<NodeID>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of game.edges.values()) {
      if (edge.from === id) stack.push(edge.to);
    }
  }
  return false;
}

// Recomputes every node and wire from the INPUT terminals. Unwired input pins
// read low. The circuit has no loops, so one pass in dependency order settles it.
export function propagate(game: Game): void {
  const done = new Set<NodeID>();
  const visit = (node: Node): void => {
    if (done.has(node.id)) return;
    done.add(node.id);
    if (node.type === "INPUT") return;
    const inputs = [false, false];
    for (const edgeID of node.edges) {
      const edge = game.edges.get(edgeID);
      if (!edge || edge.to !== node.id) continue;
      const from = game.nodes.get(edge.from);
      if (!from) continue;
      visit(from);
      edge.isHigh = from.isHigh;
      inputs[edge.toIndex] = from.isHigh;
    }
    node.isHigh = evaluate(node.type, inputs[0]!, inputs[1]!);
  };
  for (const node of game.nodes.values()) visit(node);
}
