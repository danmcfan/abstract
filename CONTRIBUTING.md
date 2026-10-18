# Contributing

## Setup

```sh
bun install
bun run dev           # dev server with hot reload
```

## Checks

```sh
bun test              # simulation tests
bun run check         # type check, lint, format, tests, production build into dist/, bundle check
bun run playthrough   # solves every level in a real browser; screenshots + video in playthrough/
bun run desk-lines    # captures Bitbox's dialogue desk
bun run shots         # contact sheet of Bitbox's expressions in shots/sheet.png
bun run readme-gif    # re-records the README GIF (level 4 at a person's pace) into docs/images/play.gif
bun run verify        # check + desk-lines + playthrough
```

Every push to `main` runs `bun run check` and, if it passes, deploys to GitHub Pages (`.github/workflows/deploy.yml`). The browser runs aren't part of CI, so run `bun run verify` (or `bun run playthrough <N>` for the levels you touched) before pushing.

## Driving the game from scripts

The play-through and shots drive the real game with [agent-browser](https://github.com/vercel-labs/agent-browser), each against its own dev server. In dev builds, `?level=N` skips the title and jumps to a level, and `window.__abstract` exposes the game state and screen positions of nodes and pins. [`docs/agents/verify.md`](docs/agents/verify.md) covers the details.

## Bitbox's model sheet

With dev running, [`/bitbox.html`](http://localhost:5173/bitbox.html) is Bitbox's model sheet. It's a dev-only page where you can orbit him, change lighting and backdrop, play any expression at any speed, pose him by hand with sliders, and save a PNG. Its settings are kept in the URL, and `window.__bitbox` lets scripts drive it.

## Conventions

- [`CODING_STANDARDS.md`](CODING_STANDARDS.md): what code review checks.
- [`GLOSSARY.md`](GLOSSARY.md): the game's vocabulary.
- [`docs/adr/`](docs/adr/): architecture decisions.
- [`docs/vision/board.html`](docs/vision/board.html): the reference for the look, Bitbox and the story.
