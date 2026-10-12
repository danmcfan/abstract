# Coding standards

The review step reads this file. `bun run verify` already enforces the rules a script can check, so skip them in review:

- Three.js is imported only in `src/robot/`, and `src/sim/` imports only other sim modules (`src/boundaries.test.ts`).
- Dev pages and Three.js stay out of the first load, and every chunk is under 500 kB (`scripts/check-bundle.ts`).
- Types check, tests pass, and the playthrough solves every level with no page errors.

## Game rules

- **Rules live in `src/sim/`.** Anything that decides what happens in the game (wiring, signals, levels, test runs, saves) belongs in a plain TypeScript sim module with a `bun test` next to it. A component that works out game logic for itself is a finding.
- **The board changes only through circuit commands.** Outside `src/sim/circuit.ts`, code calls `placeNode`, `wire`, `setInput` and the rest; it never edits `game.nodes` or `game.edges` directly. In the UI, every change goes through `mutate()` in `src/ui/state.ts`.
- **A new level is a complete level.** It needs its entry in `LEVELS`, a test of its truth table, Bitbox's intro, hint and solved lines in `src/ui/script.ts`, and steps in `scripts/playthrough.sh` that solve it. Its intended solution uses only parts from earlier levels ([ADR 5](docs/adr/0005-parts-only-from-earlier-levels.md)).
- **Old saves keep loading.** A change to `SaveData` or the board format has to read saves written before it, the way `parseSave` and the legacy key do in `src/sim/save.ts`. A save that can't be read must load as no save, never as a crash.

## Robot

- **An expression is a clip plus a face.** Poses are plain functions in `src/robot/clips.ts` that can be sampled without a renderer. Animation state hidden inside the renderer or the stage is a finding.
- **One stage.** The game has a single WebGL renderer (`src/robot/stage.ts`). A second renderer or canvas in the game is a finding; the model sheet's viewer is the dev-only exception.

## Words

- **Use the glossary.** Names in code, comments, issue text and player-facing text use the terms in `GLOSSARY.md`, not the words it lists under _Avoid_.
- **Bitbox talks in short lines, one idea each.** Lines that explain controls use the names on screen ("Run test", "parts bin").
- **Comments say why.** Match the existing comments: a sentence or two of plain English above the code it explains, describing intent or a non-obvious constraint, never what the next line does.

## Decisions

- **Flag ADR conflicts.** A change that contradicts an ADR in `docs/adr/` either comes with an updated or superseding ADR, or it's a finding.
- **Stay in scope.** Behaviour or refactors that the issue didn't ask for are findings, even when they're improvements.
