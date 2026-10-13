# 6. A built part behaves as its level says, not as the player wired it

Date: 2026-10-12

## Status

Accepted

## Context

Once a level is solved, its part goes into the parts bin and later boards use it as one node. That node could run the player's schematic as a nested circuit, or compute what the level asked for. Running the schematic feels truer to "you built this", but every board would carry every schematic below it. And a memory part's test run is only a list of steps, so it can pass with a schematic that goes wrong later, and that bug would surface floors up, inside the CPU.

## Decision

A part on the board computes its level's spec: the truth table for a combinational part, or the level's state rule for a memory part. The player's schematic never runs outside its own level. This is how NOT, AND and OR already work (`partKind()` in `src/sim/kind.ts`).

## Consequences

- Board cost doesn't grow with layer depth, so test runs can check many rows (issue #8).
- Each level must define its part's behaviour in code, alongside its truth table or timing table.
- The schematic can still be saved and shown later (a "zoom into a part" view, ADR 2), but only as a drawing.
- [ADR 7](0007-player-numbers-the-instructions.md) makes one exception: the CPU's spec reads the player's instruction set.
