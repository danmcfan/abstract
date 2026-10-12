# Layers of Abstraction

A logic-gate puzzle game: the player starts with NAND and builds every other part from the parts they've already built, one layer at a time, to program their way out of a locked factory.

## Progression

**Layer**:
A set of parts that are each built only from the layers below it (L1 NAND, L2 basic gates, L3 arithmetic, and so on up to L9, the door program). The level-select screen is the layer stack.
_Avoid_: tier, world, stage

**Floor**:
The place in the factory where a layer happens, such as "adder assembly" for L3. It's the story's name for a layer, never a separate unit of progress.

**Level**:
One puzzle: build a single part to match its truth table. Defined in `LEVELS` in `src/sim/level.ts`.
_Avoid_: puzzle, challenge, stage

**Prebuilt level**:
A level that comes already wired, where the player only runs the test to see what the part does. The first level, NAND, is one.

**Solved**:
A level whose test run passed. Solving a level puts its part in the parts bin for every later level.
_Avoid_: completed, cleared, beaten

## The board

**Board**:
The grid the player builds a circuit on, with its nodes and wires. In code it's the `Game` type from `src/sim/circuit.ts`.
_Avoid_: canvas, workspace, breadboard

**Sheet**:
The drafting sheet the whole screen is drawn as, in the vision board's drafting mode: white grid paper and blue ink. Each level's sheet is numbered ("SH 04").

**Node**:
Anything placed on the board: a gate or a terminal.
_Avoid_: component, element, block

**Gate**:
A node that computes an output from its inputs: NAND, NOT, AND, OR, and later parts.

**Terminal**:
A node at the board's edge that the level places and the player can't remove: an input (a switch the player can flip) or an output (a lamp). Each level gives its terminals short names, such as A, B, SEL or CIN in and SUM or COUT out; a level with one output calls it OUT. A part's pins carry the same names.
_Avoid_: port, I/O

**Pin**:
A connection point on a node, an input pin on its left or an output pin on its right.
_Avoid_: port, socket, connector

**Wire**:
A connection from one output pin to one input pin. `Edge` in code. Wires route themselves along the grid (`src/sim/route.ts`).
_Avoid_: edge (outside code), link, trace

**Signal**:
The on/off value on a wire or pin. "On" is drawn lit blue; in code it's `isHigh`.
_Avoid_: current, power, voltage

**Settle**:
Propagate signals through the board until every node's output matches its inputs. Every circuit command settles before it returns. Wires may form loops, so settling can take several passes.
_Avoid_: propagate, tick, update

**Unstable**:
A board that never settles, because a loop keeps flipping its own signal (a NOT wired to itself). An unstable board fails its test run.
_Avoid_: oscillating, broken

**Bus**:
A wire that carries several signals at once, up to 8, drawn thicker and marked with its width. A pin can be a bus pin, and a bus only connects pins of the same width.
_Avoid_: cable, ribbon

**Split** / **Join**:
Nodes that turn a bus into single-signal wires (split) or single-signal wires into a bus (join). Every level with buses supplies them in the **Wiring** section at the end of the parts bin; they aren't parts, so the player never builds them.
_Avoid_: splitter, mux (a MUX is a part)

## Parts

**Part**:
Something the player can place from the parts bin. Every part is a gate the player has built, apart from NAND, which Bitbox remembers. On the board a part behaves as its level's truth table says, not as the player's schematic is wired.
_Avoid_: chip, component, tool

**Parts bin**:
The parts available on a level: NAND plus every part from an earlier solved level. Using anything else fails the test.
_Avoid_: toolbox, inventory, palette

**Schematic**:
How a part is built from other parts. Bitbox remembers one schematic, NAND, and the player draws the rest.
_Avoid_: blueprint, recipe

## Testing

**Truth table**:
Every combination of a level's inputs with the expected outputs, counting up in binary with A as the high bit. A level with buses has too many rows to show, so its table shows only a few named cases, and the test run checks the other rows out of sight, adding any that fail to the table.

**Test run**:
Stepping the board through every truth table row, one row at a time on screen, then recording pass or fail. Started by Run test.
_Avoid_: check, simulation, evaluation

**Timing table**:
The test for a memory level: a list of steps, where each step sets the inputs, may tick the clock, and gives the expected outputs. A memory part's outputs depend on what came before, so a truth table can't describe it.
_Avoid_: sequence, waveform

**Step**:
One row of a timing table.

**Clock**:
The CLK input terminal on a memory or control level. A **tick** turns it on and then off. Each memory part's level says when it takes in a value: a D latch while the clock is on, a D flip-flop (and every part built on it) when the clock turns on. During a test run the run drives the clock; while building, the player ticks it by hand with Tick, or lets it run.
_Avoid_: timer, pulse

## Bitbox

**Bitbox**:
The robot helper, a clunky crate robot with a CRT face who remembers only NAND and talks the player through the levels. Drawn in 3D (`src/robot/`).
_Avoid_: the robot (in player-facing text), assistant, mascot

**Expression**:
One of Bitbox's eight moods (idle, happy, worried, thinking, error, sleepy, amazed, loading): a face drawing plus a clip.
_Avoid_: emotion, mood, animation

**Clip**:
A looping pose function for one expression, plain math that can be sampled without a renderer (`src/robot/clips.ts`).

**Stage**:
The single Three.js renderer that draws Bitbox in the game and moves into whichever window is showing him.

**Line**:
One thing Bitbox says, with the expression he says it in. All of them are in `src/ui/script.ts`.
_Avoid_: dialogue, message, caption

**Story flag**:
A saved marker for something that has already happened, such as a line Bitbox has already said.

**Model sheet**:
The dev-only page (`bitbox.html`) for orbiting, lighting and posing Bitbox.

## Saves

**Save**:
The player's progress, the board in progress and the story flags, kept in the browser (`src/sim/save.ts`). Continue resumes it; New Game erases it.
_Avoid_: profile, slot, progress file
