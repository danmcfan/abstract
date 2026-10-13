import { RobotScreen } from "./RobotScreen";
import * as script from "./script";

// Shown instead of the game on a small touch device, where the board is too
// cramped to build on. The player can still choose to play anyway.
export function DesktopNotice(props: { onContinue: () => void }) {
  return (
    <main id="desktop-notice" class="fixed inset-0 grid place-items-center overflow-y-auto p-4 text-ink-deep">
      <div class="pop w-full max-w-[420px] border-[3px]! border-double! p-6 sheet">
        <p class="text-xs text-pencil">Dwg LOA-000, note to the player</p>
        <h1 class="mt-2 border-b-2 border-ink pb-1.5 text-2xl leading-tight font-bold text-ink">Play on a desktop</h1>
        <RobotScreen expression={script.smallScreen.face} class="mx-auto my-4 aspect-square w-full max-w-[180px]" />
        <p class="mb-3 font-hand text-lg">"{script.smallScreen.text}"</p>
        <p class="mb-5 text-sm">
          Layers of Abstraction needs a bigger screen. Visit <b class="text-ink">abstract.dannyobrien.dev</b> on a
          desktop.
        </p>
        <a
          id="continue-anyway"
          href="#"
          class="text-sm text-ink underline"
          onClick={(event) => {
            event.preventDefault();
            props.onContinue();
          }}
        >
          Continue anyway
        </a>
      </div>
    </main>
  );
}
