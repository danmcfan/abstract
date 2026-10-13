# 5. Every part is built only from parts the player has already built

Date: 2026-10-12

## Status

Accepted

## Context

The game is about climbing layers of abstraction, from NAND to a CPU, the way nand2tetris does. A level could offer any gate the circuit needs, but then the player never feels a part they built turn into a single box they can reuse.

## Decision

- The player starts with only **NAND**. Each solved level puts the part it asked for into the **parts bin**, and later levels can use it as one node.
- A level's parts bin is NAND plus every part from an earlier level (`partsBin()` in `src/sim/level.ts`). A test run **fails** if the board uses anything else, even if the truth table matches.
- A level can give a wider part than the one it builds (`gives` on a level), when the wider one is the same circuit repeated. The 2-bit adder level gives the 8-bit adder: the player has built the ripple carry, and building it eight bits wide would only be more wiring. The 2-bit MUX and 2-bit ALU levels give MUX8 and the ALU the same way.
- **Split** and **join** are wiring the level supplies, like terminals, not parts. The rule covers what computes, not how buses are bundled.
- **Constants** (a fixed on or off signal) and **program memory** (the CPU's program, filled from the player's instruction set) are also supplied by the level, not parts. A constant computes nothing, and program memory stands for the program the player writes, not a circuit they build.
- Levels are grouped into **layers** (see the [vision board](../vision/board.html)): each layer is built only from the layers below it.

## Consequences

- The order of `LEVELS` is the game's dependency graph. Adding a level means checking that every part its intended solution uses comes earlier.
- A built part is a single node on the board, however many gates it contains, so boards stay small enough for SVG ([ADR 2](0002-2d-svg-board.md)).
- Parts with more than one output, multi-bit wires and feedback loops (issues #5, #8 and #12) have to fit this rule too.
