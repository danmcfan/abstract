#!/usr/bin/env bash
# Plays levels 1-3 in a real browser with agent-browser, using real mouse
# drags to place gates and draw wires, and saves a screenshot per level plus a
# video of the whole run.
#
# Usage: bun run dev, then scripts/playthrough.sh [base-url] [out-dir]
set -euo pipefail

BASE=${1:-http://localhost:5173/}
OUT=${2:-playthrough}
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

terminal() { js "__abstract.nodes().find(n => n.type === '$1' && n.label === '${2:-NONE}').id"; }
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

check() {
  ab click "#test"
  sleep "$1"
  local status; status=$(js "document.querySelector('#status').textContent")
  echo "level $2: $status"
  agent-browser screenshot "$OUT/level$2.png" >/dev/null
  [[ $status == *Solved* ]] || { echo "level $2 failed" >&2; exit 1; }
}

ab set viewport 1280 800
agent-browser record restart "$OUT/playthrough.webm" "${BASE}?level=1" >/dev/null
until [[ $(js "typeof __abstract") == *object* ]]; do sleep 0.5; done

# Level 1: NOT is a NAND with both inputs tied together.
A=$(terminal INPUT ALPHA); O=$(terminal OUTPUT)
N=$(add NAND 22 20)
wire "$A" "$N" 0; wire "$A" "$N" 1; wire "$N" "$O"
check 2 1

# Level 2: AND is NAND followed by NOT.
ab click "#next"; sleep 0.5
A=$(terminal INPUT ALPHA); B=$(terminal INPUT BETA); O=$(terminal OUTPUT)
N=$(add NAND 16 21); T=$(add NOT 28 21)
wire "$A" "$N" 0; wire "$B" "$N" 1; wire "$N" "$T"; wire "$T" "$O"
check 3 2

# Level 3: OR is NOT A NAND NOT B.
ab click "#next"; sleep 0.5
A=$(terminal INPUT ALPHA); B=$(terminal INPUT BETA); O=$(terminal OUTPUT)
TA=$(add NOT 15 13); TB=$(add NOT 15 30); N=$(add NAND 28 21)
wire "$A" "$TA"; wire "$B" "$TB"; wire "$TA" "$N" 0; wire "$TB" "$N" 1; wire "$N" "$O"
check 3 3

agent-browser record stop >/dev/null
echo "saved $OUT/"
