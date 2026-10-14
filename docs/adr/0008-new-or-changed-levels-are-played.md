# 8. A new or changed level must be solved before progress goes past it

Date: 2026-10-14

## Status

Accepted

## Context

A save used to hold progress as a count of solved levels and the open level's position in `LEVELS`, so adding or moving a level shifted every save onto the wrong levels (issue #42). Issue #51 adds levels in the middle of L4, and each one gives a part that the levels after it use. Levels will also change after players have solved them, such as a new truth table or new terminals.

Progress goes one level at a time: a level is playable once every level before it is solved.

## Decision

A save holds the levels the player has solved, by the gate each builds, with the revision of the level they solved. A level has a `revision`, 1 unless set, that is bumped when the level changes enough that it must be solved again.

A level counts as solved only at its current revision. A level that is new, or changed since the player solved it, is unsolved, so progress stops there and the save opens on it. Once the player solves it, progress jumps past the levels after it that they had already solved, and their boards on those levels are kept.

## Alternatives considered

- **Open where the save left off, and let the new level wait**: keeps the player where they were, but they could reach a level without the parts it needs, and the stack and unlocking would have to stop being a single count.
- **Detect a changed level automatically**, from its truth table and terminals: no revision to forget, but a fix that doesn't change the puzzle, like a new hint, would still send players back, and a wide level's full truth table is slow to read on every load.

## Consequences

- Whoever changes a level decides whether players must solve it again, and bumps its `revision` if so.
- A save from before this change is read with today's `LEVELS`, every level at revision 1. That is right only because no level was added or moved between that save format and this one.
- A player can be sent back to an early level by an update, but never loses a board or the levels they solved after it.
