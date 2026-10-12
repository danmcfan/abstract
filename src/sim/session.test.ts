import { describe, expect, test } from "bun:test";
import { placeNode, wire, type Game, type Pin } from "./circuit";
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
const saved = (solved: number, levelIndex = solved): SaveData => ({ solved, levelIndex, board: null, flags: [] });

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
    expect(session.rowResults).toEqual([false]);
    expect(session.step()).toBe(true);
    expect(session.rowResults).toEqual([false, false]);
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
    expect(session.rowResults).toEqual([true, false]);
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
    expect(session.rowResults).toEqual([true, false]);
    expect(session.result?.forbidden).toEqual(["NOT"]);
    expect(session.result?.passed).toBe(false);
    expect(session.solved).toBe(1);
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

  test("no save means nothing to continue", () => {
    const session = new Session(memorySave());
    expect(session.hasSave).toBe(false);
    session.resume();
    expect(session.levelIndex).toBe(0);
    expect(session.hasSave).toBe(true);
  });
});
