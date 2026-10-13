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

# Adds a gate from the toolbox and drags it to board cell (x, y).
add() {
  ab click "button[data-gate=\"$1\"]"
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

# The full adder is the last level so far, and L4 has none yet, so there's
# no way up.
expect "!document.querySelector('#up') && !document.querySelector('#next')" "no way up from the last level"

# The HUD button opens the stack on the current layer, and each level keeps
# its board: going back to the half adder finds it still wired.
expect "document.querySelector('#open-stack').textContent.includes('L3 · adder assembly')" "the HUD names the current layer"
ab click "#open-stack"; sleep 0.8; hush
expect "document.querySelector('[data-layer=\"3\"]').parentElement.dataset.state === 'built'" "L3 is built"
agent-browser screenshot "$OUT/stack-built.png" >/dev/null
sheet 8
expect "__abstract.levelIndex === 7 && __abstract.game.edges.size === 6" "the half adder keeps its board"

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
