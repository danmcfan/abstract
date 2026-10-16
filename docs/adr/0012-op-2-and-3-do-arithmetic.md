# 12. OP 2 and 3 do arithmetic

Date: 2026-10-16

## Status

Accepted. Supersedes [ADR 9](0009-op-signals-each-have-one-job.md).

## Context

Under ADR 9, OP 2 and 3 gave nothing and COUT was the carry only for add and subtract. Keeping them that way cost the ALU slice an OR, a NOT and two ANDs, which put it at 9 nodes and 22 wires, over the limit of [ADR 11](0011-levels-of-7-nodes-and-20-wires.md) (issue #83). The CPU never uses OP 2 or 3, and the 8-bit ALU has no COUT.

## Decision

Each signal of OP keeps its job from ADR 9, but nothing gates arithmetic:

- The **top** signal picks arithmetic (off) or logic (on).
- In arithmetic, only the **ones** place matters: it means subtract. So 0 and 2 add, 1 and 3 subtract.
- In logic, the **low two** signals are the logic unit's SEL: 4 and, 5 or, 6 xor, 7 not A.
- COUT is ADD/SUB's carry for every OP, logic jobs included.

## Consequences

- The ALU slice is ADD/SUB, LOGIC UNIT and a MUX, plus a split on OP and a join for SEL: 5 nodes and 15 wires.
- The ALU SLICE and 2-BIT ALU levels changed their truth tables, so their revisions are bumped and players solve them again ([ADR 8](0008-new-or-changed-levels-are-played.md)).
- The CPU still never uses OP 2 or 3 ([ADR 7](0007-player-numbers-the-instructions.md)), so a program sees no difference.
