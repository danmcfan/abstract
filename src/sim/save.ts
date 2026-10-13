import type { Edge, Game } from "./circuit";
import { DEFAULT_GRID, type Size } from "./grid";
import { LEVELS } from "./level";
import { kindOf, type Parts } from "./kind";
import type { Label, Node, NodeType, Value } from "./node";

// A saved game: how far the player has got, the level they're on, the board
// they left on each level, and story flags (such as which robot lines
// they've already heard).
export interface SaveData {
  solved: number;
  levelIndex: number;
  boards: Boards;
  flags: string[];
}

// Each level's board, by the gate the level builds.
export type Boards = Partial<Record<NodeType, SavedBoard>>;

export interface SavedBoard {
  nodes: Node[];
  edges: Edge[];
  nextNodeID: number;
  nextEdgeID: number;
  // Missing from saves written before levels could ask for a larger board.
  grid?: Size;
}

export interface SaveStore {
  load(): SaveData | null;
  save(data: SaveData): void;
  clear(): void;
}

// Reads back what it was given the way a stored save is read, so a save in
// an old shape loads as it would from the browser.
export function memorySave(initial: unknown = null): SaveStore {
  let value = initial;
  return {
    load: () => parseSave(structuredClone(value)),
    save: (data) => void (value = structuredClone(data)),
    clear: () => void (value = null),
  };
}

// Before saves held a board, progress was only a count of solved levels, and
// the NAND level didn't exist yet, so old counts are one level behind.
const LEGACY_KEY = "abstract.solved";

export function localSave(key = "abstract.save"): SaveStore {
  return {
    load: () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null && raw !== "") return parseSave(JSON.parse(raw));
        const legacy = Number(localStorage.getItem(LEGACY_KEY));
        return legacy > 0 ? { solved: legacy + 1, levelIndex: legacy + 1, boards: {}, flags: [] } : null;
      } catch {
        return null;
      }
    },
    save: (data) => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {}
    },
    clear: () => {
      try {
        localStorage.removeItem(key);
        localStorage.removeItem(LEGACY_KEY);
      } catch {}
    },
  };
}

export function saveBoard(game: Game): SavedBoard {
  return {
    nodes: [...game.nodes.values()].map((node) => Object.assign({}, node, { rect: { ...node.rect } })),
    edges: [...game.edges.values()].map((edge) => Object.assign({}, edge)),
    nextNodeID: game.nextNodeID,
    nextEdgeID: game.nextEdgeID,
    grid: { ...game.grid },
  };
}

// Before levels named their own terminals, inputs were ALPHA and BETA, the
// output was unnamed, and every node had a single signal. Before buses,
// signals were true or false, nodes had no width, and a wire's signal was
// isHigh rather than a value.
const LEGACY_LABELS: Record<string, Label> = { ALPHA: "A", BETA: "B", NONE: "" };

// A node or wire as an older save may hold it.
type OldNode = Omit<Node, "width"> & { width?: number };
type OldEdge = Omit<Edge, "value"> & { value?: Value; isHigh?: boolean };

function upgradeNode(node: OldNode, parts: Parts): Node {
  const kind = kindOf(parts, node.type);
  let label = LEGACY_LABELS[node.label] ?? node.label;
  if (kind.terminal === "output" && label === "") label = "OUT";
  const signals = Array.isArray(node.signals)
    ? node.signals.map(Number)
    : Array.from({ length: kind.outputCount(1) }, () => Number(node.isHigh));
  return { ...node, label, signals, width: node.width ?? 1, rect: { ...node.rect } };
}

function upgradeEdge(edge: OldEdge): Edge {
  const { isHigh, ...rest } = edge;
  return { ...rest, value: edge.value ?? Number(isHigh ?? false) };
}

// The board's nodes can be any of the given parts.
export function loadBoard(board: SavedBoard, parts: Parts): Game {
  return {
    nodes: new Map(board.nodes.map((node) => [node.id, upgradeNode(node, parts)])),
    edges: new Map(board.edges.map((edge) => [edge.id, upgradeEdge(edge)])),
    nextNodeID: board.nextNodeID,
    nextEdgeID: board.nextEdgeID,
    grid: { ...(board.grid ?? DEFAULT_GRID) },
    parts,
  };
}

// Only the arrays are checked; the rest of a board is trusted as saved.
function isBoard(board: unknown): board is SavedBoard {
  return (
    typeof board === "object" &&
    board !== null &&
    "nodes" in board &&
    Array.isArray(board.nodes) &&
    "edges" in board &&
    Array.isArray(board.edges)
  );
}

// Anything that doesn't look like a save reads as no save, and a board that
// doesn't look like a board is dropped. Saves from before each level kept
// its own board held one board, for the level they were on.
function parseSave(value: unknown): SaveData | null {
  if (typeof value !== "object" || value === null) return null;
  const v: { solved?: unknown; levelIndex?: unknown; boards?: unknown; board?: unknown; flags?: unknown } = value;
  if (typeof v.solved !== "number" || typeof v.levelIndex !== "number") return null;
  const boards: Boards = {};
  if (typeof v.boards === "object" && v.boards !== null) {
    for (const [gate, board] of Object.entries(v.boards))
      if (LEVELS.some((level) => level.gate === gate) && isBoard(board)) boards[gate] = board;
  }
  const legacy = LEVELS[v.levelIndex];
  if (isBoard(v.board) && legacy !== undefined) boards[legacy.gate] = v.board;
  const flags = Array.isArray(v.flags) ? v.flags.filter((f) => typeof f === "string") : [];
  return { solved: v.solved, levelIndex: v.levelIndex, boards, flags };
}
