import { soundOn, toggleSound } from "./sound";

// Turns every sound cue on or off. The setting is kept in this browser,
// apart from the save.
export function SoundButton(props: { class?: string }) {
  return (
    <button
      id="sound"
      class={`btn btn-sm btn-ghost ${props.class ?? ""}`}
      aria-pressed={soundOn()}
      onClick={toggleSound}
    >
      {soundOn() ? "Sound on" : "Sound off"}
    </button>
  );
}
