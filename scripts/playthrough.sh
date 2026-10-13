#!/usr/bin/env bash
# Plays every level in a real browser with agent-browser, using real mouse
# drags to place gates and draw wires, and saves a screenshot per level plus a
# video of the whole run. It climbs the stack between layers, and screenshots
# the stack (stack-*.png) on the way.
#
# Usage: bun run playthrough [out-dir]
#   (or, against a server you already run: BASE_URL=http://localhost:5173/ scripts/playthrough.sh)
set -euo pipefail

BASE=${BASE_URL:?run through scripts/with-server.sh, or set BASE_URL}
OUT=${1:-playthrough}
mkdir -p "$OUT"
ab() { agent-browser "$@" >/dev/null; }

# Runs a JS expression against the dev hook and prints the result.
js() { agent-browser eval "$1" | tail -1; }

# Drags the mouse between two client points, in steps, as a player would.
drag() {
  ab mouse move "$1" "$2"
  ab mouse down
  for t in 0.25 0.5 0.75 1; do
    # shellcheck disable=SC2046
    ab mouse move $(awk "BEGIN { print int($1 + ($3 - $1) * $t), int($2 + ($4 - $2) * $t) }")
  done
  ab mouse up
}

# Screen point of a node pin or body, as "x y".
pin() { js "(p => Math.round(p.x) + ' ' + Math.round(p.y))(__abstract.pinScreen($1, '$2', ${3:-0}))" | tr -d '"'; }
body() { js "(p => Math.round(p.x) + ' ' + Math.round(p.y))(__abstract.nodeScreen($1))" | tr -d '"'; }
board() { js "(p => Math.round(p.x) + ' ' + Math.round(p.y))(__abstract.boardScreen($1, $2))" | tr -d '"'; }

terminal() { js "__abstract.nodes().find(n => n.type === '$1' && n.label === '$2').id"; }
newest() { js "Math.max(...__abstract.nodes().map(n => n.id))"; }

# Adds a gate from the toolbox and drags it to board cell (x, y). A split or
# join takes its bus width as a fourth argument, when the bin has more than one.
add() {
  ab click "button[data-gate=\"$1\"]${4:+[data-width=\"$4\"]}"
  local id; id=$(newest)
  # shellcheck disable=SC2046
  drag $(body "$id") $(board "$2" "$3")
  echo "$id"
}

# Wires node $1's output pin $4 (default 0) to node $2's input pin $3.
wire() {
  # shellcheck disable=SC2046
  drag $(pin "$1" out "${4:-0}") $(pin "$2" in "${3:-0}")
}

# Closes the robot's popup if it's up, so it can't cover the board.
hush() { agent-browser eval "document.querySelector('#dialog-close')?.click()" >/dev/null; }

# Fails the run with a message unless a JS expression is true.
expect() { [[ $(js "$1") == true ]] || { echo "failed: $2" >&2; exit 1; }; }

# Starts a level from the stack, which must be open, by its sheet number.
sheet() { ab click "button[data-level=\"$1\"]"; sleep 0.5; hush; }

check() {
  hush
  ab click "#test"
  sleep "$1"
  local status; status=$(js "document.querySelector('#status').textContent")
  echo "level $2: $status"
  agent-browser screenshot "$OUT/level$2.png" >/dev/null
  [[ $status == *Tested* ]] || { echo "level $2 failed" >&2; exit 1; }
  hush
}

ab set viewport 1280 800
agent-browser record restart "$OUT/playthrough.webm" "${BASE}?level=1" >/dev/null
until [[ $(js "typeof __abstract") == *object* ]]; do sleep 0.5; done

# Level 1: NAND comes wired; just test it. It's L1's only level, so passing
# leads up to L2 through the stack, where Bitbox names the floor.
check 3 1
expect "document.querySelector('#up').textContent.includes('Up to the logic line')" "level 1 leads up to the logic line"
ab click "#up"; sleep 1.2
expect "!!__abstract.saying?.includes('logic line')" "Bitbox names the new floor"
hush
expect "document.querySelector('[data-layer=\"1\"]').parentElement.dataset.state === 'built'" "L1 is built"
expect "document.querySelector('[data-layer=\"2\"]').parentElement.dataset.state === 'in progress'" "L2 is in progress"
expect "document.querySelector('[data-layer=\"3\"]').parentElement.dataset.state === 'locked'" "L3 is locked"
agent-browser screenshot "$OUT/stack-up.png" >/dev/null

# Level 2: NOT is a NAND with both inputs tied together.
sheet 2
A=$(terminal INPUT A); O=$(terminal OUTPUT OUT)
N=$(add NAND 22 20)
wire "$A" "$N" 0; wire "$A" "$N" 1; wire "$N" "$O"
check 2 2

# Level 3: AND is NAND followed by NOT. A stray gate goes on first, to try
# Clear.
ab click "#next"; sleep 0.5; hush
add NOT 28 10 >/dev/null
ab click "#clear"; ab click "#clear-confirm"
expect "__abstract.nodes().length === 3" "Clear leaves only the terminals"
A=$(terminal INPUT A); B=$(terminal INPUT B); O=$(terminal OUTPUT OUT)
N=$(add NAND 16 21); T=$(add NOT 28 21)
wire "$A" "$N" 0; wire "$B" "$N" 1; wire "$N" "$T"; wire "$T" "$O"
check 3 3

# Level 4: OR is NOT A NAND NOT B.
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); B=$(terminal INPUT B); O=$(terminal OUTPUT OUT)
TA=$(add NOT 15 13); TB=$(add NOT 15 30); N=$(add NAND 28 21)
wire "$A" "$TA"; wire "$B" "$TB"; wire "$TA" "$N" 0; wire "$TB" "$N" 1; wire "$N" "$O"
check 3 4

# Level 5: XOR is four NANDs: NAND A and B, NAND that with each input, then
# NAND the two results.
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); B=$(terminal INPUT B); O=$(terminal OUTPUT OUT)
N=$(add NAND 12 21); NA=$(add NAND 22 13); NB=$(add NAND 22 29); NO=$(add NAND 32 21)
wire "$A" "$N" 0; wire "$B" "$N" 1
wire "$A" "$NA" 0; wire "$N" "$NA" 1; wire "$N" "$NB" 0; wire "$B" "$NB" 1
wire "$NA" "$NO" 0; wire "$NB" "$NO" 1; wire "$NO" "$O"
check 3 5

# Level 6: MUX is (A AND NOT SEL) OR (B AND SEL).
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); B=$(terminal INPUT B); S=$(terminal INPUT SEL); O=$(terminal OUTPUT OUT)
T=$(add NOT 12 28); GA=$(add AND 20 10); GB=$(add AND 20 24); R=$(add OR 30 17)
wire "$S" "$T"; wire "$A" "$GA" 0; wire "$T" "$GA" 1; wire "$B" "$GB" 0; wire "$S" "$GB" 1
wire "$GA" "$R" 0; wire "$GB" "$R" 1; wire "$R" "$O"
check 5 6

# Level 7: DEMUX is Y0 = D AND NOT SEL, Y1 = D AND SEL.
ab click "#next"; sleep 0.5; hush
D=$(terminal INPUT D); S=$(terminal INPUT SEL); Y0=$(terminal OUTPUT Y0); Y1=$(terminal OUTPUT Y1)
T=$(add NOT 14 21); G0=$(add AND 26 12); G1=$(add AND 26 28)
wire "$S" "$T"; wire "$D" "$G0" 0; wire "$T" "$G0" 1; wire "$D" "$G1" 0; wire "$S" "$G1" 1
wire "$G0" "$Y0"; wire "$G1" "$Y1"
check 4 7

# DEMUX ends L2, so passing leads up to adder assembly.
expect "document.querySelector('#up').textContent.includes('Up to adder assembly')" "level 7 leads up to adder assembly"
ab click "#up"; sleep 1.2
expect "!!__abstract.saying?.includes('Adder assembly')" "Bitbox names the new floor"
hush
expect "document.querySelector('[data-layer=\"3\"]').parentElement.dataset.state === 'in progress'" "L3 is in progress"
sheet 8

# Level 8: a half adder is SUM = A XOR B, COUT = A AND B.
A=$(terminal INPUT A); B=$(terminal INPUT B); S=$(terminal OUTPUT SUM); C=$(terminal OUTPUT COUT)
X=$(add XOR 22 12); G=$(add AND 22 28)
wire "$A" "$X" 0; wire "$B" "$X" 1; wire "$A" "$G" 0; wire "$B" "$G" 1
wire "$X" "$S"; wire "$G" "$C"
check 3 8

# Level 9: a full adder is two half adders, with their carries ORed.
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); B=$(terminal INPUT B); CI=$(terminal INPUT CIN)
S=$(terminal OUTPUT SUM); C=$(terminal OUTPUT COUT)
H1=$(add "HALF ADDER" 14 14); H2=$(add "HALF ADDER" 26 20); R=$(add OR 34 30)
wire "$A" "$H1" 0; wire "$B" "$H1" 1; wire "$H1" "$H2" 0; wire "$CI" "$H2" 1
wire "$H2" "$S"
wire "$H1" "$R" 0 1; wire "$H2" "$R" 1 1
wire "$R" "$C"
check 5 9

# Level 10: a 2-bit adder is a ripple carry. Split A and B, stack two full
# adders with the ones place at the bottom by CIN, chain the low COUT into
# the high CIN, and join the SUMs.
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); B=$(terminal INPUT B); CI=$(terminal INPUT CIN)
S=$(terminal OUTPUT SUM); C=$(terminal OUTPUT COUT)
SA=$(add SPLIT 12 9); SB=$(add SPLIT 12 31); J=$(add JOIN 34 16)
wire "$A" "$SA"; wire "$B" "$SB"
CARRY=$CI; CARRY_PIN=0
for bit in 0 1; do
  pin=$((1 - bit))
  F=$(add "FULL ADDER" 22 $((14 + pin * 14)))
  wire "$SA" "$F" 0 "$pin"; wire "$SB" "$F" 1 "$pin"; wire "$CARRY" "$F" 2 "$CARRY_PIN"
  wire "$F" "$J" "$pin" 0
  CARRY=$F; CARRY_PIN=1
done
wire "$J" "$S"; wire "$CARRY" "$C" 0 1
check 3 10

# The 2-bit adder ends L3, so passing leads up to the calculation shop.
expect "document.querySelector('#up').textContent.includes('Up to the calculation shop')" "level 10 leads up to the calculation shop"
ab click "#up"; sleep 1.2
expect "!!__abstract.saying?.includes('calculation shop')" "Bitbox names the new floor"
hush
expect "document.querySelector('[data-layer=\"3\"]').parentElement.dataset.state === 'built'" "L3 is built"
expect "document.querySelector('[data-layer=\"4\"]').parentElement.dataset.state === 'in progress'" "L4 is in progress"
sheet 11

# Level 11: MUX8 is a MUX per signal. Split A and B, give each pair of
# signals a MUX with SEL on all eight, and join the outputs in order.
A=$(terminal INPUT A); B=$(terminal INPUT B); SEL=$(terminal INPUT SEL); O=$(terminal OUTPUT OUT)
SA=$(add SPLIT 16 15); SB=$(add SPLIT 24 45); J=$(add JOIN 48 30)
wire "$A" "$SA"; wire "$B" "$SB"
for pin in 0 1 2 3 4 5 6 7; do
  M=$(add MUX 36 $((6 + pin * 7)))
  wire "$SA" "$M" 0 "$pin"; wire "$SB" "$M" 1 "$pin"; wire "$SEL" "$M" 2
  wire "$M" "$J" "$pin"
done
wire "$J" "$O"
check 5 11

# Level 12: the zero test ORs A's signals together in pairs, down to one
# wire that's on when A isn't zero, and NOTs it.
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); Z=$(terminal OUTPUT ZERO)
SP=$(add SPLIT 17 22)
wire "$A" "$SP"
R=()
for i in 0 1 2 3; do
  R[i]=$(add OR 26 $((10 + i * 8)))
  wire "$SP" "${R[i]}" 0 $((2 * i)); wire "$SP" "${R[i]}" 1 $((2 * i + 1))
done
R4=$(add OR 35 14); R5=$(add OR 35 30); R6=$(add OR 43 22); N=$(add NOT 51 22)
wire "${R[0]}" "$R4" 0; wire "${R[1]}" "$R4" 1; wire "${R[2]}" "$R5" 0; wire "${R[3]}" "$R5" 1
wire "$R4" "$R6" 0; wire "$R5" "$R6" 1; wire "$R6" "$N"; wire "$N" "$Z"
check 3 12

# Level 13: the ALU slice works out every job side by side and MUXes on OP
# pick one. The full adder adds A to B XOR OP's ones place, so OP 1
# subtracts, and COUT is the carry only while OP's top two signals are off.
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); B=$(terminal INPUT B); CI=$(terminal INPUT CIN); OP=$(terminal INPUT OP)
O=$(terminal OUTPUT OUT); C=$(terminal OUTPUT COUT)
SP=$(add SPLIT 14 50 3)
FLIP=$(add XOR 14 26); F=$(add "FULL ADDER" 23 12)
GA=$(add AND 23 25); GO=$(add OR 23 31); GX=$(add XOR 23 37); NA=$(add NOT 23 43)
P23=$(add MUX 32 28); P45=$(add MUX 32 40); N1=$(add NOT 32 48); ANY=$(add OR 32 54)
LOW=$(add MUX 41 16); HIGH=$(add AND 41 42); NONE=$(add NOT 41 54)
RES=$(add MUX 50 18); CO=$(add AND 50 38)
wire "$OP" "$SP"
wire "$B" "$FLIP" 0; wire "$SP" "$FLIP" 1 2
wire "$A" "$F" 0; wire "$FLIP" "$F" 1; wire "$CI" "$F" 2
wire "$A" "$GA" 0; wire "$B" "$GA" 1; wire "$A" "$GO" 0; wire "$B" "$GO" 1
wire "$A" "$GX" 0; wire "$B" "$GX" 1; wire "$A" "$NA"
wire "$GA" "$P23" 0; wire "$GO" "$P23" 1; wire "$SP" "$P23" 2 2
wire "$GX" "$P45" 0; wire "$NA" "$P45" 1; wire "$SP" "$P45" 2 2
wire "$SP" "$N1" 0 1; wire "$SP" "$ANY" 0 1; wire "$SP" "$ANY" 1 0
wire "$F" "$LOW" 0; wire "$P23" "$LOW" 1; wire "$SP" "$LOW" 2 1
wire "$P45" "$HIGH" 0; wire "$N1" "$HIGH" 1; wire "$ANY" "$NONE"
wire "$LOW" "$RES" 0; wire "$HIGH" "$RES" 1; wire "$SP" "$RES" 2 0
wire "$F" "$CO" 0 1; wire "$NONE" "$CO" 1
wire "$RES" "$O"; wire "$CO" "$C"
check 7 13

# Level 14: the ALU is eight slices in a chain, the ones place at the
# bottom, each COUT into the next CIN. The bottom CIN is OP's ones place:
# on for subtract, off for add. A zero test on A gives ZERO.
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); B=$(terminal INPUT B); OP=$(terminal INPUT OP)
O=$(terminal OUTPUT OUT); Z=$(terminal OUTPUT ZERO)
SA=$(add SPLIT 17 22); SB=$(add SPLIT 25 44); SO=$(add SPLIT 33 82 3)
J=$(add JOIN 56 40); ZT=$(add "ZERO TEST" 56 66)
wire "$A" "$SA"; wire "$B" "$SB"; wire "$OP" "$SO"
CARRY=$SO; CARRY_PIN=2
for bit in 0 1 2 3 4 5 6 7; do
  pin=$((7 - bit))
  S=$(add "ALU SLICE" 44 $((6 + pin * 10)))
  wire "$SA" "$S" 0 "$pin"; wire "$SB" "$S" 1 "$pin"; wire "$CARRY" "$S" 2 "$CARRY_PIN"; wire "$OP" "$S" 3
  wire "$S" "$J" "$pin" 0
  CARRY=$S; CARRY_PIN=1
done
wire "$J" "$O"; wire "$A" "$ZT"; wire "$ZT" "$Z"
check 9 14

# The ALU ends L4, and L5 has no levels yet, so there's no way up.
expect "!document.querySelector('#up') && !document.querySelector('#next')" "no way up from the last level"

# The HUD button opens the stack on the current layer, and each level keeps
# its board: going back to the zero test finds it still wired.
expect "document.querySelector('#open-stack').textContent.includes('L4 · the calculation shop')" "the HUD names the current layer"
ab click "#open-stack"; sleep 0.8; hush
expect "document.querySelector('[data-layer=\"4\"]').parentElement.dataset.state === 'built'" "L4 is built"
agent-browser screenshot "$OUT/stack-built.png" >/dev/null
sheet 12
expect "__abstract.levelIndex === 11 && __abstract.game.edges.size === 17" "the zero test keeps its board"

# The title offers the stack once there's a save.
ab click "#menu"; sleep 0.5
ab click "#title-stack"; sleep 0.8
expect "!!document.querySelector('#stack [aria-current=step]')" "the stack opens from the title on the saved level"
ab click "#stack-close"; sleep 0.3
expect "!!document.querySelector('#continue')" "Back returns to the title"

# The video is a convenience: a failed encode warns but doesn't fail the run.
agent-browser record stop >/dev/null 2>&1 || echo "warning: video not saved (agent-browser needs ffmpeg)" >&2
errors=$(agent-browser errors 2>&1 || true)
if [[ -n $errors ]]; then
  echo "page errors:" >&2
  echo "$errors" >&2
  exit 1
fi
echo "saved $OUT/"
