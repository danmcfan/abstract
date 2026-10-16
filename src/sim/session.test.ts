import { describe, expect, test } from "bun:test";
import { moveNode, placeNode, setInput, wire, type Game, type Pin } from "./circuit";
import type { Node, NodeID, NodeType } from "./node";
import type { Rect } from "./grid";
import { memorySave, type SaveData, type SaveStore } from "./save";
import { Driver, TEST_STEP_MS, type Scheduler } from "./driver";
import { CLOCK_SPEED, Session } from "./session";
import { buildSolution, layerOf, LEVELS, type Level, circuitAt, levelId } from "./level";
import { recordingSound } from "./sound";

const out = (node: NodeID): Pin => ({ node, side: "out", index: 0 });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });
const terminal = (game: Game, label: string): NodeID => [...game.nodes.values()].find((n) => n.label === label)!.id;
const find = (game: Game, type: NodeType): NodeID => [...game.nodes.values()].find((n) => n.type === type)!.id;

// Wires the NOT level with a single gate of the given type, both inputs from A.
function buildNot(game: Game, type: NodeType = "NAND"): void {
  const a = find(game, "INPUT");
  const g = placeNode(game, type, { x: 20, y: 10 })!.id;
  wire(game, out(a), inp(g, 0));
  if (type === "NAND") wire(game, out(a), inp(g, 1));
  wire(game, out(g), inp(find(game, "OUTPUT")));
}

// What the tested rows of the level panel's table gave, in order.
const tested = (session: Session): number[][] => session.rows.flatMap((row) => (row.actual ? [row.actual] : []));

function runAll(session: Session): void {
  session.beginTest();
  while (session.step());
}

const NOT_LEVEL = 1;
// A save with the first `solved` of levels solved, open on level `open`.
const saved = (solved: number, open = solved, levels: Level[] = LEVELS): SaveData => ({
  solved: Object.fromEntries(levels.slice(0, solved).map((level) => [levelId(level), level.revision ?? 1])),
  open: levelId(levels[open]!),
  boards: {},
  flags: [],
});

// A session on the NOT level, with the NAND level already solved.
function fresh(solved = 1): { session: Session; store: SaveStore } {
  const store = memorySave(saved(solved));
  const session = new Session(store);
  session.start(NOT_LEVEL);
  return { session, store };
}

const rect = (x: number, y: number, width = 4): Rect => ({ x, y, width, height: 4 });

describe("session", () => {
  test("stepping reports each row's actual output", () => {
    const { session } = fresh();
    expect(session.beginTest()).toBe(true);
    expect(session.beginTest()).toBe(false);
    expect(session.step()).toBe(true);
    expect(session.currentRow).toBe(0);
    expect(tested(session)).toEqual([[0]]);
    expect(session.step()).toBe(true);
    expect(tested(session)).toEqual([[0], [0]]);
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
    expect(tested(session)).toEqual([[1], [0]]);
    expect(session.result?.passed).toBe(true);
    expect(session.solved).toBe(2);
    expect(session.unlockedCount).toBe(3);
    expect(store.load()?.solved).toEqual({ NAND: 1, NOT: 1 });
  });

  test("failing doesn't unlock or save", () => {
    const { session, store } = fresh();
    runAll(session);
    expect(session.result?.passed).toBe(false);
    expect(session.solved).toBe(1);
    expect(store.load()?.solved).toEqual({ NAND: 1 });
  });

  test("re-solving an earlier level doesn't lower progress", () => {
    const { session, store } = fresh(3);
    buildNot(session.game);
    runAll(session);
    expect(session.result?.passed).toBe(true);
    expect(session.solved).toBe(3);
    expect(store.load()?.solved).toEqual({ NAND: 1, NOT: 1, AND: 1 });
  });

  test("starting another level mid-test aborts without a result", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    session.beginTest();
    session.step();
    session.start(0);
    expect(session.testing).toBe(false);
    expect(session.step()).toBe(false);
    expect(session.result).toBeNull();
    expect(tested(session)).toEqual([]);
    expect(session.solved).toBe(1);
    expect(store.load()?.solved).toEqual({ NAND: 1 });
  });

  test("forbidden gates fail", () => {
    const { session } = fresh();
    buildNot(session.game, "NOT");
    runAll(session);
    expect(tested(session)).toEqual([[1], [0]]);
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
    session.edit((game) => {
      placeNode(game, "NAND", { x: 30, y: 20 });
    });
    expect(session.stamped).toBe(false);
    expect(session.result?.passed).toBe(true);
    expect(store.load()?.boards["NOT"]?.nodes.length).toBe(4);
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
    session.edit((game) => {
      wire(game, out(nand), out(a));
    });
    const onA = session.game.nodes.get(a)!.rect;
    session.edit((game) => {
      moveNode(game, nand, onA.x, onA.y);
    });
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
    const old = { ...rest, board: boards["NOT"] };

    const later = new Session(memorySave(old));
    later.resume();
    expect(later.levelIndex).toBe(NOT_LEVEL);
    expect(later.game.edges.size).toBe(3);
    later.start(0);
    later.start(NOT_LEVEL);
    expect(later.game.edges.size).toBe(3);
  });

  test("a board holding a part the game no longer has is dropped for a fresh one", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    session.save();
    const data = store.load()!;
    const board = data.boards["NOT"]!;
    const gone = {
      ...data,
      boards: { NOT: { ...board, nodes: [...board.nodes, { ...board.nodes[0]!, type: "GONE" }] } },
    };

    const later = new Session(memorySave(gone));
    later.resume();
    expect(later.levelIndex).toBe(NOT_LEVEL);
    expect(later.game.edges.size).toBe(0);
  });

  test("a save from before levels named their terminals resumes with its board intact", () => {
    // The AND level, part built: A and B into a NAND, written when inputs
    // were ALPHA and BETA, the output had no name, and nodes had no signals.
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
    expect(store.load()?.solved).toEqual({});
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

  test("a save from before progress was kept by gate resumes on the same level", () => {
    const store = memorySave({ solved: 3, levelIndex: 2, boards: {}, flags: [] });
    const session = new Session(store);
    session.resume();
    expect(levelId(session.level)).toBe("AND");
    expect(session.solved).toBe(3);
    session.save();
    expect(store.load()).toMatchObject({ solved: { NAND: 1, NOT: 1, AND: 1 }, open: "AND" });
  });

  test("a save written before a level was taken out still opens on the same part", () => {
    // The game had a NOR level after OR when this was saved, on MUX.
    const old = [...LEVELS.slice(0, 4), { ...circuitAt(3), gate: "NOR" }, ...LEVELS.slice(4)];
    const session = new Session(memorySave(saved(6, 6, old)));
    session.resume();
    expect(levelId(session.level)).toBe("MUX");
    expect(session.solved).toBe(5);
  });

  test("a save written before a level was inserted opens on the new level, which isn't counted solved", () => {
    // The game had no AND level when this was saved, on XOR.
    const old = LEVELS.filter((level) => levelId(level) !== "AND");
    const session = new Session(memorySave(saved(3, 3, old)));
    session.resume();
    expect(levelId(session.level)).toBe("AND");
    expect(session.solved).toBe(2);

    const a = session.game;
    const nand = placeNode(a, "NAND", { x: 16, y: 18 })!.id;
    const not = placeNode(a, "NOT", { x: 30, y: 18 })!.id;
    wire(a, out(terminal(a, "A")), inp(nand, 0));
    wire(a, out(terminal(a, "B")), inp(nand, 1));
    wire(a, out(nand), inp(not));
    wire(a, out(not), inp(terminal(a, "OUT")));
    runAll(session);
    expect(session.result?.passed).toBe(true);
    // OR was solved before AND came in, so XOR opens next.
    expect(session.solved).toBe(4);
    expect(session.unlockedCount).toBe(5);
  });

  test("a level changed since it was solved must be solved again", () => {
    const changed = LEVELS.map((level) => (levelId(level) === "NOT" ? { ...level, revision: 2 } : level));
    const store = memorySave(saved(3, 2));
    const session = new Session(store, undefined, changed);
    session.resume();
    expect(levelId(session.level)).toBe("NOT");
    expect(session.solved).toBe(1);

    buildNot(session.game);
    runAll(session);
    expect(session.result?.passed).toBe(true);
    expect(session.solved).toBe(3);
    expect(store.load()?.solved).toMatchObject({ NOT: 2 });
  });

  test("a save that solved the ALU slice and 2-bit ALU at revision 1 reopens on the slice", () => {
    const solved = Object.fromEntries(LEVELS.map((level) => [levelId(level), level.revision ?? 1]));
    const session = new Session(
      memorySave({ ...saved(LEVELS.length, LEVELS.length - 1), solved: { ...solved, "ALU SLICE": 1, "2-BIT ALU": 1 } }),
    );
    session.resume();
    expect(levelId(session.level)).toBe("ALU SLICE");
  });

  test("a save holding a ZERO TEST board and solved entry still loads", () => {
    const { session, store } = fresh();
    buildNot(session.game);
    session.save();
    const data = store.load()!;
    const board = data.boards["NOT"]!;
    const zeroTest = { ...board, nodes: [...board.nodes, { ...board.nodes[0]!, type: "ZERO TEST" }] };
    const later = new Session(
      memorySave({
        ...data,
        solved: { ...data.solved, "ZERO TEST": 1 },
        boards: { NOT: board, "ZERO TEST": zeroTest },
      }),
    );
    later.resume();
    expect(later.levelIndex).toBe(NOT_LEVEL);
    expect(later.game.edges.size).toBe(3);
  });

  test("a save open on a level the game no longer has opens the furthest playable level", () => {
    const session = new Session(memorySave({ ...saved(3), open: "GONE" }));
    session.resume();
    expect(session.levelIndex).toBe(3);
  });

  test("an old save past the last level opens the last level", () => {
    const store = memorySave({ solved: LEVELS.length, levelIndex: LEVELS.length, boards: {}, flags: [] });
    const session = new Session(store);
    session.resume();
    expect(session.levelIndex).toBe(LEVELS.length - 1);
    expect(session.solved).toBe(LEVELS.length);
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
    const board = (): Pick<Node, "type" | "width" | "signals">[] =>
      [...session.game.nodes.values()].map(({ type, width, signals }) => ({ type, width, signals }));
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
    expect(store.load()?.boards["AND"]?.nodes.length).toBe(3);
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

// A NAND level, then a D flip-flop level that comes prebuilt, so its board
// has the part wired between D, CLK and Q.
const CLOCKED: Level[] = [
  circuitAt(0),
  {
    gate: "DFF",
    goal: "Q takes D's value when the clock turns on.",
    layer: 5,
    inputs: ["D", "CLK"],
    outputs: ["Q"],
    memory: {
      next: ([d = 0, clk = 0], [q = 0, seen = 0]) => [clk && !seen ? d : q, clk],
      outputs: ([q = 0]) => [q],
    },
    steps: [
      { inputs: [1, 0], expected: [0] },
      { inputs: [1, 0], tick: true, expected: [1] },
      { inputs: [0, 0], expected: [1] },
    ],
    prebuilt: true,
  },
];

function clocked(): { session: Session; sound: ReturnType<typeof recordingSound>; label: (l: string) => NodeID } {
  const sound = recordingSound();
  const session = new Session(memorySave(saved(1, 1, CLOCKED)), sound, CLOCKED);
  session.start(1);
  const label = (l: string): NodeID => terminal(session.game, l);
  return { session, sound, label };
}
const q = (session: Session): boolean => [...session.game.nodes.values()].find((n) => n.label === "Q")!.isHigh;

describe("a level with a clock", () => {
  test("Tick turns the clock on and off once, so the flip-flop takes in D once", () => {
    const { session, sound, label } = clocked();
    session.edit((game) => {
      setInput(game, label("D"), 1);
    });
    expect(q(session)).toBe(false);
    expect(session.tick()).toBe(true);
    expect(q(session)).toBe(true);
    expect(session.game.nodes.get(label("CLK"))!.signals).toEqual([0]);
    session.edit((game) => {
      setInput(game, label("D"), 0);
    });
    expect(q(session)).toBe(true);
    session.tick();
    expect(q(session)).toBe(false);
    expect(sound.played.filter((cue) => cue === "clock")).toHaveLength(2);
  });

  test("Tick does nothing on a level without a clock, or during a test run", () => {
    const { session } = fresh();
    expect(session.tick()).toBe(false);
    const { session: withClock } = clocked();
    withClock.beginTest();
    expect(withClock.tick()).toBe(false);
  });

  test("a test run plays the timing table, ticking where a step says, from memory parts at 0", () => {
    const { session, sound, label } = clocked();
    session.edit((game) => {
      setInput(game, label("D"), 1);
    });
    session.tick();
    expect(q(session)).toBe(true);
    sound.played.length = 0;
    session.beginTest();
    expect(q(session)).toBe(false);
    expect(session.rows).toMatchObject(circuitAt(1, CLOCKED).steps!);
    while (session.step());
    expect(session.result!.passed).toBe(true);
    expect(tested(session)).toEqual([[0], [1], [1]]);
    expect(sound.played.filter((cue) => cue === "clock")).toHaveLength(1);
  });
});

test("a change that makes the board unstable plays the unstable cue once", () => {
  const sound = recordingSound();
  const session = new Session(memorySave(saved(1)), sound);
  session.start(NOT_LEVEL);
  const not = placeNode(session.game, "NAND", { x: 20, y: 10 })!.id;
  session.edit((game) => {
    wire(game, out(not), inp(not, 0));
    wire(game, out(not), inp(not, 1));
  });
  expect(session.game.stable).toBe(false);
  session.edit((game) => {
    moveNode(game, not, 20, 20);
  });
  expect(sound.played.filter((cue) => cue === "unstable")).toHaveLength(1);
});

// The first level that is the last of its layer, and so leads up a floor.
const top = LEVELS.findIndex((level, i) => LEVELS[i + 1] !== undefined && LEVELS[i + 1]!.layer !== level.layer);

function passOn(index: number): Session {
  const session = new Session(memorySave(saved(index, index)));
  session.start(index);
  session.edit((game) => {
    buildSolution(game, circuitAt(index));
  });
  runAll(session);
  return session;
}

describe("after a test run", () => {
  test("nothing comes next until the run passes", () => {
    const { session } = fresh();
    expect(session.next).toBeNull();
    runAll(session);
    expect(session.next).toBeNull();
  });

  test("a passed level leads to the next level in its layer", () => {
    expect(passOn(NOT_LEVEL).next).toEqual({ to: "level", index: NOT_LEVEL + 1 });
  });

  test("the last level of a layer leads up to the floor above", () => {
    expect(passOn(top).next).toEqual({ to: "floor", layer: layerOf(top + 1) });
  });
});

describe("what Bitbox says", () => {
  test("a level's intro plays the first time it opens", () => {
    const { session } = fresh();
    expect(session.introduce()).toEqual({ say: "intro", level: session.level });
    expect(session.introduce()).toBeNull();
    session.start(0);
    expect(session.introduce()).toEqual({ say: "intro", level: session.level });
  });

  test("the story flags are saved, and a new game forgets them", () => {
    const { session, store } = fresh();
    session.introduce();
    const again = new Session(store);
    again.resume();
    expect(again.introduce()).toBeNull();
    again.reset();
    expect(again.introduce()).not.toBeNull();
  });

  test("continuing welcomes the player back only to a level they've heard about", () => {
    const { session, store } = fresh();
    expect(session.welcome()).toBeNull();
    session.introduce();
    const again = new Session(store);
    again.resume();
    expect(again.welcome()).toEqual({ say: "welcome back", level: again.level });
  });

  test("each floor above the first is described once", () => {
    const { session } = fresh();
    expect(session.arrive(0)).toBeNull();
    expect(session.arrive(2)).toEqual({ say: "floor", layer: 2 });
    expect(session.arrive(2)).toBeNull();
  });

  test("a test run's response is said once, and a repeat pass gets a face", () => {
    const { session } = fresh();
    expect(session.respond()).toBeNull();
    session.edit((game) => {
      buildNot(game);
    });
    runAll(session);
    expect(session.respond()).toEqual({ say: "solved", level: session.level });
    runAll(session);
    expect(session.respond()).toEqual({ react: "happy" });
  });
});

// A scheduler that runs its repeating tasks only when told to.
function fakeScheduler(): Scheduler & { tasks: { ms: number; task: () => void }[]; fire: () => void } {
  const tasks: { ms: number; task: () => void }[] = [];
  return {
    tasks,
    every(ms, task) {
      const entry = { ms, task };
      tasks.push(entry);
      return () => {
        tasks.splice(tasks.indexOf(entry), 1);
      };
    },
    fire() {
      for (const { task } of tasks.slice()) task();
    },
  };
}

describe("driving a session", () => {
  test("a test run shows its first row at once, then a row each step", () => {
    const { session } = fresh();
    const scheduler = fakeScheduler();
    let changes = 0;
    const driver = new Driver(session, scheduler, () => {
      changes++;
    });
    driver.test();
    expect(session.currentRow).toBe(0);
    expect(scheduler.tasks.map((t) => t.ms)).toEqual([TEST_STEP_MS]);
    scheduler.fire();
    expect(session.currentRow).toBe(1);
    while (scheduler.tasks.length > 0) scheduler.fire();
    expect(session.result).not.toBeNull();
    expect(changes).toBeGreaterThan(2);
  });

  test("a new board stops the test run's steps", () => {
    const { session } = fresh();
    const scheduler = fakeScheduler();
    const driver = new Driver(session, scheduler, () => {});
    driver.test();
    driver.start(0);
    expect(scheduler.tasks).toHaveLength(0);
    driver.test();
    expect(scheduler.tasks).toHaveLength(1);
  });

  test("Run ticks the clock until Pause", () => {
    const { session, sound } = clocked();
    const scheduler = fakeScheduler();
    const driver = new Driver(session, scheduler, () => {});
    driver.toggleClock();
    expect(driver.running).toBe(true);
    expect(scheduler.tasks.map((t) => t.ms)).toEqual([1000 / CLOCK_SPEED.start]);
    scheduler.fire();
    expect(sound.played.filter((cue) => cue === "clock")).toHaveLength(2);
    driver.toggleClock();
    expect(driver.running).toBe(false);
    expect(scheduler.tasks).toHaveLength(0);
  });

  test("a test run or a new board stops the clock", () => {
    const { session } = clocked();
    const scheduler = fakeScheduler();
    const driver = new Driver(session, scheduler, () => {});
    driver.toggleClock();
    driver.test();
    expect(driver.running).toBe(false);
    expect(scheduler.tasks.map((t) => t.ms)).toEqual([TEST_STEP_MS]);
    driver.clear();
    driver.toggleClock();
    driver.clear();
    expect(driver.running).toBe(false);
    expect(scheduler.tasks).toHaveLength(0);
  });

  test("stop halts the clock and a test run, and leaves the board as it was", () => {
    const { session } = clocked();
    const scheduler = fakeScheduler();
    const driver = new Driver(session, scheduler, () => {});
    driver.toggleClock();
    driver.stop();
    expect(driver.running).toBe(false);
    expect(scheduler.tasks).toHaveLength(0);
    driver.test();
    const row = session.currentRow;
    driver.stop();
    expect(scheduler.tasks).toHaveLength(0);
    expect(session.currentRow).toBe(row);
  });
});

describe("the clock speed", () => {
  test("starts at 4 ticks a second", () => {
    expect(CLOCK_SPEED.start).toBe(4);
    expect(fresh().session.clockSpeed).toBe(4);
  });

  test("is kept in the save, and read back by the next session", () => {
    const { session, store } = fresh();
    session.setClockSpeed(16);
    expect(store.load()?.clockSpeed).toBe(16);
    expect(new Session(store).clockSpeed).toBe(16);
  });

  test("stays from 1 to 64 ticks a second", () => {
    const { session } = fresh();
    session.setClockSpeed(0);
    expect(session.clockSpeed).toBe(1);
    session.setClockSpeed(100);
    expect(session.clockSpeed).toBe(64);
  });

  test("snaps a saved speed to the nearest doubling", () => {
    expect(new Session(memorySave({ ...saved(1), clockSpeed: 5 })).clockSpeed).toBe(4);
    expect(new Session(memorySave({ ...saved(1), clockSpeed: 12 })).clockSpeed).toBe(16);
  });

  test("a save from before the gauge, or with a speed out of range, starts at 4", () => {
    expect(new Session(memorySave(saved(1))).clockSpeed).toBe(4);
    expect(new Session(memorySave({ ...saved(1), clockSpeed: "fast" })).clockSpeed).toBe(4);
    expect(new Session(memorySave({ ...saved(1), clockSpeed: 1000 })).clockSpeed).toBe(64);
  });

  test("Run ticks as many times a second as it says, and changes pace while running", () => {
    const { session } = clocked();
    const scheduler = fakeScheduler();
    const driver = new Driver(session, scheduler, () => {});
    driver.setClockSpeed(8);
    driver.toggleClock();
    expect(scheduler.tasks.map((t) => t.ms)).toEqual([125]);
    driver.setClockSpeed(64);
    expect(driver.running).toBe(true);
    expect(scheduler.tasks.map((t) => t.ms)).toEqual([1000 / 64]);
  });

  test("doesn't change a test run's pace", () => {
    const { session } = clocked();
    const scheduler = fakeScheduler();
    const driver = new Driver(session, scheduler, () => {});
    driver.setClockSpeed(64);
    driver.test();
    expect(scheduler.tasks.map((t) => t.ms)).toEqual([TEST_STEP_MS]);
    driver.setClockSpeed(1);
    expect(scheduler.tasks.map((t) => t.ms)).toEqual([TEST_STEP_MS]);
  });
});
