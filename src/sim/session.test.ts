import { describe, expect, test } from "bun:test";
import { moveNode, placeNode, setInput, wire, type Game, type Pin } from "./circuit";
import type { NodeID, NodeType } from "./node";
import { memorySave, type SaveData } from "./save";
import { Session } from "./session";

const out = (node: NodeID): Pin => ({ node, side: "out", index: 0 });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });
const find = (game: Game, type: NodeType) => [...game.nodes.values()].find((n) => n.type === type)!.id;

// Wires the NOT level with a single gate of the given type, both inputs from A.
function buildNot(game: Game, type: NodeType = "NAND") {
  const a = find(game, "INPUT");
  const g = placeNode(game, type, { x: 20, y: 10 })!.id;
  wire(game, out(a), inp(g, 0));
  if (type === "NAND") wire(game, out(a), inp(g, 1));
  wire(game, out(g), inp(find(game, "OUTPUT")));
}

function runAll(session: Session) {
  session.beginTest();
  while (session.step());
}

const NOT_LEVEL = 1;
const saved = (solved: number, levelIndex = solved): SaveData => ({ solved, levelIndex, boards: {}, flags: [] });

// A session on the NOT level, with the NAND level already solved.
function fresh(solved = 1) {
  const store = memorySave(saved(solved));
  const session = new Session(store);
  session.start(NOT_LEVEL);
  return { session, store };
}

describe("session", () => {
  test("stepping reports each row's actual output", () => {
    const { session } = fresh();
    expect(session.beginTest()).toBe(true);
    expect(session.beginTest()).toBe(false);
    expect(session.step()).toBe(true);
    expect(session.currentRow).toBe(0);
    expect(session.rowResults).toEqual([[0]]);
    expect(session.step()).toBe(true);
    expect(session.rowResults).toEqual([[0], [0]]);
    expect(session.step()).toBe(false);
    expect(session.testing).toBe(false);
    expect(session.currentRow).toBeNull();
    expect(session.result?.passed).toBe(false);
  });

  test("passing unlocks the next level and saves progress", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    expect(session.unlockedCount).toBe(2);
    runAll(session);
    expect(session.rowResults).toEqual([[1], [0]]);
    expect(session.result?.passed).toBe(true);
    expect(session.solved).toBe(2);
    expect(session.unlockedCount).toBe(3);
    expect(store.load()?.solved).toBe(2);
  });

  test("failing doesn't unlock or save", () => {
    const { session, store } = fresh();
    runAll(session);
    expect(session.result?.passed).toBe(false);
    expect(session.solved).toBe(1);
    expect(store.load()?.solved).toBe(1);
  });

  test("re-solving an earlier level doesn't lower progress", () => {
    const { session, store } = fresh(3);
    buildNot(session.game);
    runAll(session);
    expect(session.result?.passed).toBe(true);
    expect(session.solved).toBe(3);
    expect(store.load()?.solved).toBe(3);
  });

  test("starting another level mid-test aborts without a result", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    session.beginTest();
    const run = session.run;
    session.step();
    session.start(0);
    expect(session.run).not.toBe(run);
    expect(session.testing).toBe(false);
    expect(session.step()).toBe(false);
    expect(session.result).toBeNull();
    expect(session.rowResults).toEqual([]);
    expect(session.solved).toBe(1);
    expect(store.load()?.solved).toBe(1);
  });

  test("forbidden gates fail", () => {
    const { session } = fresh();
    buildNot(session.game, "NOT");
    runAll(session);
    expect(session.rowResults).toEqual([[1], [0]]);
    expect(session.result?.forbidden).toEqual(["NOT"]);
    expect(session.result?.passed).toBe(false);
    expect(session.solved).toBe(1);
  });

  test("a passing run stamps the sheet", () => {
    const { session } = fresh();
    buildNot(session.game);
    expect(session.stamped).toBe(false);
    session.beginTest();
    session.step();
    expect(session.stamped).toBe(false);
    while (session.step());
    expect(session.stamped).toBe(true);
  });

  test("passing a level already solved stamps it again", () => {
    const { session } = fresh(3);
    buildNot(session.game);
    runAll(session);
    expect(session.stamped).toBe(true);
  });

  test("a failing run doesn't stamp", () => {
    const { session } = fresh();
    runAll(session);
    expect(session.result?.passed).toBe(false);
    expect(session.stamped).toBe(false);
  });

  test("the stamp comes off when the board changes", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    runAll(session);
    session.edit((game) => placeNode(game, "NAND", { x: 30, y: 20 }));
    expect(session.stamped).toBe(false);
    expect(session.result?.passed).toBe(true);
    expect(store.load()?.boards.NOT?.nodes.length).toBe(4);
  });

  test("the stamp stays through an edit that leaves the board as it was", () => {
    const { session } = fresh();
    buildNot(session.game);
    runAll(session);
    const nand = find(session.game, "NAND");
    const a = find(session.game, "INPUT");
    session.edit((game) => {
      setInput(game, nand, 1);
    });
    session.edit((game) => wire(game, out(nand), out(a)));
    const onA = session.game.nodes.get(a)!.rect;
    session.edit((game) => moveNode(game, nand, onA.x, onA.y));
    expect(session.stamped).toBe(true);
  });

  test("the stamp comes off when a new run starts", () => {
    const { session } = fresh();
    buildNot(session.game);
    runAll(session);
    session.beginTest();
    expect(session.stamped).toBe(false);
  });

  test("the stamp comes off on another level", () => {
    const { session } = fresh();
    buildNot(session.game);
    runAll(session);
    session.start(0);
    expect(session.stamped).toBe(false);
  });

  test("progress loads from the store", () => {
    expect(new Session(memorySave(saved(2))).unlockedCount).toBe(3);
  });
});

describe("saved games", () => {
  test("resume restores the level, the board in progress and the flags", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    session.flags.add("heard:hello");
    session.save();
    const edges = session.game.edges.size;

    const later = new Session(store);
    expect(later.hasSave).toBe(true);
    later.resume();
    expect(later.levelIndex).toBe(NOT_LEVEL);
    expect(later.game.edges.size).toBe(edges);
    expect(later.flags.has("heard:hello")).toBe(true);
    runAll(later);
    expect(later.result?.passed).toBe(true);
  });

  test("a save from before each level kept its own board loads that board on its level", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    session.save();
    const { boards, ...rest } = store.load()!;
    const old = { ...rest, board: boards.NOT };

    const later = new Session(memorySave(old));
    later.resume();
    expect(later.levelIndex).toBe(NOT_LEVEL);
    expect(later.game.edges.size).toBe(3);
    later.start(0);
    later.start(NOT_LEVEL);
    expect(later.game.edges.size).toBe(3);
  });

  test("a save from before levels named their terminals resumes with its board intact", () => {
    // The AND level, part built: A and B into a NAND, written when inputs
    // were ALPHA and BETA, the output had no name, and nodes had no signals.
    const rect = (x: number, y: number, width = 4) => ({ x, y, width, height: 4 });
    const old = {
      solved: 2,
      levelIndex: 2,
      flags: [],
      board: {
        nodes: [
          { id: 0, type: "INPUT", label: "ALPHA", rect: rect(2, 12), isHigh: true },
          { id: 1, type: "INPUT", label: "BETA", rect: rect(2, 24), isHigh: true },
          { id: 2, type: "OUTPUT", label: "NONE", rect: rect(42, 18), isHigh: false },
          { id: 3, type: "NAND", label: "NONE", rect: rect(16, 18, 6), isHigh: false },
        ],
        edges: [
          { id: 0, from: 0, fromIndex: 0, to: 3, toIndex: 0, isHigh: true },
          { id: 1, from: 1, fromIndex: 0, to: 3, toIndex: 1, isHigh: true },
        ],
        nextNodeID: 4,
        nextEdgeID: 2,
      },
    } as unknown as SaveData;
    const session = new Session(memorySave(old));
    session.resume();
    expect(session.levelIndex).toBe(2);
    const nodes = [...session.game.nodes.values()];
    expect(nodes.map((n) => [n.type, n.label])).toEqual([
      ["INPUT", "A"],
      ["INPUT", "B"],
      ["OUTPUT", "OUT"],
      ["NAND", ""],
    ]);
    expect(session.game.edges.size).toBe(2);
    expect(nodes[0]!.isHigh).toBe(true);

    const not = placeNode(session.game, "NOT", { x: 30, y: 20 })!.id;
    wire(session.game, out(3), inp(not));
    wire(session.game, out(not), inp(2));
    runAll(session);
    expect(session.result?.passed).toBe(true);
  });

  test("resume never lands past the unlocked levels", () => {
    const session = new Session(memorySave(saved(1, 3)));
    session.resume();
    expect(session.levelIndex).toBe(1);
    expect(session.game.edges.size).toBe(0);
  });

  test("reset throws the old game away", () => {
    const { session, store } = fresh(3);
    session.flags.add("heard:hello");
    session.reset();
    expect(session.levelIndex).toBe(0);
    expect(session.solved).toBe(0);
    expect(session.flags.size).toBe(0);
    expect(store.load()?.solved).toBe(0);
  });

  test("a board that doesn't look like a board is dropped, keeping the rest of the save", () => {
    const session = new Session(
      memorySave({ solved: 2, levelIndex: 1, boards: { NOT: 7, AND: { nodes: "x" } }, flags: [] }),
    );
    session.resume();
    expect(session.levelIndex).toBe(1);
    expect(session.solved).toBe(2);
    expect(session.game.edges.size).toBe(0);
  });

  test("no save means nothing to continue", () => {
    const session = new Session(memorySave());
    expect(session.hasSave).toBe(false);
    session.resume();
    expect(session.levelIndex).toBe(0);
    expect(session.hasSave).toBe(true);
  });
});

describe("one board per level", () => {
  const AND_LEVEL = 2;

  test("leaving a half-built level and coming back restores its board", () => {
    const { session } = fresh(2);
    const a = find(session.game, "INPUT");
    const g = placeNode(session.game, "NAND", { x: 20, y: 10 })!.id;
    wire(session.game, out(a), inp(g, 0));
    session.save();

    session.start(AND_LEVEL);
    placeNode(session.game, "NOT", { x: 20, y: 10 });
    session.save();
    expect(session.game.edges.size).toBe(0);

    session.start(NOT_LEVEL);
    expect(session.game.nodes.has(g)).toBe(true);
    expect(session.game.edges.size).toBe(1);
    session.start(AND_LEVEL);
    expect([...session.game.nodes.values()].some((n) => n.type === "NOT")).toBe(true);
  });

  test("a solved level's board is restored too", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    session.save();
    runAll(session);
    expect(session.result?.passed).toBe(true);
    session.start(AND_LEVEL);

    const later = new Session(store);
    later.resume();
    expect(later.levelIndex).toBe(AND_LEVEL);
    later.start(NOT_LEVEL);
    expect(later.game.edges.size).toBe(3);
    runAll(later);
    expect(later.result?.passed).toBe(true);
  });

  test("a level's board comes back with its bus widths and signal values", () => {
    const { session } = fresh(2);
    session.place("SPLIT", 4);
    setInput(session.game, find(session.game, "INPUT"), 1);
    session.save();
    const board = () => [...session.game.nodes.values()].map(({ type, width, signals }) => ({ type, width, signals }));
    const before = board();
    const grid = { ...session.game.grid };
    expect(before.find((n) => n.type === "SPLIT")?.width).toBe(4);

    session.start(AND_LEVEL);
    session.start(NOT_LEVEL);
    expect(board()).toEqual(before);
    expect(session.game.grid).toEqual(grid);
  });

  test("a level never visited opens on a fresh board", () => {
    const { session } = fresh(2);
    session.start(AND_LEVEL);
    expect([...session.game.nodes.values()].map((n) => n.type)).toEqual(["INPUT", "INPUT", "OUTPUT"]);
  });

  test("clear replaces only the current level's board", () => {
    const { session, store } = fresh(2);
    buildNot(session.game);
    session.save();
    session.start(AND_LEVEL);
    placeNode(session.game, "NOT", { x: 20, y: 10 });
    session.save();

    session.clear();
    expect(session.levelIndex).toBe(AND_LEVEL);
    expect(session.game.nodes.size).toBe(3);
    expect(store.load()?.boards.AND?.nodes.length).toBe(3);
    session.start(NOT_LEVEL);
    expect(session.game.edges.size).toBe(3);
  });

  test("clear aborts a test run without a result", () => {
    const { session } = fresh();
    buildNot(session.game);
    session.beginTest();
    session.step();
    session.clear();
    expect(session.testing).toBe(false);
    expect(session.result).toBeNull();
    expect(session.game.edges.size).toBe(0);
  });
});
