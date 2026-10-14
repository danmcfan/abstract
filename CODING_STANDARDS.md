# Coding standards

The review step reads this file. `bun run verify` already enforces the rules a script can check, so skip them in review:

- Three.js is imported only in `src/robot/`, and `src/sim/` imports only other sim modules (`src/boundaries.test.ts`).
- Dev pages and Three.js stay out of the first load, and every chunk is under 500 kB (`scripts/check-bundle.ts`).
- Types check under the strict `tsconfig.json`, Oxlint passes with no warnings (`.oxlintrc.json`, including the Solid rules and `@shadcn/lint`'s design-system rules), Prettier finds nothing to change, and knip finds no unused files, exports or dependencies.
- No comment switches a check off: `eslint-disable`, `oxlint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` and `prettier-ignore` all fail (`scripts/check-escapes.ts`).
- Tests pass, and the playthrough solves every level with no page errors.

**Fix the code, not the rule.** A change that loosens `tsconfig.json`, `.oxlintrc.json`, `knip.json` or the check scripts to get code through is a finding. Those files are in CODEOWNERS.

## Styling

- **Tailwind classes go in `class`, never in `classList`.** `@shadcn/lint` reads `class` but not Solid's `classList`, so a utility there skips every design-system check. `classList` only toggles state classes that `src/styles.css` defines, such as `high` or `shake`.
- **A new value is a token.** A size, colour or spacing the theme lacks goes in `@theme` (or an `@utility`) in `src/styles.css` with a name, not in a class as an arbitrary value. Values that change at runtime reach CSS through a custom property (`style={{ "--car-top": ... }}`), not a style property.

## Game rules

- **Rules live in `src/sim/`.** Anything that decides what happens in the game (wiring, signals, levels, test runs, saves) belongs in a plain TypeScript sim module with a `bun test` next to it. A component that works out game logic for itself is a finding.
- **The board changes only through circuit commands.** Outside `src/sim/circuit.ts`, code calls `placeNode`, `wire`, `setInput` and the rest; it never edits `game.nodes` or `game.edges` directly. In the UI, every change goes through `mutate()` in `src/ui/state.ts`.
- **A new level is a complete level.** It needs its entry in `LEVELS`, its intended `solution` in that entry, a test of its truth table, and Bitbox's intro, hint and solved lines in `src/ui/script.ts`. Its intended solution uses only parts from earlier levels ([ADR 5](docs/adr/0005-parts-only-from-earlier-levels.md)); `bun test` builds every solution and fails one that doesn't pass.
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
