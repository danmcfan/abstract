import { restart, type Edge, type Game } from "./circuit";
import { DEFAULT_GRID, type Size } from "./grid";
import { LEVELS, PARTS } from "./level";
import { hasKind, kindOf, type Parts } from "./kind";
import type { Label, Node, NodeType, Value } from "./node";

// A saved game: the levels the player has solved and the one they're on,
// each by the gate it builds, so a save still means the same levels after a
// level is added or moved; the board they left on each level; and story
// flags (such as which robot lines they've already heard).
export interface SaveData {
  solved: NodeType[];
  open: NodeType;
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
        return legacy > 0 ? parseSave({ solved: legacy + 1, levelIndex: legacy + 1 }) : null;
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
type OldNode = Omit<Node, "width" | "state"> & { width?: number };
type OldEdge = Omit<Edge, "value"> & { value?: Value; isHigh?: boolean };

function upgradeNode(node: OldNode, parts: Parts): Node {
  const kind = kindOf(parts, node.type);
  let label = LEGACY_LABELS[node.label] ?? node.label;
  if (kind.terminal === "output" && label === "") label = "OUT";
  const signals = Array.isArray(node.signals)
    ? node.signals.map(Number)
    : Array.from({ length: kind.outputCount(1) }, () => Number(node.isHigh));
  return { ...node, label, signals, width: node.width ?? 1, rect: { ...node.rect }, state: 0 };
}

function upgradeEdge(edge: OldEdge): Edge {
  const { isHigh, ...rest } = edge;
  return { ...rest, value: edge.value ?? Number(isHigh ?? false) };
}

// The board's nodes can be any of the given parts. Every memory part starts
// at 0, so the board restarts from its switches.
export function loadBoard(board: SavedBoard, parts: Parts): Game {
  const game: Game = {
    nodes: new Map(board.nodes.map((node) => [node.id, upgradeNode(node, parts)])),
    edges: new Map(board.edges.map((edge) => [edge.id, upgradeEdge(edge)])),
    nextNodeID: board.nextNodeID,
    nextEdgeID: board.nextEdgeID,
    grid: { ...(board.grid ?? DEFAULT_GRID) },
    parts,
    stable: true,
  };
  restart(game);
  return game;
}

// Only the arrays and the node kinds are checked; the rest of a board is
// trusted as saved. A node of a kind the game no longer has would make the
// board unloadable.
function isBoard(board: unknown): board is SavedBoard {
  return (
    typeof board === "object" &&
    board !== null &&
    "nodes" in board &&
    Array.isArray(board.nodes) &&
    board.nodes.every((node: unknown) => isKnownNode(node)) &&
    "edges" in board &&
    Array.isArray(board.edges)
  );
}

function isKnownNode(node: unknown): boolean {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    typeof node.type === "string" &&
    hasKind(PARTS, node.type)
  );
}

// Saves from before progress was kept by gate held a count of solved levels
// and the open level's position, both in LEVELS as it was then. No level
// has been added or moved since, so today's LEVELS reads them.
function progress(v: {
  solved?: unknown;
  open?: unknown;
  levelIndex?: unknown;
}): Pick<SaveData, "solved" | "open"> | null {
  if (Array.isArray(v.solved) && typeof v.open === "string")
    return { solved: v.solved.filter((gate) => typeof gate === "string"), open: v.open };
  if (typeof v.solved !== "number" || typeof v.levelIndex !== "number") return null;
  const open = LEVELS[v.levelIndex] ?? LEVELS[0];
  if (open === undefined) return null;
  return { solved: LEVELS.slice(0, v.solved).map((level) => level.gate), open: open.gate };
}

// Anything that doesn't look like a save reads as no save, and a board that
// doesn't look like a board is dropped. Saves from before each level kept
// its own board held one board, for the level they were on.
function parseSave(value: unknown): SaveData | null {
  if (typeof value !== "object" || value === null) return null;
  const v: {
    solved?: unknown;
    open?: unknown;
    levelIndex?: unknown;
    boards?: unknown;
    board?: unknown;
    flags?: unknown;
  } = value;
  const saved = progress(v);
  if (saved === null) return null;
  const boards: Boards = {};
  if (typeof v.boards === "object" && v.boards !== null) {
    for (const [gate, board] of Object.entries(v.boards))
      if (LEVELS.some((level) => level.gate === gate) && isBoard(board)) boards[gate] = board;
  }
  if (isBoard(v.board)) boards[saved.open] = v.board;
  const flags = Array.isArray(v.flags) ? v.flags.filter((f) => typeof f === "string") : [];
  return { ...saved, boards, flags };
}
