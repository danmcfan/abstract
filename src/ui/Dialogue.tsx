import { Show, createEffect, createSignal, on, onCleanup, type JSX } from "solid-js";
import { typeLetter } from "../sim/sound";
import { sound } from "./sound";
import { isTyping } from "./keys";
import { advance, hush, reaction, speech } from "./speech";
import { RobotScreen } from "./RobotScreen";
import type { Expression } from "../robot/expression";

const TYPE_MS = 24;

// Docked, a line's text starts at its largest size and steps down a pixel at
// a time until it fits the desk, never below the smallest. A line that won't
// fit even then is marked, for the check that every line fits, and split in
// the script.
const LARGEST_PX = 18;
const SMALLEST_PX = 14;

// Bitbox's video window of him pulling a face, and what he's saying, typed
// out. During play it's docked in Bitbox's desk, where he sits idle between
// lines. Over the stack it pops up instead, and a reaction with no line
// shows just the video window, for a moment.
export const DIALOGUE_ID = "dialogue";
const text = (): string => speech()?.line.text ?? "";
const face = (): Expression => reaction() ?? speech()?.line.face ?? "idle";

// The classes for each way the window shows: docked in the desk, popped up
// with a line, or popped up with just a face.
interface Look {
  section: string;
  body: string;
  camera: string;
  text: string;
}
const DOCKED: Look = {
  section: "flex min-h-0 flex-col text-ink-deep sheet",
  body: "flex min-h-0 flex-1 gap-3 p-2.5",
  camera: "size-24 self-start",
  text: "line-fit",
};
const POPUP: Look = {
  section: "pop fixed right-5 bottom-5 z-40 w-115 text-ink-deep sheet",
  body: "flex gap-3 p-3",
  camera: "size-35",
  text: "min-h-dialogue text-copy",
};
const FACE_ONLY: Look = { ...POPUP, section: "pop fixed right-5 bottom-5 z-40 text-ink-deep sheet" };

export function Dialogue(props: { docked?: boolean }): JSX.Element {
  const look = (): Look => {
    if (props.docked === true) return DOCKED;
    return speech() === null ? FACE_ONLY : POPUP;
  };
  const [shown, setShown] = createSignal(0);
  const typing = (): boolean => shown() < text().length;
  const [overflows, setOverflows] = createSignal(false);
  let box: HTMLDivElement | undefined;
  let words: HTMLParagraphElement | undefined;
  const hold = (el: HTMLParagraphElement): void => {
    words = el;
  };

  // Sizes the line to fit the desk. The whole line is laid out from the
  // start, with the untyped rest invisible, so it never resizes as it types.
  const fit = (): void => {
    const desk = box;
    if (props.docked !== true || !desk || !words) return;
    const over = (): boolean => desk.scrollHeight > desk.clientHeight;
    let px = LARGEST_PX;
    words.style.setProperty("--line-size", `${px}px`);
    while (px > SMALLEST_PX && over()) words.style.setProperty("--line-size", `${--px}px`);
    setOverflows(over());
  };
  const watch = (el: HTMLDivElement): void => {
    box = el;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    // A web font arriving resizes the line but not the desk.
    void document.fonts.ready.then(fit);
    onCleanup(() => {
      observer.disconnect();
    });
  };

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let timer: ReturnType<typeof setInterval> | undefined;
  createEffect(
    on(text, (t) => {
      clearInterval(timer);
      setShown(reduced ? t.length : 0);
      fit();
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
    if (!speech() || isTyping(event.target)) return;
    if (event.key === "Escape") hush();
    else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) next();
  };
  window.addEventListener("keydown", onKey);
  onCleanup(() => {
    clearInterval(timer);
    window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      {/* Announced once, whole, rather than letter by letter as it types. Always mounted, so even the first line is a change to a live region that already exists. */}
      <p class="sr-only" aria-live="polite">
        {text()}
      </p>
      <Show when={props.docked === true || speech() !== null || reaction() !== null}>
        <section id={DIALOGUE_ID} aria-label="Bitbox" class={look().section}>
          <header class="flex items-center justify-between bg-ink py-1 pr-1 pl-3 text-label tracking-stamp text-paper uppercase">
            <span>
              <span class="mr-1.5 inline-block size-2 rounded-full bg-glow align-middle shadow-glow" />
              Bitbox
            </span>
            <Show when={speech()}>
              <button
                id="dialog-close"
                class="px-2 text-sm leading-none hover:text-glow"
                aria-label="Close"
                onClick={hush}
              >
                ✕
              </button>
            </Show>
          </header>
          <div class={look().body}>
            <div class={`relative shrink-0 border-2 border-ink bg-paper grid-paper ${look().camera}`}>
              <RobotScreen expression={face()} talking={typing()} shot="close" class="size-full" />
              <span class="pointer-events-none absolute top-0.5 left-1.5 text-tag tracking-widest text-pencil">
                CAM 01
              </span>
            </div>
            <Show when={speech()}>
              {(s) => (
                <div class="flex min-w-0 flex-1 flex-col">
                  {/* A mouse shortcut for Next; the keyboard has Enter and the Next button. */}
                  <div
                    ref={watch}
                    role="presentation"
                    class="min-h-0 flex-1 overflow-hidden"
                    data-overflow={overflows() ? "" : undefined}
                    onClick={next}
                  >
                    <p ref={hold} class={`cursor-pointer leading-snug ${look().text}`} aria-hidden="true">
                      {text().slice(0, shown())}
                      {/* The rest of the line and the caret take their room from the start, so the line fits as it'll end up. */}
                      <span class="invisible">{text().slice(shown())}</span>
                      <span class={typing() ? "caret invisible" : "caret"} />
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
    </>
  );
}
