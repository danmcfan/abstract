# Verifying a change

Every change is committed and pushed straight to `main`: each push deploys the live site, and CI runs `bun run check` on it, with no browser. Before you push, run the checks for what you changed, then review your unpushed commits with `/code-review origin/main`.

| You changed                       | Run                                           | Done when                                                                       |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| Anything                          | `bun run check`                               | Typecheck, Oxlint, Prettier, knip, escapes, tests, build and bundle check pass. |
| A level (added or edited)         | `bun run playthrough <N>...` for those levels | It prints "Tested!" for each and exits 0. Look at its shot and video.           |
| Anything else the player does     | `bun run playthrough`                         | It prints "Tested!" for every level, climbs the stack and exits 0.              |
| Bitbox (`src/robot/`)             | `bun run shots`                               | `shots/sheet.png` shows every expression the way you intended.                  |
| Anything the player sees or hears | Capture it ([Evidence](#evidence))            | You have looked at a screenshot of each change, and a video of any motion.      |

`bun run verify` runs `check` and then the whole `playthrough`.

`playthrough` and `shots` start their own dev server on a free port, with hot reload off and their own browser session, and stop both afterwards. They never collide with a `bun run dev` already running or with another agent. The browser is muted by `agent-browser.json` at the repo root, so the game's sound never plays on the machine running the checks.

## The playthrough

`scripts/playthrough.sh` plays levels in a real browser with [agent-browser](https://github.com/vercel-labs/agent-browser). It places gates and draws wires with real mouse drags, and fails on a level that doesn't pass or on any page error. CI doesn't run it: `bun test` proves every level's solution passes, and the playthrough is the local proof that a player can build it.

`bun run playthrough 13 14` plays only levels 13 and 14. Each level starts from `?level=N` and saves `level<N>.png` and `level<N>.webm` to `playthrough/` (or `PLAYTHROUGH_DIR`). With no levels named it plays every level in order, climbing the stack after each layer's last level (`stack-up-L<N>.png` and its own video), and ends on the stack (`stack-built.png`, `stack-built.webm`). The climbs need the progress saved by the levels before them, so a run that names levels skips them.

It builds each level from the `solution` in its `LEVELS` entry (`src/sim/level.ts`): every part dragged from the parts bin to its board cell, then every wire. A new level needs no change to the script, only its `solution`, which `bun test` also builds and checks.

## Driving the game yourself

For a check the playthrough doesn't cover, run your own commands against a private server:

```sh
scripts/with-server.sh bash -c 'agent-browser open "${BASE_URL}?level=2" && agent-browser screenshot evidence/level2.png'
```

To record motion, wrap the steps in `agent-browser record start evidence/<what>.webm "${BASE_URL}?level=2"` and `agent-browser record stop`. Recording opens the URL itself; navigating during a recording freezes the video.

- `?level=N` (dev only) skips the title and opens level N, numbered from 1.
- `window.__abstract` (dev only, defined in `src/main.tsx`) has the board (`game`, `nodes()`), the whole line Bitbox is saying (`saying`, which Bitbox may still be typing out) and the screen position of any node, pin or board cell (`nodeScreen`, `pinScreen`, `boardScreen`).
- Buttons have stable selectors: `button[data-gate=NOT]` in the parts bin, `#test` (Run test), `#next`, `#status`, `#dialog-close`.

## The model sheet

`/bitbox.html` is the dev-only model sheet. It reads its settings from the URL: `e` (expression), `view` (game, close, front, side, back, top, low), `light` (game, flat, side, noon, backlit, under, night), `bg` (paper, white, blueprint, void, grey, black) and `talk`. `window.__bitbox` controls playback with `seek(seconds)` and `play(on)`.

`bun run shots [out-dir] [query...]` takes one screenshot per query and tiles them into `sheet.png`:

```sh
bun run shots shots/side "e=idle&view=side" "e=happy&view=close&light=night&bg=blueprint"
```

Read `sheet.png` rather than the single shots: one image covers every shot.

## Evidence

A change to what a player sees or hears is proved by a screenshot of each change, and a video of any motion (an animation, a drag, a sequence of screens). Nothing in CI checks this: it's the author's job. A change that adds or edits a level always checks that level's `playthrough/level<N>.png` and `playthrough/level<N>.webm`.

1. **Capture** into `evidence/` (gitignored): your own shots and recordings, plus any of `playthrough/level*.png`, `playthrough/*.webm` or `shots/sheet.png` that show the change. For before and after, run the same commands on `main` in a worktree before you push.
2. **Look** at every file, and fix the change until each one shows what you meant.
3. **Report** what the evidence shows in the commit message, and name the files in `evidence/` when you hand back, so the owner can look at them too.
