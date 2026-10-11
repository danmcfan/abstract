# 1. Browser-based 3D with Three.js, TypeScript, Vite and Bun

Date: 2026-10-11

## Status

Accepted. Rendering superseded by [ADR 2](0002-2d-svg-board.md).

## Context

The game was a 2D Odin + raylib desktop app. Shipping native binaries makes it hard for people to try. A browser build hosted on GitHub Pages lets anyone play from a link, and we also want to move the presentation to 3D.

## Decision

- Rewrite in **TypeScript**, rendered with plain **Three.js**. Three.js is the most widely used WebGL library and gives us scene, camera, lighting and raycasting without imposing an architecture.
- Use **Bun** as the package manager, script runner and test runner (`bun test`).
- Use **Vite** for the dev server and production build. It's the most mature option for static assets and shaders with Three.js.
- Deploy `dist/` to **GitHub Pages** from a GitHub Actions workflow on every push to `main`.
- Keep the **simulation** (`src/sim/`) free of rendering and DOM code, so it can be unit-tested. The **renderer** (`src/render/`) reads game state and draws it.

## Alternatives considered

- **React Three Fiber**: worth it for React-heavy UIs. Here the state lives in a game loop, so a React reconciler adds friction for no benefit.
- **Babylon.js**: more batteries included (physics, inspector), but heavier, and we don't need those features.
- **Odin compiled to WASM**: keeps the language, but the WebGL/raylib-on-web toolchain is far rougher than the JS ecosystem.
- **Bun's bundler alone (no Vite)**: viable and may replace Vite later, but its asset handling is less proven.

## Consequences

- The Odin source and 2D sprite sheets were removed. They're still in git history before this change.
- Art has to be redone in 3D. For now we use primitive meshes; glTF models can come later.
- The Three.js bundle is about 135 kB gzipped, which is fine for a game.
