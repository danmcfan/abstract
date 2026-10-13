import { Show, createEffect, createSignal, on, onCleanup, type JSX } from "solid-js";
import { typeLetter } from "../sim/sound";
import { sound } from "./sound";
import { advance, hush, reaction, speech } from "./speech";
import { RobotScreen } from "./RobotScreen";
import type { Expression } from "../robot/expression";

const TYPE_MS = 24;

// The robot's popup: a little video window of it pulling a face, and what
// it's saying, typed out. It sits over the board without blocking play. A
// reaction with no line shows just the video window, for a moment.
const text = (): string => speech()?.line.text ?? "";
const face = (): Expression => reaction() ?? speech()?.line.face ?? "idle";

export function Dialogue(): JSX.Element {
  const [shown, setShown] = createSignal(0);
  const typing = (): boolean => shown() < text().length;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let timer: ReturnType<typeof setInterval> | undefined;
  createEffect(
    on(text, (t) => {
      clearInterval(timer);
      setShown(reduced ? t.length : 0);
      if (reduced) return;
      timer = setInterval(() => {
        typeLetter(sound, t[shown()] ?? "");
        setShown((n) => n + 1);
        if (shown() >= t.length) clearInterval(timer);
      }, TYPE_MS);
    }),
  );

  // Finishes the line if it's still typing, else moves on.
  const next = (): void => {
    if (typing()) {
      clearInterval(timer);
      setShown(text().length);
    } else advance();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!speech()) return;
    if (event.key === "Escape") hush();
    else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) next();
  };
  window.addEventListener("keydown", onKey);
  onCleanup(() => {
    clearInterval(timer);
    window.removeEventListener("keydown", onKey);
  });

  return (
    <Show when={speech() ?? reaction()}>
      <section
        id="dialogue"
        aria-label="Bitbox"
        class={
          speech() === null
            ? "pop fixed right-3 bottom-21 z-40 text-ink-deep sheet wide:right-5"
            : "pop fixed right-3 bottom-21 left-3 z-40 text-ink-deep sheet wide:right-5 sm:left-auto sm:w-115"
        }
      >
        <header class="flex items-center justify-between bg-ink py-1 pr-1 pl-3 text-label tracking-stamp text-paper uppercase">
          <span>
            <span class="mr-1.5 inline-block size-2 rounded-full bg-glow align-middle shadow-glow" />
            Bitbox
          </span>
          <button id="dialog-close" class="px-2 text-sm leading-none hover:text-glow" aria-label="Close" onClick={hush}>
            ✕
          </button>
        </header>
        <div class="flex gap-3 p-3">
          <div class="relative size-31 shrink-0 border-2 border-ink bg-paper grid-paper sm:size-35">
            <RobotScreen expression={face()} talking={typing()} shot="close" class="size-full" />
            <span class="pointer-events-none absolute top-0.5 left-1.5 text-tag tracking-widest text-pencil">
              CAM 01
            </span>
          </div>
          <Show when={speech()}>
            {(s) => (
              <div class="flex min-w-0 flex-1 flex-col">
                {/* A mouse shortcut for Next; the keyboard has Enter and the Next button. */}
                <div role="presentation" onClick={next}>
                  <p class="min-h-dialogue cursor-pointer text-copy leading-snug" aria-live="polite">
                    {text().slice(0, shown())}
                    <Show when={!typing()}>
                      <span class="caret" />
                    </Show>
                  </p>
                </div>
                <div class="mt-auto flex items-center justify-between pt-2">
                  <span class="text-xs text-pencil">
                    {s().index + 1} / {s().count}
                  </span>
                  <button id="dialog-next" class="btn btn-sm" onClick={next}>
                    {s().index + 1 < s().count ? "Next ▸" : "Got it"}
                  </button>
                </div>
              </div>
            )}
          </Show>
        </div>
      </section>
    </Show>
  );
}
