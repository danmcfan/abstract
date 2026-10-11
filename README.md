# abstract

Layers of Abstraction is a logic-gate puzzle game that runs in the browser.

## Development

```sh
bun install
bun run dev      # dev server with hot reload
bun test         # simulation tests
bun run build    # type check + production build into dist/
scripts/playthrough.sh   # with dev running: solves every level in a browser, saves screenshots + video to playthrough/
```

The play-through drives the real game with [agent-browser](https://github.com/vercel-labs/agent-browser). In dev builds, `?level=N` jumps to a level and `window.__abstract` exposes the game state and screen positions of nodes and pins.

Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`. In the repo, set **Settings → Pages → Source** to **GitHub Actions**.

## Layout

- `src/sim/`: game state and rules. No rendering, so it's unit-testable.
- `src/ui/`: SolidJS components. `Board.tsx` draws the circuit as SVG and handles input; `Hud.tsx` is the overlay (level, truth table, toolbox), styled with Tailwind. `state.ts` holds the game and level state.
- `src/styles.css`: Tailwind import and theme, plus the board's SVG styles.
- `src/main.tsx`: entry point.

## Levels

You start with only NAND. Each level asks you to build a gate (NOT, then AND, then OR), checked against its full truth table. Solving it adds that gate to your toolbox for the next level. Levels are data in `src/sim/level.ts`.
