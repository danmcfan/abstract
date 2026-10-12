#!/usr/bin/env bash
# Plays every level in a real browser with agent-browser, using real mouse
# drags to place gates and draw wires, and saves a screenshot per level plus a
# video of the whole run.
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
  ab click "button[data-gate=$1]"
  local id; id=$(newest)
  # shellcheck disable=SC2046
  drag $(body "$id") $(board "$2" "$3")
  echo "$id"
}

wire() {
  # shellcheck disable=SC2046
  drag $(pin "$1" out) $(pin "$2" in "${3:-0}")
}

# Closes the robot's popup if it's up, so it can't cover the board.
hush() { agent-browser eval "document.querySelector('#dialog-close')?.click()" >/dev/null; }

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

# Level 1: NAND comes wired; just test it.
check 3 1

# Level 2: NOT is a NAND with both inputs tied together.
ab click "#next"; sleep 0.5; hush
A=$(terminal INPUT A); O=$(terminal OUTPUT OUT)
N=$(add NAND 22 20)
wire "$A" "$N" 0; wire "$A" "$N" 1; wire "$N" "$O"
check 2 2

# Level 3: AND is NAND followed by NOT.
ab click "#next"; sleep 0.5; hush
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

# The video is a convenience: a failed encode warns but doesn't fail the run.
agent-browser record stop >/dev/null 2>&1 || echo "warning: video not saved (agent-browser needs ffmpeg)" >&2
errors=$(agent-browser errors 2>&1 || true)
if [[ -n $errors ]]; then
  echo "page errors:" >&2
  echo "$errors" >&2
  exit 1
fi
echo "saved $OUT/"
