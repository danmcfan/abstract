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
The on/off value on a wire or pin. "On" is drawn lit blue. In code a wire's signals are its `value`, a number with one bit per signal; a node that shows as on is `isHigh`.
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

**Constant**:
A node from the Wiring section that always gives one fixed signal, on or off. Like split and join, it isn't a part.
_Avoid_: tie-off, source, VCC/GND

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

**Clock speed**:
How many ticks per second Run gives the clock. The player sets it on a gauge, from 1 to 64, on every level with a clock and in the door program; nothing the player builds makes a part faster or slower.
_Avoid_: frequency, tempo

## The computer

**CPU**:
The part built in L8 that runs a program one instruction at a time. Its signals are 8 wide everywhere: data, registers and addresses.
_Avoid_: processor, computer (for the part)

**Register**:
A memory part that keeps one 8-signal value. The CPU has four, R0 to R3.

**Register file**:
The four registers as one part, which gives two registers' values and writes one register in the same tick.

**ALU**:
The part, built in L4, that does one of six operations (add, subtract, and, or, xor, not) on two 8-signal values, chosen by its OP input. Its ZERO output is on when its A input is 0, whatever the operation. It is built from eight **ALU slices**, each the ALU for one signal.
_Avoid_: calculator, math unit

**Program counter**:
The register that holds the address of the next instruction. It adds 1 on each fetch, or takes a new address on a jump.
_Avoid_: PC (in player-facing text), instruction pointer

**Decoder**:
A part that turns a number into one signal: the output with the input's number is on and the rest are off. The CPU's 4-in, 16-out decoder turns an opcode into the instruction it means.

**Sequencer**:
The part that says whether the CPU is on its fetch tick or its execute tick.

**Execute unit**:
The CPU without fetch: the register file, the ALU and the wiring that does one instruction given as inputs. The first L8 level.

**Instruction**:
One thing the CPU can do, such as add two registers or jump. The game fixes what each instruction does; the player names it and numbers it.
_Avoid_: command, op

**Instruction set**:
The player's table, written in L7 before the CPU is built, that gives each instruction a mnemonic and an opcode. The CPU and the door program both use it.
_Avoid_: ISA (in player-facing text), language

**Mnemonic**:
The word the player chose for an instruction, such as `SET`.

**Opcode**:
The number, 0 to 15, the player chose for an instruction, which the CPU reads to know what to do.

**Program memory**:
The memory, 256 instructions long, that holds the program the CPU runs, filled from the player's instruction set. The level supplies it, like a terminal; the player never builds it.
_Avoid_: ROM, code memory

**RAM**:
The memory part, built in L5 from registers, that keeps 8 values the program reads and writes. It holds data, never the program.
_Avoid_: memory (alone), storage

**Device**:
Something outside the CPU that a program reads from with `in` or sends to with `out`: the door, and the keypad the player types a name on.
_Avoid_: port, peripheral

**Fetch** / **Execute**:
The two ticks of every instruction: the first takes the next instruction from program memory, the second does it.
_Avoid_: cycle, phase

**Door program**:
The program the player writes in their instruction set in L9. It reads the name from the keypad, works out the door code and sends it to the door.

**Door code**:
The number the door wants: the sum of the ASCII codes of the letters of TURING, kept to 8 signals (217).

**Clue**:
A pencil note about Alan Turing's life in the margin of the last sheet of each of L1 to L6, shown once that level is solved. The six clues together point to the name the door code comes from.
_Avoid_: hint (Bitbox gives hints), easter egg


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
