#!/usr/bin/env bash
# Plays levels in a real browser with agent-browser, using real mouse drags to
# place gates and draw wires. Each level starts from ?level=N and saves its
# own screenshot and video. With no levels named it plays every level in order,
# climbing the stack after each layer's last level and screenshotting it.
#
# Usage: bun run playthrough [level...]
#   (or, against a server you already run: BASE_URL=http://localhost:5173/ scripts/playthrough.sh 13 14)
#   PLAYTHROUGH_DIR sets the output directory (default playthrough/).
set -euo pipefail

BASE=${BASE_URL:?run through scripts/with-server.sh, or set BASE_URL}
OUT=${PLAYTHROUGH_DIR:-playthrough}
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

# Adds a gate from the parts bin and drags it to board cell (x, y). A split
# or join takes its bus width as a fourth argument, when the bin has more than
# one. The bin pages sideways, so its card is brought fully into view first,
# as a player would page to it.
add() {
  local card="button[data-gate=\"$1\"]${4:+[data-width=\"$4\"]}"
  ab eval "document.querySelector('$card').scrollIntoView({ inline: 'nearest', block: 'nearest' })"
  ab click "$card"
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

# Closes Bitbox's line if one is up, so the popup over the stack can't cover it.
hush() { agent-browser eval "document.querySelector('#dialog-close')?.click()" >/dev/null; }

# Fails the run with a message unless a JS expression is true.
expect() { [[ $(js "$1") == true ]] || { echo "failed: $2" >&2; exit 1; }; }

# Like expect, but gives the page up to 10 seconds to make it true.
wait_for() {
  local tries=0
  until [[ $(js "$1") == true ]]; do
    ((tries++ < 40)) || { echo "failed: $2" >&2; exit 1; }
    sleep 0.25
  done
}

# Starts a level from the stack, which must be open, by its sheet number.
sheet() { ab click "button[data-level=\"$1\"]"; sleep 0.5; hush; }

# Runs the test on level $2 and waits for it to end, screenshotting the
# result to $3 when given. A test run's length is its row
# count times the step time, so a fixed sleep races it on a slow machine:
# this waits at least the given seconds, then polls until the run is over,
# giving up 30 seconds later.
check() {
  hush
  ab click "#test"
  sleep "$1"
  local status tries=0
  status=$(js "document.querySelector('#status').textContent")
  while [[ $status == *Testing* && $tries -lt 120 ]]; do
    sleep 0.25
    tries=$((tries + 1))
    status=$(js "document.querySelector('#status').textContent")
  done
  echo "level $2: $status"
  if [[ -n ${3:-} ]]; then agent-browser screenshot "$3" >/dev/null; fi
  [[ $status == *Tested* ]] || { echo "level $2 failed" >&2; exit 1; }
  hush
}

# Builds the open level's intended solution, from its entry in LEVELS, with
# real drags: each node from the parts bin to its cell, then each wire.
solve() {
  local parts wires part wire_ends type x y width ids=()
  # A level that comes wired has no solution to build.
  [[ $(js "!!__abstract.solution") == true ]] || return 0
  IFS=';' read -ra parts <<<"$(js "__abstract.solution.nodes.map(p => [p.type, p.x, p.y, p.width ?? ''].join('|')).join(';')" | tr -d '"')"
  for part in "${parts[@]}"; do
    IFS='|' read -r type x y width <<<"$part"
    ids+=("$(add "$type" "$x" "$y" "$width")")
  done
  IFS=';' read -ra wires <<<"$(js "__abstract.solutionWires([$(IFS=,; echo "${ids[*]}")]).map(w => [w.from.node, w.to.node, w.to.index, w.from.index].join(' ')).join(';')" | tr -d '"')"
  for wire_ends in "${wires[@]}"; do
    # shellcheck disable=SC2086
    wire $wire_ends
  done
}

# Fails the run unless the stack shows layer $1 in state $2.
layer() {
  expect "document.querySelector('[data-layer=\"$1\"]').parentElement.dataset.state === '$2'" "L$1 is $2"
}

# Opens level $1 from its URL, recording to $2 when given, and waits for the
# dev hook and the robot's opening line.
open_level() {
  if [[ -n ${2:-} ]]; then
    agent-browser record restart "$2" "${BASE}?level=$1" >/dev/null
  else
    ab open "${BASE}?level=$1"
  fi
  until [[ $(js "typeof __abstract") == *object* ]]; do sleep 0.5; done
  sleep 0.5
  hush
}

# The video is a convenience: a failed encode warns but doesn't fail the run.
stop_recording() {
  agent-browser record stop >/dev/null 2>&1 || echo "warning: video not saved (agent-browser needs ffmpeg)" >&2
}

# Whether the open level is the instruction set, which has a form, not a board.
typing_pool() { [[ $(js "!!document.querySelector('#instruction-set')") == true ]]; }

# Fills in the instruction set the way a player would: Bitbox's picks for
# every row, then a name of their own for one, typed in. The check is live,
# so the level is solved once every row is good.
write_table() {
  hush
  ab click "#use-all"
  sleep 0.5; hush
  ab fill "tr[data-instruction=\"add\"] input" plus
  sleep 0.5
  wait_for "document.querySelector('#table-status').textContent.startsWith('15 of 15')" "level $1: every row is good"
  expect "document.querySelector('tr[data-instruction=\"add\"] input').value === 'PLUS'" "level $1 keeps the typed name"
  echo "level $1: $(js "document.querySelector('#table-status').textContent")"
  if [[ -n ${2:-} ]]; then agent-browser screenshot "$2" >/dev/null; fi
}

# Plays level $1 on its own: open it, build its solution and test it.
play() {
  open_level "$1" "$OUT/level$1.webm"
  if typing_pool; then
    write_table "$1" "$OUT/level$1.png"
    stop_recording
    return
  fi
  # On the AND level, a stray gate goes on first, to try Clear.
  if [[ $(js "__abstract.gate" | tr -d '"') == AND ]]; then
    add NOT 28 10 >/dev/null
    ab click "#clear"; ab click "#clear-confirm"
    expect "__abstract.nodes().length === 3" "Clear leaves only the terminals"
  fi
  solve
  check 2 "$1" "$OUT/level$1.png"
  stop_recording
}

# Climbs the stack from level $1, the last of its layer, in its own video.
# The full run climbs as it goes, while the layers above are unsolved, so each
# shows the state a player would see. Reopening the level keeps its board, and
# testing it again puts the way up on screen.
climb() {
  local n=$1 floor number
  open_level "$n" "$OUT/stack-up-from-$n.webm"
  check 2 "$n"
  floor=$(js "__abstract.layerOf($n).floor" | tr -d '"')
  number=$(js "__abstract.layerOf($n).number")
  expect "document.querySelector('#up').textContent.includes('Up to $floor')" "level $n leads up to $floor"
  ab click "#up"; sleep 1.2
  expect "!!__abstract.saying?.toLowerCase().includes('${floor#the }')" "Bitbox names $floor"
  hush
  layer $((number - 1)) built
  layer "$number" "in progress"
  if ((number < 9)); then layer $((number + 1)) locked; fi
  agent-browser screenshot "$OUT/stack-up-L$number.png" >/dev/null
  stop_recording
}

# After every level: the last one, the menu bar, the saved boards and the title.
finish() {
  local count=$1 floor number
  # The last level has no way on until its layer's next level exists.
  open_level "$count" "$OUT/stack-built.webm"
  if typing_pool; then write_table "$count"; else check 2 "$count"; fi
  expect "!document.querySelector('#up') && !document.querySelector('#next')" "no way on from the last level"

  # The menu bar's button opens the stack on the current layer, and each level keeps
  # its board: going back to the level before finds it still wired.
  number=$(js "__abstract.layerOf($count - 1).number")
  floor=$(js "__abstract.layerOf($count - 1).floor" | tr -d '"')
  expect "document.querySelector('#open-stack').textContent.includes('L$number · $floor')" "the menu bar names the current layer"
  ab click "#open-stack"; sleep 0.8; hush
  layer "$number" built
  agent-browser screenshot "$OUT/stack-built.png" >/dev/null
  sheet $((count - 1))
  wait_for "__abstract.levelIndex === $((count - 2))" "the stack opens level $((count - 1))"
  expect "__abstract.game.edges.size === __abstract.solution.wires.length" "level $((count - 1)) keeps its board"

  # The title offers the stack once there's a save.
  ab click "#menu"; sleep 0.5
  ab click "#title-stack"; sleep 0.8
  expect "!!document.querySelector('#stack [aria-current=step]')" "the stack opens from the title on the saved level"
  ab click "#stack-close"; sleep 0.3
  expect "!!document.querySelector('#continue')" "Back returns to the title"
  stop_recording
}

ab set viewport 1280 800
if (($# > 0)); then
  for n in "$@"; do play "$n"; done
else
  open_level 1
  COUNT=$(js "__abstract.levelCount")
  # Stack climbs: each layer's last level leads up to the next.
  for ((n = 1; n <= COUNT; n++)); do
    play "$n"
    if ((n < COUNT)) && [[ $(js "__abstract.layerOf($n - 1).number < __abstract.layerOf($n).number") == true ]]; then
      climb "$n"
    fi
  done
  finish "$COUNT"
fi

errors=$(agent-browser errors 2>&1 || true)
if [[ -n $errors ]]; then
  echo "page errors:" >&2
  echo "$errors" >&2
  exit 1
fi
echo "saved $OUT/"
