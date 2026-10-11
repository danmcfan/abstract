# 2. Draw the board in 2D with SVG

Date: 2026-10-11

## Status

Accepted. Supersedes the Three.js rendering part of [ADR 1](0001-browser-3d-with-threejs.md); TypeScript, Bun, Vite and GitHub Pages stay.

## Context

The game is a circuit puzzle. What matters is reading the circuit: which wire goes where, and which wires are on. A top-down 3D view added shading and shadows but no information, and blurry canvas-textured labels, raycasting and lighting tuning made it harder to work on.

## Decision

- Draw the board as **SVG**, with the viewBox in grid cells. Gates, pins and wires are DOM elements styled with CSS.
- **Route wires** with A* over the grid (`src/sim/route.ts`): around gates, never sharing a segment with a different signal, crossing only at right angles with a hop, and with junction dots where one signal fans out.

## Alternatives considered

- **Keep Three.js, flat style**: possible, but pays for a 3D engine to draw rectangles and lines.
- **Canvas 2D**: faster for thousands of shapes or heavy per-frame effects. A board holds dozens of parts, since each solved gate becomes one box, so SVG's built-in hit-testing, CSS and crisp text win. If huge circuits arrive, the wire layer can move to canvas on its own.

## Consequences

- The bundle drops from about 142 kB to about 8 kB gzipped.
- Playthrough scripts can find gates and pins as elements (`data-node`, `data-pin`).
- A "zoom into a gate to see its circuit" effect, if wanted, would be a 2D zoom and crossfade rather than a camera flight.
