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
import { hush, say } from "./ui/speech";
import { Hud } from "./ui/Hud";
import * as script from "./ui/script";
import { continueGame, current, hasFlag, level, levelIndex, newGame, startLevel } from "./ui/state";
import { Title } from "./ui/Title";
import { useTutorial } from "./ui/tutorial";

// Dev builds can jump straight to a level with ?level=N, skipping the title.
const params = new URLSearchParams(location.search);
const requested = Number(params.get("level")) - 1;
const jump = import.meta.env.DEV && requested >= 0 && requested < LEVELS.length;
if (jump) startLevel(requested);

function App() {
  const smallTouch = watchSmallTouch((query) => window.matchMedia(query));
  const notice = noticeDismissal(() => localStorage);
  const [screen, setScreen] = createSignal<"title" | "play">(jump ? "play" : "title");
  const play = (begin: () => void) => {
    begin();
    setScreen("play");
  };
  const menu = () => {
    hush();
    setScreen("title");
  };

  return (
    <Show when={!smallTouch() || notice.dismissed()} fallback={<DesktopNotice onContinue={notice.dismiss} />}>
      <Show
        when={screen() === "play"}
        fallback={
          <Title
            onContinue={() =>
              play(() => {
                continueGame();
                if (hasFlag(`intro:${level().gate}`)) say(script.welcomeBack(level()));
              })
            }
            onNew={() => play(newGame)}
          />
        }
      >
        <Play onMenu={menu} />
      </Show>
    </Show>
  );
}

function Play(props: { onMenu: () => void }) {
  useTutorial();
  return (
    <>
      <Board />
      <Hud onMenu={props.onMenu} />
      <Dialogue />
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
