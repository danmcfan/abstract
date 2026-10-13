import { describe, expect, test } from "bun:test";
import { newGame, pinPosition, placeNode, wire, type Game, type Pin } from "./circuit";
import { createGestures, type Gestures } from "./gesture";
import type { NodeID, NodeType } from "./node";
import { localSave, memorySave } from "./save";
import { Session } from "./session";
import { localSetting, memorySetting, recordingSound, switchedSound, typeLetter } from "./sound";

const out = (node: NodeID): Pin => ({ node, side: "out", index: 0 });
const inp = (node: NodeID, index = 0): Pin => ({ node, side: "in", index });
const at = (game: Game, pin: Pin): { x: number; y: number } =>
  pinPosition(game.nodes.get(pin.node)!, pin.side, pin.index);
const centre = (game: Game, id: NodeID): { x: number; y: number } => {
  const r = game.nodes.get(id)!.rect;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const find = (game: Game, type: NodeType): NodeID => [...game.nodes.values()].find((n) => n.type === type)!.id;

type Recording = ReturnType<typeof recordingSound>;

function board(): {
  game: Game;
  g: Gestures;
  add: (type: NodeType, x: number, y: number) => NodeID;
  sound: Recording;
} {
  const game = newGame();
  const sound = recordingSound();
  const g = createGestures({
    game: () => game,
    edit: (change) => {
      change(game);
    },
    locked: () => false,
    sound,
  });
  const add = (type: NodeType, x: number, y: number): NodeID => placeNode(game, type, { x, y })!.id;
  return { game, g, add, sound };
}

// A session on the NOT level, with the NAND level already solved.
function notLevel(): { session: Session; sound: Recording } {
  const sound = recordingSound();
  const session = new Session(memorySave({ solved: 1, levelIndex: 1, board: null, flags: [] }), sound);
  session.start(1);
  return { session, sound };
}

function buildNot(game: Game): void {
  const g = placeNode(game, "NAND", { x: 20, y: 10 })!.id;
  wire(game, out(find(game, "INPUT")), inp(g, 0));
  wire(game, out(find(game, "INPUT")), inp(g, 1));
  wire(game, out(g), inp(find(game, "OUTPUT")));
}

describe("sound cues on the board", () => {
  test("flipping a switch clicks", () => {
    const { game, g, add, sound } = board();
    const a = add("INPUT", 5, 5);
    g.down(centre(game, a), 0);
    g.up(centre(game, a));
    expect(sound.played).toEqual(["switch"]);
  });

  test("clicking a part that isn't a switch is silent", () => {
    const { game, g, add, sound } = board();
    const n = add("NOT", 20, 20);
    g.down(centre(game, n), 0);
    g.up(centre(game, n));
    expect(sound.played).toEqual([]);
  });

  test("placing a part thuds", () => {
    const { session, sound } = notLevel();
    session.place("NAND");
    expect(sound.played).toEqual(["place"]);
    expect([...session.game.nodes.values()].some((n) => n.type === "NAND")).toBe(true);
  });

  test("drawing a wire scratches only while the pointer moves, then connects", () => {
    const { game, g, add, sound } = board();
    const a = add("INPUT", 5, 5);
    const b = add("NOT", 20, 20);
    g.down(at(game, out(a)), 0);
    expect(sound.played).toEqual([]);
    g.move({ x: 12, y: 13 });
    g.move({ x: 12, y: 13 });
    g.move(at(game, inp(b)));
    expect(sound.played).toEqual(["pencil", "pencil"]);
    g.up(at(game, inp(b)));
    expect(sound.played).toEqual(["pencil", "pencil", "connect"]);
  });

  test("a wire that doesn't connect makes no relay click", () => {
    const { game, g, add, sound } = board();
    const a = add("INPUT", 5, 5);
    const b = add("INPUT", 5, 20);
    g.down(at(game, out(a)), 0);
    g.up(at(game, out(b)));
    expect(sound.played).not.toContain("connect");
  });

  test("deleting a part or a wire is silent", () => {
    const { game, g, add, sound } = board();
    const a = add("INPUT", 5, 5);
    const n = add("NOT", 20, 20);
    wire(game, out(a), inp(n));
    g.contextMenu(at(game, inp(n)));
    g.contextMenu(centre(game, n));
    expect(game.nodes.has(n)).toBe(false);
    expect(sound.played).toEqual([]);
  });
});

describe("sound cues in a test run", () => {
  test("a passing run: carriage return, a tick per row, then stamp and bell", () => {
    const { session, sound } = notLevel();
    buildNot(session.game);
    session.beginTest();
    while (session.step());
    expect(sound.played).toEqual(["carriage", "tick", "tick", "stamp", "bell"]);
  });

  test("a failing run ticks lower on failed rows and stamps without the bell", () => {
    const { session, sound } = notLevel();
    // A bare wire from A to OUT gets both rows wrong.
    wire(session.game, out(find(session.game, "INPUT")), inp(find(session.game, "OUTPUT")));
    session.beginTest();
    while (session.step());
    expect(sound.played).toEqual(["carriage", "fail-tick", "fail-tick", "fail-stamp"]);
  });

  test("rows checked out of sight make no sound", () => {
    const { session, sound } = notLevel();
    buildNot(session.game);
    // Beginning the run checks every row, but none is on screen yet.
    session.beginTest();
    expect(sound.played).toEqual(["carriage"]);
    session.step();
    expect(sound.played).toEqual(["carriage", "tick"]);
  });

  test("a run aborted by leaving the level doesn't stamp", () => {
    const { session, sound } = notLevel();
    session.beginTest();
    session.step();
    session.start(0);
    session.step();
    expect(sound.played).toEqual(["carriage", "fail-tick"]);
  });
});

describe("Bitbox's typing", () => {
  test("each letter is a key; spaces and punctuation are silent", () => {
    const sound = recordingSound();
    for (const char of "Hi, I'm 2 bits.") typeLetter(sound, char);
    expect(sound.played.length).toBe("HiIm2bits".length);
    expect(new Set(sound.played)).toEqual(new Set(["key"]));
  });

  test("the pitch changes a little from letter to letter", () => {
    const sound = recordingSound();
    for (const char of "abcde") typeLetter(sound, char);
    expect(new Set(sound.pitches).size).toBeGreaterThan(1);
    for (const pitch of sound.pitches) expect(Math.abs(pitch)).toBeLessThanOrEqual(1);
  });
});

describe("the sound setting", () => {
  test("with sound off, no cue plays", () => {
    const voice = recordingSound();
    const setting = memorySetting(false);
    const sound = switchedSound(voice, setting);
    const session = new Session(memorySave(), sound);
    session.place("NAND");
    session.beginTest();
    while (session.step());
    typeLetter(sound, "a");
    expect(voice.played).toEqual([]);

    setting.set(true);
    sound.play("tick");
    expect(voice.played).toEqual(["tick"]);
  });

  test("it's on by default, and New Game doesn't change it", () => {
    const storage = new Map<string, string>();
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    } as Storage;
    try {
      expect(localSetting().on()).toBe(true);
      localSetting().set(false);
      const session = new Session(localSave());
      session.save();
      expect(session.hasSave).toBe(true);
      session.reset();
      expect(localSetting().on()).toBe(false);
    } finally {
      globalThis.localStorage = original;
    }
  });
});
