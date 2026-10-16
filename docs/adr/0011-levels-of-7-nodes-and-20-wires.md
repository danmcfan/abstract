# 11. A level's solution has 7 nodes or fewer and 20 wires or fewer

Date: 2026-10-16

## Status

Accepted. Supersedes [ADR 10](0010-small-levels.md).

## Context

[ADR 10](0010-small-levels.md) capped a solution at 10 parts and didn't count splits, joins or wires. Levels kept within it and were still hard to build: a split or join is a node the player places and wires like any part, and a board's difficulty is mostly in its wires. Later levels (the register file, the control unit, the CPU) ran to dozens of wires under the 10-part cap (#72).

## Decision

- A level's intended solution has **7 nodes or fewer** and **20 wires or fewer**. A test checks every level with a solution.
- **Nodes:** every node the solution places counts: parts, splits, joins and constants (ON). Terminals don't count, and neither does a node the level supplies, such as the CPU's program memory.
- **Wires:** every wire counts, including wires to and from terminals. A fan-out is one wire per input pin.
- ADR 10's methods stay. When a solution would go over, or holds a clear sub-circuit, that sub-circuit becomes **its own level** before it and goes in the parts bin as one part. When a circuit is the same thing once per signal, the level builds it **narrow** and `gives` the full-width part.

## Consequences

- Six levels are over the limit today: ALU SLICE, REGISTER FILE, 4-TO-16 DECODER, CONTROL UNIT, EXECUTE UNIT and CPU. The test skips them by name while #72 redesigns them, and fails if one of them comes within the limit, so each redesign removes its level from the list.
- Layers have more, smaller levels, and each new layer's brief counts its solutions' nodes and wires before it is ready for an agent.
