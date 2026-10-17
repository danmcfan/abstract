# 1. A browser game in TypeScript, built with Bun and Vite, hosted on GitHub Pages

Date: 2026-10-11

## Status

Accepted

## Context

The game was a 2D Odin + raylib desktop app. Shipping native binaries makes it hard for people to try. A browser build hosted on GitHub Pages lets anyone play from a link.

## Decision

- Rewrite in **TypeScript** for the browser. How it's drawn is decided in [ADR 2](0002-2d-svg-board.md) and [ADR 4](0004-2d-game-3d-robot.md).
- Use **Bun** as the package manager, script runner and test runner (`bun test`).
- Use **Vite** for the dev server and production build.
- Deploy `dist/` to **GitHub Pages** at abstract.dannyobrien.dev from a GitHub Actions workflow on every push to `main`.
- Keep the **simulation** (`src/sim/`) free of rendering and DOM code, so it can be unit-tested.

## Alternatives considered

- **Odin compiled to WASM**: keeps the language, but the WebGL/raylib-on-web toolchain is far rougher than the JS ecosystem.
- **Bun's bundler alone (no Vite)**: viable and may replace Vite later, but its asset handling is less proven.

## Consequences

- The Odin source and 2D sprite sheets were removed. They're still in git history.
- Every push to `main` is a release, so changes are verified (`bun run verify`) before they are pushed straight to `main`.
