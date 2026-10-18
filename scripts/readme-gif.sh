#!/usr/bin/env bash
# Records the README's GIF: level 4 (OR) played at a person's pace, with a
# drawn cursor, pauses between moves, and Bitbox's lines left to finish typing.
# The video is cut down to docs/images/play.gif.
#
# Usage: scripts/with-server.sh scripts/readme-gif.sh
set -euo pipefail

BASE=${BASE_URL:?run through scripts/with-server.sh, or set BASE_URL}
WORK=$(mktemp -d)
VIDEO=$WORK/play.webm
GIF=docs/images/play.gif
LEVEL=4
ab() { agent-browser "$@" >/dev/null; }
js() { agent-browser eval "$1" | tail -1; }

# Headless video has no pointer, so the page draws one that follows the mouse.
CURSOR='(() => {
  const c = document.createElement("div");
  c.innerHTML = `<svg width="22" height="26" viewBox="0 0 22 26"><path d="M1 1 L1 20 L6 15 L10 24 L13 23 L9 14 L16 14 Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 99999, pointerEvents: "none", transition: "transform 60ms linear", transformOrigin: "1px 1px" });
  document.body.append(c);
  let x = 640, y = 400, s = 1;
  const draw = () => (c.style.transform = `translate(${x}px, ${y}px) scale(${s})`);
  addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; draw(); }, true);
  addEventListener("pointerdown", () => { s = 0.85; draw(); }, true);
  addEventListener("pointerup", () => { s = 1; draw(); }, true);
  draw();
})()'

X=640 Y=400
# Glides the mouse to (x, y), easing in and out, holding the button if the
# caller pressed it.
glide() {
  local steps=14 i
  for ((i = 1; i <= steps; i++)); do
    # shellcheck disable=SC2046
    ab mouse move $(awk "BEGIN { t = $i / $steps; e = t < 0.5 ? 2*t*t : 1 - (-2*t + 2)^2 / 2; print int($X + ($1 - $X) * e), int($Y + ($2 - $Y) * e) }")
  done
  X=$1 Y=$2
}
pause() { sleep "$1"; }
click_at() { glide "$1" "$2"; pause 0.25; ab mouse down; pause 0.1; ab mouse up; }
drag() { glide "$1" "$2"; pause 0.3; ab mouse down; glide "$3" "$4"; pause 0.2; ab mouse up; }

point() { js "(p => Math.round(p.x) + ' ' + Math.round(p.y))($1)" | tr -d '"'; }
center() { point "(r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }))(document.querySelector('$1').getBoundingClientRect())"; }
newest() { js "Math.max(...__abstract.nodes().map(n => n.id))"; }

# Waits for Bitbox to finish typing the line on screen, then lets it be read.
read_line() {
  until [[ $(js "!!document.querySelector('section[aria-label=Bitbox] .caret:not(.invisible)')") == true ]]; do sleep 0.1; done
  pause "${1:-1.5}"
}
# Reads each of Bitbox's lines, then clicks Next or Got it.
listen() {
  while [[ $(js "!!document.querySelector('#dialog-next')") == true ]]; do
    read_line
    # shellcheck disable=SC2046
    click_at $(center "#dialog-next")
    pause 0.4
  done
}

ab set viewport 1280 800
agent-browser record restart "$VIDEO" "${BASE}?level=$LEVEL" >/dev/null
until [[ $(js "typeof __abstract") == *object* ]]; do sleep 0.2; done
ab eval "$CURSOR"
pause 0.5
listen
pause 0.8

# The level's intended solution, built at a person's pace.
IFS=';' read -ra parts <<<"$(js "__abstract.solution.nodes.map(p => [p.type, p.x, p.y].join('|')).join(';')" | tr -d '"')"
ids=()
for part in "${parts[@]}"; do
  IFS='|' read -r type x y <<<"$part"
  # shellcheck disable=SC2046
  drag $(center "button[data-gate=\"$type\"]") $(point "__abstract.boardScreen($x, $y)")
  ids+=("$(newest)")
  pause 0.6
done
IFS=';' read -ra wires <<<"$(js "__abstract.solutionWires([$(IFS=,; echo "${ids[*]}")]).map(w => [w.from.node, w.from.index, w.to.node, w.to.index].join(' ')).join(';')" | tr -d '"')"
for w in "${wires[@]}"; do
  read -r from fi to ti <<<"$w"
  # shellcheck disable=SC2046
  drag $(point "__abstract.pinScreen($from, 'out', $fi)") $(point "__abstract.pinScreen($to, 'in', $ti)")
  pause 0.5
done
pause 0.8

# shellcheck disable=SC2046
click_at $(center "#test")
until [[ $(js "document.querySelector('#stamp') !== null") == true ]]; do sleep 0.2; done
# shellcheck disable=SC2046
glide $(point "({ x: 980, y: 560 })")
read_line 2.5
agent-browser record stop >/dev/null

ffmpeg -v error -y -i "$VIDEO" -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none" "$GIF"
rm -rf "$WORK"
echo "wrote $GIF"
