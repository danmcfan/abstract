import { Show, createSignal } from "solid-js";
import { LEVELS } from "../sim/level";
import type { Expression } from "../robot/expression";
import { RobotScreen } from "./RobotScreen";
import { SoundButton } from "./SoundButton";
import { hasSave, savedLevel, solved } from "./state";

// The title sheet. With no saved game there's one button, Start. With one,
// Continue picks it up, The stack picks a level, and New Game starts over,
// after asking, since that erases the save.
export function Title(props: { onContinue: () => void; onStack: () => void; onNew: () => void }) {
  const [confirming, setConfirming] = createSignal(false);
  const [mood, setMood] = createSignal<Expression>("sleepy");
  const wake = () => setMood("happy");
  const doze = () => setMood(confirming() ? "worried" : "sleepy");
  const saved = () => LEVELS[savedLevel()]!;

  const askToErase = () => {
    setConfirming(true);
    setMood("worried");
  };
  const keep = () => {
    setConfirming(false);
    setMood("sleepy");
  };

  return (
    <main class="fixed inset-0 grid place-items-center overflow-y-auto p-4 text-ink-deep">
      <div class="pop relative w-full max-w-[760px] border-[3px]! border-double! sheet">
        <SoundButton class="absolute top-3 right-3" />
        <div class="grid items-center gap-2 p-6 pb-2 sm:grid-cols-[auto_1fr] sm:p-8 sm:pb-2">
          <div>
            <p class="text-xs text-pencil">Dwg LOA-000, title sheet</p>
            <h1 class="mt-2 text-[clamp(2.2rem,8vw,3.4rem)] leading-[0.95] font-bold tracking-tight text-ink">
              <span class="block border-b-2 border-ink pb-1.5">Layers</span>
              <span class="block border-b-2 border-dashed border-ink py-1.5 pl-[1.2ch]">of</span>
              <span class="block pt-1.5 pl-[2.4ch]">Abstraction</span>
            </h1>

            <div class="mt-7 mb-6 flex flex-col items-start gap-3.5" onMouseLeave={doze}>
              <Show
                when={hasSave()}
                fallback={
                  <button
                    id="start"
                    class="btn px-8 text-lg"
                    onMouseEnter={wake}
                    onFocus={wake}
                    onClick={() => props.onNew()}
                  >
                    Start
                  </button>
                }
              >
                <Show
                  when={!confirming()}
                  fallback={
                    <div
                      class="border-2 border-dashed border-fail p-3"
                      role="alertdialog"
                      aria-label="Start a new game?"
                    >
                      <p class="mb-3 text-[13px]">Start over? Your saved game will be erased.</p>
                      <div class="flex flex-wrap gap-3">
                        <button id="erase" class="btn border-fail bg-fail btn-sm" onClick={() => props.onNew()}>
                          Erase and start
                        </button>
                        <button id="keep" class="btn btn-sm btn-ghost" onClick={keep}>
                          Keep it
                        </button>
                      </div>
                    </div>
                  }
                >
                  <button
                    id="continue"
                    class="btn px-6 text-left text-lg"
                    onMouseEnter={wake}
                    onFocus={wake}
                    onClick={() => props.onContinue()}
                  >
                    Continue
                    <small class="block text-xs font-normal opacity-80">
                      {saved().prebuilt ? "Meet" : "Build"} {saved().gate}, level {savedLevel() + 1} of {LEVELS.length}
                    </small>
                  </button>
                  <button
                    id="title-stack"
                    class="btn btn-ghost"
                    onMouseEnter={wake}
                    onFocus={wake}
                    onClick={() => props.onStack()}
                  >
                    The stack
                  </button>
                  <button id="new-game" class="btn btn-ghost" onClick={askToErase}>
                    New Game
                  </button>
                </Show>
              </Show>
            </div>
          </div>
          <RobotScreen expression={mood()} class="mx-auto aspect-square w-full max-w-[260px]" />
        </div>
        <TitleBlock built={hasSave() ? solved() : 0} />
      </div>
    </main>
  );
}

// The drawing's title block, as on the vision board.
function TitleBlock(props: { built: number }) {
  const cell = "border-t-[1.5px] border-l-[1.5px] border-ink px-3 py-1.5 first:border-l-0";
  const head = "block text-[10px] text-pencil";
  return (
    <div class="grid grid-cols-3 text-xs">
      <div class={cell}>
        <b class={head}>Sheet</b>Title
      </div>
      <div class={cell}>
        <b class={head}>Built</b>
        {props.built} / {LEVELS.length} gates
      </div>
      <div class={cell}>
        <b class={head}>Drawn by</b>You + Bitbox
      </div>
    </div>
  );
}
