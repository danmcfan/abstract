import { Show, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { pinPosition, type Pin } from "./sim/circuit";
import { LEVELS } from "./sim/level";
import type { NodeID } from "./sim/node";
import "./styles.css";
import { Board, toScreen } from "./ui/Board";
import { DesktopNotice } from "./ui/DesktopNotice";
import { noticeDismissal, watchSmallTouch } from "./ui/device";
import { Dialogue } from "./ui/Dialogue";
import { listenForFirstGesture } from "./ui/sound";
import { hush, say, speech } from "./ui/speech";
import { Hud } from "./ui/Hud";
import * as script from "./ui/script";
import { Stack } from "./ui/Stack";
import { continueGame, current, hasFlag, level, levelIndex, newGame, once, startLevel } from "./ui/state";
import { Title } from "./ui/Title";
import { useTutorial } from "./ui/tutorial";

// Dev builds can jump straight to a level with ?level=N, skipping the title.
const params = new URLSearchParams(location.search);
const requested = Number(params.get("level")) - 1;
const jump = import.meta.env.DEV && requested >= 0 && requested < LEVELS.length;
if (jump) startLevel(requested);

// The stack opens over the board, which stays as it was underneath, or over
// the title, which it returns to. Arriving from the floor below, it names
// the layer the elevator rides up to.
interface StackView {
  arrive?: number | undefined;
}

function App() {
  const smallTouch = watchSmallTouch((query) => window.matchMedia(query));
  const notice = noticeDismissal(() => localStorage);
  const [screen, setScreen] = createSignal<"title" | "play">(jump ? "play" : "title");
  const [stack, setStack] = createSignal<StackView | null>(null);
  const play = (begin: () => void) => {
    begin();
    setScreen("play");
  };
  const menu = () => {
    hush();
    setScreen("title");
  };
  const openStack = (arrive?: number) => {
    hush();
    setStack({ arrive });
    if (arrive) once(`floor:${arrive}`, () => say(script.floor(arrive)));
  };
  // Picking the level already on the board leaves it alone, test result
  // and all.
  const pick = (index: number) => {
    hush();
    setStack(null);
    if (index !== levelIndex()) startLevel(index);
    setScreen("play");
  };
  const closeStack = () => {
    hush();
    setStack(null);
  };

  return (
    <Show when={!smallTouch() || notice.dismissed()} fallback={<DesktopNotice onContinue={notice.dismiss} />}>
      <Show when={screen() === "title" && !stack()}>
        <Title
          onContinue={() =>
            play(() => {
              continueGame();
              if (hasFlag(`intro:${level().gate}`)) say(script.welcomeBack(level()));
            })
          }
          onStack={() => {
            continueGame();
            openStack();
          }}
          onNew={() => play(newGame)}
        />
      </Show>
      <Show when={screen() === "play"}>
        <Play onMenu={menu} onStack={openStack} />
      </Show>
      <Show when={stack()} keyed>
        {(view) => <Stack arrive={view.arrive} onPick={pick} onClose={closeStack} />}
      </Show>
      <Show when={screen() === "play" || stack()}>
        <Dialogue />
      </Show>
    </Show>
  );
}

function Play(props: { onMenu: () => void; onStack: (arrive?: number) => void }) {
  useTutorial();
  return (
    <>
      <Board />
      <Hud onMenu={props.onMenu} onStack={props.onStack} />
    </>
  );
}

listenForFirstGesture();
render(() => <App />, document.body);

// A dev-only hook so automated play-tests can find things on screen.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __abstract: {
      get game() {
        return current();
      },
      get levelIndex() {
        return levelIndex();
      },
      // The whole line Bitbox is on, however much of it is typed out yet.
      get saying() {
        return speech()?.line.text ?? null;
      },
      nodes: () => [...current().nodes.values()].map(({ id, type, label, isHigh }) => ({ id, type, label, isHigh })),
      pinScreen: (id: NodeID, side: Pin["side"], index = 0) => {
        const p = pinPosition(current().nodes.get(id)!, side, index);
        return toScreen(p.x, p.y);
      },
      boardScreen: (x: number, y: number) => toScreen(x, y),
      nodeScreen: (id: NodeID) => {
        const { x, y, width, height } = current().nodes.get(id)!.rect;
        return toScreen(x + width / 2, y + height / 2);
      },
    },
  });
}
