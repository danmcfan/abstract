// Sound cues: the short generated sounds the game makes for things the
// player does. The rest of the game asks for a cue by name; how it sounds is
// the voice's business, and whether it sounds at all is the player's sound
// setting, kept apart from the save so New Game leaves it alone.

export type Cue =
  // Flipping a switch.
  | "switch"
  // Placing a part: paper landing on a desk.
  | "place"
  // Drawing a wire, played on every pointer move while drawing.
  | "pencil"
  // A wire connecting: a relay click.
  | "connect"
  // A tick of the clock: a heavier relay click.
  | "clock"
  // The board becoming unstable: a buzz and a pop.
  | "unstable"
  // A test run starting: a typewriter carriage return.
  | "carriage"
  // A truth table row showing during a test run, lower when it fails.
  | "tick"
  | "fail-tick"
  // A test run passing: a rubber stamp, then a desk bell.
  | "stamp"
  | "bell"
  // A test run failing: a lower, softer stamp and no bell.
  | "fail-stamp"
  // Bitbox typing one letter of a line.
  | "key";

export interface Sound {
  // Pitch is in semitones from the cue's own; only the key cue uses it.
  play(cue: Cue, pitch?: number): void;
}

export const silent: Sound = { play: () => {} };

// A silent sound that remembers what it was asked to play, for tests.
export function recordingSound(): Sound & { played: Cue[]; pitches: number[] } {
  const played: Cue[] = [];
  const pitches: number[] = [];
  return {
    played,
    pitches,
    play: (cue, pitch = 0) => {
      played.push(cue);
      pitches.push(pitch);
    },
  };
}

export interface SoundSetting {
  on(): boolean;
  set(on: boolean): void;
}

export function memorySetting(initial = true): SoundSetting {
  let value = initial;
  return { on: () => value, set: (on) => void (value = on) };
}

// Sound is on unless the player turned it off. Its own key, so erasing the
// save doesn't touch it.
export function localSetting(key = "abstract.sound"): SoundSetting {
  return {
    on: () => {
      try {
        return localStorage.getItem(key) !== "off";
      } catch {
        return true;
      }
    },
    set: (on) => {
      try {
        localStorage.setItem(key, on ? "on" : "off");
      } catch {}
    },
  };
}

// A sound that plays through the voice only while the setting is on.
export function switchedSound(voice: Sound, setting: SoundSetting): Sound {
  return {
    play: (cue, pitch) => {
      if (setting.on()) voice.play(cue, pitch);
    },
  };
}

// Bitbox's typewriter: a key for each letter or digit, its pitch moving a
// little from letter to letter so a line doesn't drone. Spaces and
// punctuation are silent.
export function typeLetter(sound: Sound, char: string): void {
  const code = char.toLowerCase().codePointAt(0);
  if (code === undefined || !/[\p{L}\p{N}]/u.test(char)) return;
  sound.play("key", (((code * 7) % 5) - 2) / 2);
}
