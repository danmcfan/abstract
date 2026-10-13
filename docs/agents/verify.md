# Verifying a change

Every change ships through a pull request: CI runs `bun run verify` on it, and merging to `main` deploys the live site. Before opening the PR, run the checks for what you changed, then review the diff with `/code-review main`.

| You changed | Run | Done when |
|---|---|---|
| Anything | `bun run check` | Tests, typecheck, build and bundle check pass. |
| Anything the player sees or does | `bun run playthrough` | It prints "Tested!" for every level and exits 0. Then look at `playthrough/level*.png`. |
| Bitbox (`src/robot/`) | `bun run shots` | `shots/sheet.png` shows every expression the way you intended. |
| Before opening the PR | `bun run verify` | `check` plus `playthrough`, the same as CI. |

`playthrough` and `shots` start their own dev server on a free port, with hot reload off and their own browser session, and stop both afterwards. They never collide with a `bun run dev` already running or with another agent.

## The playthrough

`scripts/playthrough.sh` plays every level in a real browser with [agent-browser](https://github.com/vercel-labs/agent-browser). It places gates and draws wires with real mouse drags, saves a screenshot per level and a video to `playthrough/` (or the directory you pass), and fails on a level that doesn't pass or on any page error.

A new level needs a block in this script that solves it. Copy an existing level's block, using `add <GATE> <x> <y>` to place a part at a board cell and `wire <from> <to> [input-index]` to connect pins.

## Driving the game yourself

For a check the playthrough doesn't cover, run your own commands against a private server:

```sh
scripts/with-server.sh bash -c 'agent-browser open "${BASE_URL}?level=2" && agent-browser screenshot out.png'
```

- `?level=N` (dev only) skips the title and opens level N, numbered from 1.
- `window.__abstract` (dev only, defined in `src/main.tsx`) has the board (`game`, `nodes()`), the whole line Bitbox is saying (`saying`, which the popup may still be typing out) and the screen position of any node, pin or board cell (`nodeScreen`, `pinScreen`, `boardScreen`).
- Buttons have stable selectors: `button[data-gate=NOT]` in the parts bin, `#test` (Run test), `#next`, `#status`, `#dialog-close`.

## The model sheet

`/bitbox.html` is the dev-only model sheet. It reads its settings from the URL: `e` (expression), `view` (game, close, front, side, back, top, low), `light` (game, flat, side, noon, backlit, under, night), `bg` (paper, white, blueprint, void, grey, black) and `talk`. `window.__bitbox` controls playback with `seek(seconds)` and `play(on)`.

`bun run shots [out-dir] [query...]` takes one screenshot per query and tiles them into `sheet.png`:

```sh
bun run shots shots/side "e=idle&view=side" "e=happy&view=close&light=night&bg=blueprint"
```

Read `sheet.png` rather than the single shots: one image covers every shot.
