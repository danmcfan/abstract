import { Show, type JSX } from "solid-js";
import type { Screen } from "./device";
import { MIN_HEIGHT, MIN_WIDTH } from "./device";
import { RobotScreen } from "./RobotScreen";
import * as script from "./script";
import type { Line } from "./speech";

// Shown instead of the game anywhere it doesn't play: on a touch device,
// for good, and on a desktop window until it's made big enough.
export function DesktopNotice(props: { screen: Exclude<Screen, "desktop"> }): JSX.Element {
  const line = (): Line => (props.screen === "touch" ? script.smallScreen : script.smallWindow);
  return (
    <main id="desktop-notice" class="fixed inset-0 grid place-items-center overflow-y-auto p-4 text-ink-deep">
      <div class="pop w-full max-w-105 border-3! border-double! p-6 sheet">
        <p class="text-xs text-pencil">Dwg LOA-000, note to the player</p>
        <h1 class="mt-2 border-b-2 border-ink pb-1.5 text-2xl leading-tight font-bold text-ink">
          {props.screen === "touch" ? "Play on a desktop" : "Make the window bigger"}
        </h1>
        <RobotScreen expression={line().face} class="mx-auto my-4 aspect-square w-full max-w-45" />
        <p class="mb-3 font-hand text-lg">"{line().text}"</p>
        <p class="text-sm">
          <Show
            when={props.screen === "touch"}
            fallback={
              <>
                Layers of Abstraction needs a window at least {MIN_WIDTH} × {MIN_HEIGHT}.
              </>
            }
          >
            Layers of Abstraction is played with a mouse. Visit <b class="text-ink">abstract.dannyobrien.dev</b> on a
            desktop.
          </Show>
        </p>
      </div>
    </main>
  );
}
