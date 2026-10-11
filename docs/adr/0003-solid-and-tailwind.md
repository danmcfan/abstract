# 3. SolidJS for the UI, Tailwind for the HUD

Date: 2026-10-11

## Status

Accepted

## Context

The SVG board and HUD were written as hand-built DOM: create elements once, then toggle classes and attributes every animation frame. That code was long and easy to get subtly wrong.

## Decision

- Use **SolidJS** (via `vite-plugin-solid`) for the board and HUD. Fine-grained signals update only the attributes that change, with no virtual DOM.
- Keep the **sim as plain TypeScript** objects. All changes go through `mutate()` in `src/ui/state.ts`, which settles the circuit and bumps a version signal; components read state through `current()`. A Solid store would need the sim to drop its `Map`s, for no real gain.
- Use **Tailwind** (via `@tailwindcss/vite`) for the HUD. Board shapes keep plain CSS in `src/styles.css`, since their styling is SVG fill/stroke keyed to on/off state.

## Consequences

- The render loop is gone: the DOM updates only when something changes.
- Solid runs a whole element's attribute bindings together, so values that must not change (such as pin offsets inside a node) are computed once outside the JSX.
