import { describe, expect, test } from "bun:test";
import { placeNode, wire, type Game, type Pin } from "./circuit";
import type { NodeID, NodeType } from "./node";
import { memoryProgress, Session } from "./session";

const out = (node: NodeID): Pin => ({ node, side: "out", index: 0 });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });
const find = (game: Game, type: NodeType) => [...game.nodes.values()].find((n) => n.type === type)!.id;

// Wires level 1 (NOT) with a single gate of the given type, both inputs from A.
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

function fresh(solved = 0) {
  const store = memoryProgress(solved);
  const session = new Session(store);
  session.start(0);
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
    expect(session.unlockedCount).toBe(1);
    runAll(session);
    expect(session.rowResults).toEqual([true, false]);
    expect(session.result?.passed).toBe(true);
    expect(session.solved).toBe(1);
    expect(session.unlockedCount).toBe(2);
    expect(store.load()).toBe(1);
  });

  test("failing doesn't unlock or save", () => {
    const { session, store } = fresh();
    runAll(session);
    expect(session.result?.passed).toBe(false);
    expect(session.solved).toBe(0);
    expect(store.load()).toBe(0);
  });

  test("re-solving an earlier level doesn't lower progress", () => {
    const { session, store } = fresh(2);
    buildNot(session.game);
    runAll(session);
    expect(session.result?.passed).toBe(true);
    expect(session.solved).toBe(2);
    expect(store.load()).toBe(2);
  });

  test("starting another level mid-test aborts without a result", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    session.beginTest();
    const run = session.run;
    session.step();
    session.start(1);
    expect(session.run).not.toBe(run);
    expect(session.testing).toBe(false);
    expect(session.step()).toBe(false);
    expect(session.result).toBeNull();
    expect(session.rowResults).toEqual([]);
    expect(session.solved).toBe(0);
    expect(store.load()).toBe(0);
  });

  test("forbidden gates fail", () => {
    const { session } = fresh();
    buildNot(session.game, "NOT");
    runAll(session);
    expect(session.rowResults).toEqual([true, false]);
    expect(session.result?.forbidden).toEqual(["NOT"]);
    expect(session.result?.passed).toBe(false);
    expect(session.solved).toBe(0);
  });

  test("progress loads from the store", () => {
    expect(new Session(memoryProgress(2)).unlockedCount).toBe(3);
  });
});
