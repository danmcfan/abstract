import { restart, type Edge, type Game } from "./circuit";
import { DEFAULT_GRID, type Size } from "./grid";
import { INSTRUCTIONS, OPCODES, type InstructionRow, type InstructionSet } from "./instruction";
import { circuits, LEVELS, levelId, PARTS, revisionOf, type Solved } from "./level";
import { hasKind, kindOf, type Parts } from "./kind";
import type { Label, Node, NodeType, Value } from "./node";

// A saved game: the levels the player has solved and the one they're on,
// each by the gate it builds, so a save still means the same levels after a
// level is added or moved; the board they left on each level; and story
// flags (such as which robot lines they've already heard); and the clock
// speed they set, missing from saves written before the gauge; and their
// instruction set as it stands, with the last one that was good, which
// everything after L7 reads. Saves from before L7 have neither. Then the
// door program's text, and whether the door has opened, which ends the game.
export interface SaveData {
  solved: Solved;
  open: NodeType;
  boards: Boards;
  flags: string[];
  clockSpeed?: number;
  instructionSet?: InstructionSet;
  validInstructionSet?: InstructionSet;
  doorProgram?: string;
  finished?: boolean;
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
  return { ...node, label, signals, width: node.width ?? 1, rect: { ...node.rect }, state: [] };
}

// ADD/SUB's output used to be labelled OUT, before the adders named theirs
// SUM and COUT. A board saved then still has the old label, which the test
// run would never find.
function relabelAddSub(board: SavedBoard): SavedBoard {
  const nodes = board.nodes.map((node) =>
    node.type === "OUTPUT" && node.label === "OUT" ? { ...node, label: "SUM" } : node,
  );
  return { ...board, nodes };
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

// Only the arrays, the node kinds and the nodes each wire names are
// checked; the rest of a board is trusted as saved. A node of a kind the
// game no longer has, or a wire to a node that isn't there, would make the
// board unloadable.
function isBoard(board: unknown): board is SavedBoard {
  if (typeof board !== "object" || board === null || !("nodes" in board) || !("edges" in board)) return false;
  const { nodes, edges } = board;
  if (!Array.isArray(nodes) || !nodes.every((node: unknown) => isKnownNode(node))) return false;
  const ids = new Set(nodes.map((node: { id?: unknown }) => node.id));
  return Array.isArray(edges) && edges.every((edge: unknown) => wiresNodesIn(edge, ids));
}

function wiresNodesIn(edge: unknown, ids: Set<unknown>): boolean {
  if (typeof edge !== "object" || edge === null) return false;
  const ends: { from?: unknown; to?: unknown } = edge;
  return ids.has(ends.from) && ids.has(ends.to);
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

// A save as stored, before any of it is checked.
interface RawSave {
  solved?: unknown;
  open?: unknown;
  levelIndex?: unknown;
  boards?: unknown;
  board?: unknown;
  flags?: unknown;
  clockSpeed?: unknown;
  instructionSet?: unknown;
  validInstructionSet?: unknown;
  doorProgram?: unknown;
  finished?: unknown;
}

// Saves from before progress was kept by gate held a count of solved levels
// and the open level's position, both in LEVELS as it was then. No level
// had been added or moved by the time progress moved to gates, so today's
// LEVELS reads them, at each level's first revision. A position past the
// last level opens the last.
function readProgress(v: RawSave): Pick<SaveData, "solved" | "open"> | null {
  if (typeof v.solved === "object" && v.solved !== null && typeof v.open === "string") {
    const solved: Solved = {};
    for (const [gate, revision] of Object.entries(v.solved)) if (typeof revision === "number") solved[gate] = revision;
    return { solved, open: v.open };
  }
  if (typeof v.solved !== "number" || typeof v.levelIndex !== "number") return null;
  const open = LEVELS[Math.min(Math.max(v.levelIndex, 0), LEVELS.length - 1)];
  if (open === undefined) return null;
  const solved = Object.fromEntries(LEVELS.slice(0, v.solved).map((level) => [levelId(level), revisionOf(level)]));
  return { solved, open: levelId(open) };
}

// Anything that doesn't look like a save reads as no save, and a board that
// doesn't look like a board is dropped. Saves from before each level kept
// its own board held one board, for the level they were on.
function parseSave(value: unknown): SaveData | null {
  if (typeof value !== "object" || value === null) return null;
  const v: RawSave = value;
  const saved = readProgress(v);
  if (saved === null) return null;
  const boards: Boards = {};
  if (typeof v.boards === "object" && v.boards !== null) {
    for (const [gate, board] of Object.entries(v.boards))
      if (circuits(LEVELS).some((level) => level.gate === gate) && isBoard(board))
        boards[gate] = gate === "ADD/SUB" ? relabelAddSub(board) : board;
  }
  if (isBoard(v.board)) boards[saved.open] = v.board;
  const flags = Array.isArray(v.flags) ? v.flags.filter((f) => typeof f === "string") : [];
  const clock = typeof v.clockSpeed === "number" && Number.isFinite(v.clockSpeed) ? { clockSpeed: v.clockSpeed } : {};
  const table = readInstructionSet(v.instructionSet);
  const valid = readInstructionSet(v.validInstructionSet);
  return {
    ...saved,
    boards,
    flags,
    ...clock,
    ...(table && { instructionSet: table }),
    ...(valid && { validInstructionSet: valid }),
    ...(typeof v.doorProgram === "string" && { doorProgram: v.doorProgram }),
    ...(v.finished === true && { finished: true }),
  };
}

// Keeps each row of a saved instruction set that looks like a row; the
// rest read as blank.
function readInstructionSet(value: unknown): InstructionSet | null {
  if (typeof value !== "object" || value === null) return null;
  const rows: Record<string, unknown> = { ...value };
  const set: InstructionSet = {};
  for (const { id } of INSTRUCTIONS) {
    const row = readRow(rows[id]);
    if (row) set[id] = row;
  }
  return set;
}

function readRow(row: unknown): InstructionRow | null {
  if (typeof row !== "object" || row === null || !("mnemonic" in row) || !("opcode" in row)) return null;
  const { mnemonic, opcode } = row;
  if (typeof mnemonic !== "string") return null;
  if (opcode === null) return { mnemonic, opcode };
  if (typeof opcode !== "number" || !Number.isInteger(opcode) || opcode < 0 || opcode >= OPCODES) return null;
  return { mnemonic, opcode };
}
