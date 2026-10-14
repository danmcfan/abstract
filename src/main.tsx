import { Show, createSignal, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { pinPosition, type Pin } from "./sim/circuit";
import { layerOf, LEVELS, solutionWires } from "./sim/level";
import type { Node, NodeID } from "./sim/node";
import { Board, toScreen } from "./ui/Board";
import { DesktopNotice } from "./ui/DesktopNotice";
import { watchScreen } from "./ui/device";
import { Dialogue } from "./ui/Dialogue";
import { listenForFirstGesture } from "./ui/sound";
import { hush, speak, speech } from "./ui/speech";
import { Brief, MenuBar, PartsBin } from "./ui/Sheet";
import { Stack } from "./ui/Stack";
import { current, driver, session } from "./ui/state";
import { Title } from "./ui/Title";
import { useTutorial } from "./ui/tutorial";

// Dev builds can jump straight to a level with ?level=N, skipping the title.
const params = new URLSearchParams(location.search);
const requested = Number(params.get("level")) - 1;
const jump = import.meta.env.DEV && requested >= 0 && requested < LEVELS.length;
if (jump) driver.start(requested);

// The stack opens over the board, which stays as it was underneath, or over
// the title, which it returns to. Arriving from the floor below, it names
// the layer the elevator rides up to.
interface StackView {
  arrive?: number | undefined;
}

function App(): JSX.Element {
  const device = watchScreen((query) => window.matchMedia(query));
  const [screen, setScreen] = createSignal<"title" | "play">(jump ? "play" : "title");
  const [stack, setStack] = createSignal<StackView | null>(null);
  const play = (begin: () => void): void => {
    begin();
    setScreen("play");
  };
  const menu = (): void => {
    hush();
    setScreen("title");
  };
  const openStack = (arrive?: number): void => {
    hush();
    setStack({ arrive });
    if (arrive !== undefined) speak(session().arrive(arrive));
  };
  // Picking the level already on the board leaves it alone, test result
  // and all.
  const pick = (index: number): void => {
    hush();
    setStack(null);
    if (index !== session().levelIndex) driver.start(index);
    setScreen("play");
  };
  const closeStack = (): void => {
    hush();
    setStack(null);
  };

  return (
    <Show when={device() === "desktop"} fallback={<DesktopNotice screen={device() === "touch" ? "touch" : "small"} />}>
      <Show when={screen() === "title" && !stack()}>
        <Title
          onContinue={() => {
            play(() => {
              driver.resume();
              speak(session().welcome());
            });
          }}
          onStack={() => {
            driver.resume();
            openStack();
          }}
          onNew={() => {
            play(() => {
              driver.reset();
            });
          }}
        />
      </Show>
      <Show when={screen() === "play"}>
        <Play onMenu={menu} onStack={openStack} stacked={stack() !== null} />
      </Show>
      <Show when={stack()} keyed>
        {(view) => <Stack arrive={view.arrive} onPick={pick} onClose={closeStack} />}
      </Show>
      {/* During play Bitbox sits docked in his desk; over the stack he pops up. */}
      <Show when={stack()}>
        <Dialogue />
      </Show>
    </Show>
  );
}

// The sheet: the menu bar across the top, the brief down the left over
// Bitbox's desk, and the board over the parts bin.
function Play(props: { onMenu: () => void; onStack: (arrive?: number) => void; stacked: boolean }): JSX.Element {
  useTutorial();
  return (
    <div class="grid h-full grid-cols-sheet grid-rows-sheet gap-3 p-3">
      <MenuBar onMenu={props.onMenu} onStack={props.onStack} />
      <Brief onStack={props.onStack} />
      <div class="relative min-h-0 min-w-0">
        <Board />
      </div>
      <Show when={!props.stacked} fallback={<div />}>
        <Dialogue docked />
      </Show>
      <PartsBin />
    </div>
  );
}

listenForFirstGesture();
render(() => <App />, document.body);

// A dev-only hook so automated play-tests can find things on screen.
function node(id: NodeID): Node {
  const found = current().nodes.get(id);
  if (found === undefined) throw new Error(`no node ${id} on the board`);
  return found;
}

if (import.meta.env.DEV) {
  Object.assign(window, {
    __abstract: {
      get game() {
        return current();
      },
      get levelIndex() {
        return session().levelIndex;
      },
      get gate() {
        return session().level.gate;
      },
      // The whole line Bitbox is on, however much of it is typed out yet.
      get saying() {
        return speech()?.line.text ?? null;
      },
      levelCount: LEVELS.length,
      // The layer level index i belongs to, for checks on the stack.
      layerOf,
      // The open level's intended solution, and its wires once its nodes
      // are on the board as the given nodes, so the playthrough can build it.
      get solution() {
        return session().level.solution ?? null;
      },
      solutionWires: (ids: NodeID[]) => solutionWires(current(), session().level, ids),
      nodes: () => [...current().nodes.values()].map(({ id, type, label, isHigh }) => ({ id, type, label, isHigh })),
      pinScreen: (id: NodeID, side: Pin["side"], index = 0) => {
        const p = pinPosition(current(), node(id), side, index);
        return toScreen(p.x, p.y);
      },
      boardScreen: (x: number, y: number) => toScreen(x, y),
      nodeScreen: (id: NodeID) => {
        const { x, y, width, height } = node(id).rect;
        return toScreen(x + width / 2, y + height / 2);
      },
    },
  });
}
