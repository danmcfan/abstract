# Layers of Abstraction

A logic-gate puzzle game for the browser. You start with nothing but a NAND gate and build your way up, one layer of abstraction at a time.

**Play it at [abstract.dannyobrien.dev](https://abstract.dannyobrien.dev/).**

## How to play

Each level asks you to build one gate: NOT, then AND, then OR. Place gates on the board, wire them from inputs to the output, and the game checks your circuit against the gate's full truth table. When you solve a level, the gate you built goes into your toolbox for the next one.

Wires follow the grid and route themselves around gates, so every connection can be followed by eye. Crossings are drawn with a hop, and a dot marks where one signal fans out.

## Built with

- [SolidJS](https://www.solidjs.com/) for the UI and [Tailwind CSS](https://tailwindcss.com/) for styling
- An SVG board, with no canvas or WebGL
- TypeScript, [Vite](https://vite.dev/), and [Bun](https://bun.sh/)

## Development

```sh
bun install
bun run dev      # dev server with hot reload
bun test         # simulation tests
bun run build    # type check + production build into dist/
scripts/playthrough.sh   # with dev running: solves every level in a browser, saves screenshots + video to playthrough/
```

The play-through drives the real game with [agent-browser](https://github.com/vercel-labs/agent-browser). In dev builds, `?level=N` jumps to a level and `window.__abstract` exposes the game state and screen positions of nodes and pins.

Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Layout

- `src/sim/`: game rules with no rendering, so they're unit-testable.
  - `circuit.ts`: nodes, wires, and signal propagation.
  - `route.ts`: grid routing for wires.
  - `gesture.ts`: turns pointer input into circuit edits.
  - `level.ts`: level definitions. `session.ts`: progress through them.
- `src/ui/`: SolidJS components. `Board.tsx` draws the circuit as SVG and handles input; `Hud.tsx` is the overlay (level, truth table, toolbox).
- `docs/adr/`: architecture decisions, such as moving from a 3D board to 2D SVG.
