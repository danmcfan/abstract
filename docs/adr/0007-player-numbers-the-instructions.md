# 7. The player names and numbers the instructions, but the game fixes what they do

Date: 2026-10-12

## Status

Accepted

## Context

The vision board promises that the player designs their own instruction set and writes the door program in it (L9). [ADR 6](0006-parts-behave-by-spec.md) says a part computes its level's spec, so the CPU part needs a spec the game can test. If the player chose which instructions exist, there would be no fixed spec to test against; if the player only chose names, the "design" would be cosmetic.

## Decision

The game fixes the list of instructions and what each one does. In L7 the player writes the **instruction set**: a mnemonic and an opcode for each instruction. The CPU part's spec reads that table to decode opcodes, and the door program is assembled with it. This is the one place a part's behaviour depends on something the player made.

## Considered options

- **Names only**: keeps ADR 6 pure, but the player designs nothing the machine sees.
- **Player chooses the instructions**: closest to the vision board, but the CPU has no fixed spec to test and the door program might be impossible to write.

## Consequences

- Assembly comes before the CPU: the player writes the instruction set in L7 and builds the CPU in L8, so the CPU runs the player's own opcodes from its first test run. This swaps L7 and L8 from the vision board.
- The CPU's spec takes the instruction set as input.
- Every opcode in the table must be distinct and fit the opcode field.
