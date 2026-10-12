import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { typeLetter } from "../sim/sound";
import { sound } from "./sound";
import { advance, hush, speech } from "./speech";
import { RobotScreen } from "./RobotScreen";

const TYPE_MS = 24;
const GRID_PAPER = {
  "background-image":
    "linear-gradient(rgba(47,111,196,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(47,111,196,.16) 1px, transparent 1px)",
  "background-size": "16px 16px",
};

// The robot's popup: a little video window of it pulling a face, and what
// it's saying, typed out. It sits over the board without blocking play.
export function Dialogue() {
  const [shown, setShown] = createSignal(0);
  const text = () => speech()?.line.text ?? "";
  const typing = () => shown() < text().length;
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
  const next = () => {
    if (typing()) {
      clearInterval(timer);
      setShown(text().length);
    } else advance();
  };

  const onKey = (event: KeyboardEvent) => {
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
    <Show when={speech()}>
      {(s) => (
        <section
          id="dialogue"
          aria-label="Bitbox"
          class="sheet pop fixed right-3 bottom-[84px] left-3 z-40 text-ink-deep sm:left-auto sm:w-[460px] min-[900px]:right-5"
        >
          <header class="flex items-center justify-between bg-ink py-1 pr-1 pl-3 text-[11px] tracking-[0.14em] text-paper uppercase">
            <span>
              <span class="mr-1.5 inline-block size-2 rounded-full bg-glow align-middle shadow-[0_0_6px_var(--color-glow)]" />
              Bitbox
            </span>
            <button id="dialog-close" class="px-2 text-sm leading-none hover:text-glow" aria-label="Close" onClick={hush}>
              ✕
            </button>
          </header>
          <div class="flex gap-3 p-3">
            <div class="relative size-[124px] shrink-0 border-2 border-ink bg-paper sm:size-[140px]" style={GRID_PAPER}>
              <RobotScreen expression={s().line.face} talking={typing()} shot="close" class="size-full" />
              <span class="pointer-events-none absolute top-0.5 left-1.5 text-[9px] tracking-widest text-pencil">CAM 01</span>
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <p class="min-h-[6.6em] cursor-pointer text-[15px] leading-snug" aria-live="polite" onClick={next}>
                {text().slice(0, shown())}
                <Show when={!typing()}>
                  <span class="caret" />
                </Show>
              </p>
              <div class="mt-auto flex items-center justify-between pt-2">
                <span class="text-xs text-pencil">
                  {s().index + 1} / {s().count}
                </span>
                <button id="dialog-next" class="btn btn-sm" onClick={next}>
                  {s().index + 1 < s().count ? "Next ▸" : "Got it"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </Show>
  );
}
