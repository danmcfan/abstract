# 9. Each of OP's signals has one job

Date: 2026-10-14

## Status

Superseded by [ADR 12](0012-op-2-and-3-do-arithmetic.md)

## Context

OP is the 3-signal input that tells an ALU which job to do. It used to number the jobs in a row: 0 add, 1 subtract, 2 and, 3 or, 4 xor, 5 not A, with 6 and 7 doing nothing. No single signal of OP said "arithmetic or logic", so the ALU slice needed a small decoder of its own (an OR, two NOTs and an AND) to pick the result and to keep COUT off for logic jobs. Together with the jobs themselves, that made a board of about 20 parts (issue #51).

Issue #51 splits the slice into parts the player builds first: an add/subtract unit and a logic unit that picks its job with a MUX4.

## Decision

Each signal of OP has one job:

- The **top** signal picks arithmetic (off) or logic (on). It drives the slice's last MUX.
- The **ones** place is subtract in arithmetic: it flips B and, at the bottom of a chain of slices, is the carry in.
- In logic, the **low two** signals are the logic unit's SEL.
- Arithmetic counts only while the top two signals are off, so the slice gates ADD/SUB's sum and carry with NOT (top OR mid), and COUT is the carry only for add and subtract.

So: 0 add, 1 subtract, 4 and, 5 or, 6 xor, 7 not A. OP 2 and 3 do nothing.

## Alternatives considered

- **Keep the old numbers**: no level changes its truth table, but the slice keeps its decoder, and the logic unit's SEL would need OP 2 to 5 turned into 0 to 3, which is more gates again.

## Consequences

- The ALU slice is 7 parts plus a split on OP and a join for SEL: ADD/SUB, LOGIC UNIT, a MUX, and an OR, a NOT and two ANDs that keep OP 2 and 3 at nothing. The level's Wiring gives the 2-bit join, since its terminals have no 2-signal bus.
- The ALU SLICE and 2-BIT ALU levels changed their truth tables, so their revisions are bumped and players solve them again ([ADR 8](0008-new-or-changed-levels-are-played.md)).
- The unused values sit in the middle (2 and 3), not at the end. The player numbers their own instructions ([ADR 7](0007-player-numbers-the-instructions.md)), so the CPU maps them to OP and never has to use 2 or 3.
