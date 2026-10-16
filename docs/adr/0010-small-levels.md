# 10. A level's solution places 10 parts or fewer

Date: 2026-10-14

## Status

Superseded by [ADR 11](0011-levels-of-7-nodes-and-20-wires.md)

## Context

The first ALU SLICE level asked for about 16 parts on a 60×60 board. It was hard to read and hard to wire, and a player who made one mistake had to trace through all of it. Issue #51 split it into MUX4, ADD/SUB and LOGIC UNIT levels, and the slice became 7 parts. Later layers (memory, control, the CPU) hold bigger circuits still, so the same thing would happen again without a rule.

## Decision

- A level's intended solution places **10 parts or fewer**. Splits and joins are Wiring, not parts ([ADR 5](0005-parts-only-from-earlier-levels.md)), so they don't count. A test checks every level.
- When a solution would go over, or holds a clear sub-circuit, that sub-circuit becomes **its own level** before it, and goes in the parts bin as one part. MUX4, ADD/SUB and LOGIC UNIT came out of the ALU slice this way.
- When a circuit is the same thing once per signal, the level builds it **2 signals wide** and `gives` the 8-signal part, as the 2-bit adder, 2-BIT MUX and 2-BIT ALU do. The player doesn't wire eight copies.

## Consequences

- Layers have more, smaller levels. L5 has nine levels, not seven: the 8-signal register comes from a 2-BIT REGISTER, and DEMUX4 and 4-WAY MUX8 levels come before the register file, which drops from 13 parts to 7 (#13).
- Each new layer's brief counts its solutions' parts before it is ready for an agent. The CPU (#15) is the most likely to go over.
- Boards can shrink to fit their solutions.
