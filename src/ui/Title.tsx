import { Show, createSignal, type JSX } from "solid-js";
import { LEVELS, type Level } from "../sim/level";
import type { Expression } from "../robot/expression";
import { RobotScreen } from "./RobotScreen";
import { SoundButton } from "./SoundButton";
import { session } from "./state";

// The title sheet. With no saved game there's one button, Start. With one,
// Continue picks it up, The stack picks a level, and New Game starts over,
// after asking, since that erases the save.
function saved(): Level {
  const level = LEVELS[session().savedLevel];
  if (level === undefined) throw new Error(`The save points at a missing level ${session().savedLevel}`);
  return level;
}

export function Title(props: { onContinue: () => void; onStack: () => void; onNew: () => void }): JSX.Element {
  const [confirming, setConfirming] = createSignal(false);
  const [mood, setMood] = createSignal<Expression>("sleepy");
  const wake = (): void => {
    setMood("happy");
  };
  const doze = (): void => {
    setMood(confirming() ? "worried" : "sleepy");
  };

  const askToErase = (): void => {
    setConfirming(true);
    setMood("worried");
  };
  const keep = (): void => {
    setConfirming(false);
    setMood("sleepy");
  };

  return (
    <main class="fixed inset-0 grid place-items-center overflow-y-auto p-4 text-ink-deep">
      <div class="pop relative w-full max-w-190 border-3! border-double! sheet">
        <SoundButton class="absolute top-3 right-3" />
        <div class="grid items-center gap-2 p-6 pb-2 sm:grid-cols-title sm:p-8 sm:pb-2">
          <div>
            <p class="text-xs text-pencil">Dwg LOA-000, title sheet</p>
            <h1 class="mt-2 text-display font-bold tracking-tight text-ink">
              <span class="block border-b-2 border-ink pb-1.5">Layers</span>
              <span class="block border-b-2 border-dashed border-ink py-1.5 pl-indent">of</span>
              <span class="block pt-1.5 pl-indent-2">Abstraction</span>
            </h1>

            <div class="mt-7 mb-6 flex flex-col items-start gap-3.5" onMouseLeave={doze}>
              <Show
                when={session().hasSave}
                fallback={
                  <button
                    id="start"
                    class="btn px-8 text-lg"
                    onMouseEnter={wake}
                    onFocus={wake}
                    onClick={() => {
                      props.onNew();
                    }}
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
                      <p class="mb-3 text-note">Start over? Your saved game will be erased.</p>
                      <div class="flex flex-wrap gap-3">
                        <button
                          id="erase"
                          class="btn border-fail bg-fail btn-sm"
                          onClick={() => {
                            props.onNew();
                          }}
                        >
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
                    onClick={() => {
                      props.onContinue();
                    }}
                  >
                    Continue
                    <small class="block text-xs font-normal opacity-80">
                      {saved().prebuilt === true ? "Meet" : "Build"} {saved().gate}, level {session().savedLevel + 1} of{" "}
                      {LEVELS.length}
                    </small>
                  </button>
                  <button
                    id="title-stack"
                    class="btn btn-ghost"
                    onMouseEnter={wake}
                    onFocus={wake}
                    onClick={() => {
                      props.onStack();
                    }}
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
          <RobotScreen expression={mood()} class="mx-auto aspect-square w-full max-w-65" />
        </div>
        <TitleBlock built={session().hasSave ? session().solved : 0} />
      </div>
    </main>
  );
}

// The drawing's title block, as on the vision board.
function TitleBlock(props: { built: number }): JSX.Element {
  const cell = "border-t-hair border-l-hair border-ink px-3 py-1.5 first:border-l-0";
  const head = "block text-fine text-pencil";
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
