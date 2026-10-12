# 4. A 2D game with a 3D robot

Date: 2026-10-12

## Status

Accepted. Builds on [ADR 2](0002-2d-svg-board.md): the board and every screen stay 2D. Three.js, dropped for the board in ADR 2, comes back only to draw the robot helper.

## Context

The game now has a character: Bitbox, a clunky robot helper who remembers only the NAND gate and talks you through the levels (see the [vision board](../vision/board.html), concept B, "the crate"). We tried a 3D factory cutscene as the opening, then decided the game should stay 2D: title, tutorial and play all happen on the drafting-sheet screen. What the robot needs is a face with expressions. A small live 3D render shows those better than flat sprites, and it can match its mouth to the text as it types.

## Decision

- **Everything is 2D** (SolidJS, SVG and Tailwind), in the vision board's drafting mode: white grid paper, blue ink, Courier Prime.
- **The robot is 3D**, drawn with plain Three.js in `src/robot/` and shown in small windows: the title sheet and the robot's dialogue popup.
- The robot is drawn in the vision board's style: white cel-shaded shapes (`MeshToonMaterial`, three tones) with blue ink outlines (inverted hulls). Its face is drawn on a canvas and textured onto its CRT screen.
- **Expressions are clips**: one looping pose function per expression (idle, happy, worried, thinking, error, sleepy, amazed, loading) in `clips.ts`. These are plain math, so they can be sampled and tested without a renderer. The stage blends from one clip to the next.
- There is **one stage**, a single renderer and canvas that moves into whichever window is showing the robot, so the game never holds more than one WebGL context.
- Three.js is **lazy-loaded** with a dynamic `import()`. Until it arrives, or if WebGL is missing, the window shows the robot's sketch from the vision board.

## Alternatives considered

- **Pre-rendered video clips**: an expression would be a file. But the clips can't match the typing, they cost more to ship than the code, and every change to the robot means rendering them all again.
- **A 3D factory around the board**: dropped. It pulled attention from the circuit, and a 22-second opening was long for a puzzle game.

## Consequences

- The robot's chunk (Three.js plus the stage) loads on the title screen, apart from the main bundle.
- New expressions are a pose function plus a face drawing, and nothing else.
- The tutorial is the robot's lines (`src/ui/script.ts`). Story flags in the saved game remember what it has already said.
