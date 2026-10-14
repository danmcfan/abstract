import { Show, type JSX } from "solid-js";
import { soundOn, toggleSound } from "./sound";

// Turns every sound cue on or off. The setting is kept in this browser,
// apart from the save.
export function SoundButton(props: { class?: string }): JSX.Element {
  return (
    <button
      id="sound"
      class={`inline-flex btn items-center gap-1.5 btn-sm btn-ghost ${props.class ?? ""}`}
      aria-pressed={soundOn()}
      onClick={toggleSound}
    >
      <Speaker on={soundOn()} />
      {soundOn() ? "Sound on" : "Sound off"}
    </button>
  );
}

// A speaker giving out sound waves, or crossed out when the sound is off.
function Speaker(props: { on: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      class="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
      <Show when={props.on} fallback={<path d="M11.5 6l3.5 4M15 6l-3.5 4" />}>
        <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5M13.5 3.5a6.5 6.5 0 0 1 0 9" />
      </Show>
    </svg>
  );
}
