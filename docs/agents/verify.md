# Verifying a change

Every change ships through a pull request: CI runs `bun run verify` on it, and merging to `main` deploys the live site. Before opening the PR, run the checks for what you changed, then review the diff with `/code-review main`.

| You changed | Run | Done when |
|---|---|---|
| Anything | `bun run check` | Tests, typecheck, build and bundle check pass. |
| Anything the player sees or does | `bun run playthrough` | It prints "Tested!" for every level and exits 0. Then look at `playthrough/level*.png`. |
| Bitbox (`src/robot/`) | `bun run shots` | `shots/sheet.png` shows every expression the way you intended. |
| Before opening the PR | `bun run verify` | `check` plus `playthrough`, the same as CI. |
| Anything the player sees or hears | Capture it and attach it to the PR ([Evidence on the PR](#evidence-on-the-pr)) | The PR body shows a screenshot of each change, and a video of any motion. |

`playthrough` and `shots` start their own dev server on a free port, with hot reload off and their own browser session, and stop both afterwards. They never collide with a `bun run dev` already running or with another agent.

## The playthrough

`scripts/playthrough.sh` plays every level in a real browser with [agent-browser](https://github.com/vercel-labs/agent-browser). It places gates and draws wires with real mouse drags, saves a screenshot per level and a video to `playthrough/` (or the directory you pass), and fails on a level that doesn't pass or on any page error.

A new level needs a block in this script that solves it. Copy an existing level's block, using `add <GATE> <x> <y>` to place a part at a board cell and `wire <from> <to> [input-index]` to connect pins.

## Driving the game yourself

For a check the playthrough doesn't cover, run your own commands against a private server:

```sh
scripts/with-server.sh bash -c 'agent-browser open "${BASE_URL}?level=2" && agent-browser screenshot evidence/level2.png'
```

To record motion, wrap the steps in `agent-browser record start evidence/<what>.webm "${BASE_URL}?level=2"` and `agent-browser record stop`. Recording opens the URL itself; navigating during a recording freezes the video.

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

## Evidence on the PR

A PR that changes what a player sees or hears shows it in its body: a screenshot of each change, and a video of any motion (an animation, a drag, a sequence of screens). CI's Evidence check (`scripts/check-evidence.sh`, which lists the player-facing paths) fails a PR that changes them without an uploaded file, unless a line of the body starts "No visible change" and says why.

1. **Capture** into `evidence/` (gitignored): your own shots and recordings, plus any of `playthrough/level*.png`, `playthrough/playthrough.webm` or `shots/sheet.png` that show the change. A new or changed level attaches its `playthrough/level<N>.png` and `playthrough/playthrough.webm`. Look at every file before attaching it. For before and after, run the same commands on `main` in a worktree.
2. **Embed** each file beside the claim it proves, as `![The PASSED stamp over the MUX table](evidence/stamp.png)`, with the path relative to the repo root. Videos use the same syntax and render as a player.
3. **Attach** each embedded file, from the repo root, spelled exactly as in the body:

   ```sh
   gh pr create --body-file body.md \
     --attach evidence/stamp.png --attach evidence/ink.webm
   ```

   gh uploads them and rewrites the links. A file attached but not referenced is appended to the end of the body instead.
4. **Check**: `scripts/check-evidence.sh <pr>` passes. To add or replace files later, `gh pr edit <pr> --body-file body.md --attach ...` (each run uploads again, so attach each file once). If some uploads fail, gh still creates the PR and exits non-zero: rerun `gh pr edit` with only the failed files.
