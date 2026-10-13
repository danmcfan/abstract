import type { Edge, Game } from "./circuit";
import { DEFAULT_GRID, type Size } from "./grid";
import { outputCount, type Label, type Node } from "./node";

// A saved game: how far the player has got, the board they were working on,
// and story flags (such as which robot lines they've already heard).
export interface SaveData {
  solved: number;
  levelIndex: number;
  board: SavedBoard | null;
  flags: string[];
}

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

export function memorySave(initial: SaveData | null = null): SaveStore {
  let value = initial;
  return {
    load: () => value && structuredClone(value),
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
        if (raw) return parseSave(JSON.parse(raw));
        const legacy = Number(localStorage.getItem(LEGACY_KEY));
        return legacy > 0 ? { solved: legacy + 1, levelIndex: legacy + 1, board: null, flags: [] } : null;
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
    nodes: [...game.nodes.values()].map((node) => ({ ...node, rect: { ...node.rect } })),
    edges: [...game.edges.values()].map((edge) => ({ ...edge })),
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

function upgradeNode(node: Node): Node {
  let label = LEGACY_LABELS[node.label] ?? node.label;
  if (node.type === "OUTPUT" && label === "") label = "OUT";
  const signals = Array.isArray(node.signals)
    ? node.signals.map(Number)
    : Array.from({ length: outputCount(node.type) }, () => Number(node.isHigh));
  return { ...node, label, signals, width: node.width ?? 1, rect: { ...node.rect } };
}

function upgradeEdge(edge: Edge & { isHigh?: boolean }): Edge {
  const { isHigh, ...rest } = edge;
  return { ...rest, value: edge.value ?? Number(isHigh ?? false) };
}

export function loadBoard(board: SavedBoard): Game {
  return {
    nodes: new Map(board.nodes.map((node) => [node.id, upgradeNode(node)])),
    edges: new Map(board.edges.map((edge) => [edge.id, upgradeEdge(edge)])),
    nextNodeID: board.nextNodeID,
    nextEdgeID: board.nextEdgeID,
    grid: { ...(board.grid ?? DEFAULT_GRID) },
  };
}

// Anything that doesn't look like a save reads as no save.
function parseSave(value: unknown): SaveData | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<SaveData>;
  if (typeof v.solved !== "number" || typeof v.levelIndex !== "number") return null;
  const board = v.board && Array.isArray(v.board.nodes) && Array.isArray(v.board.edges) ? v.board : null;
  const flags = Array.isArray(v.flags) ? v.flags.filter((f) => typeof f === "string") : [];
  return { solved: v.solved, levelIndex: v.levelIndex, board, flags };
}
