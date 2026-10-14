# 10. The game plays only on a desktop

Date: 2026-10-14

## Status

Accepted

## Context

The sheet is moving from panels floating over a full-screen board to a fixed layout: the menu bar across the top, the brief down the left, Bitbox's desk and the parts bin along the bottom, and the board in the rest. That layout needs room. Keeping a narrow layout as well meant two layouts to build, style and verify for every change, and building a board means dragging wires between pins, which is made for a mouse.

Small touch devices used to get a notice with a "Continue anyway" button, and a narrow desktop window got a separate stacked layout.

## Decision

The game plays only on a desktop-sized, mouse-first screen. A window smaller than 1100×700, or any touch-first device (`pointer: coarse`) whatever its size, shows the notice instead of the game, with no way past it. A desktop window shrunk below the minimum shows the notice telling the player to make the window bigger, and the game comes back when it is big enough.

The narrow layout is removed.

## Consequences

Phone and tablet players can't play at all. Every screen the game draws can assume the minimum size, so there is one layout to build and verify.
