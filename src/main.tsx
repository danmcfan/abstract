import { render } from "solid-js/web";
import { pinPosition, type Pin } from "./sim/circuit";
import { LEVELS } from "./sim/level";
import type { NodeID } from "./sim/node";
import "./styles.css";
import { Board, toScreen } from "./ui/Board";
import { Hud } from "./ui/Hud";
import { current, levelIndex, startLevel, unlockedCount } from "./ui/state";

const requested = Number(new URLSearchParams(location.search).get("level")) - 1;
startLevel(import.meta.env.DEV && requested >= 0 && requested < LEVELS.length ? requested : unlockedCount() - 1);

render(
  () => (
    <>
      <Board />
      <Hud />
    </>
  ),
  document.body,
);

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
