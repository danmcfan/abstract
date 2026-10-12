#!/usr/bin/env bash
# Screenshots Bitbox on the model sheet (bitbox.html), paused at the same
# moment of each clip, and tiles them into one contact sheet, so a change to
# the robot can be checked with one image.
#
# Each shot is a model-sheet query: e (expression), view, light, bg, and talk.
# With no shots given, it takes every expression in the game's view.
#
# Usage: bun run shots [out-dir] [query...]
#   e.g. bun run shots shots/side "e=idle&view=side" "e=happy&view=close&light=night&bg=blueprint"
set -euo pipefail

BASE=${BASE_URL:?run through scripts/with-server.sh, or set BASE_URL}
OUT=${1:-shots}
shift || true
if [[ $# -eq 0 ]]; then
  set -- e={idle,happy,worried,thinking,error,sleepy,amazed,loading}
fi
mkdir -p "$OUT"

agent-browser set viewport 1200 900 >/dev/null
files=()
for q in "$@"; do
  name=$(echo "$q" | tr '&=' '_-')
  agent-browser open "${BASE}bitbox.html?$q" >/dev/null
  until [[ $(agent-browser eval "typeof __bitbox" | tail -1) == *object* ]]; do sleep 0.3; done
  agent-browser eval "__bitbox.seek(1.2); __bitbox.play(false); 1" >/dev/null
  agent-browser wait 250 >/dev/null
  agent-browser screenshot "#stage canvas" "$OUT/$name.png" >/dev/null
  files+=("$OUT/$name.png")
done

errors=$(agent-browser errors 2>&1 || true)

# The browser lays out the contact sheet, so no image tools are needed.
{
  echo '<body style="margin:0;padding:8px;background:#fff;font:13px monospace;display:grid;grid-template-columns:repeat(4,300px);gap:8px">'
  for f in "${files[@]}"; do
    echo "<figure style=\"margin:0\"><img src=\"$(basename "$f")\" style=\"width:300px;display:block\"><figcaption>$(basename "$f" .png)</figcaption></figure>"
  done
} >"$OUT/sheet.html"
agent-browser set viewport 1240 400 >/dev/null
agent-browser open "file://$(cd "$OUT" && pwd)/sheet.html" >/dev/null
agent-browser screenshot --full "$OUT/sheet.png" >/dev/null
echo "$OUT/sheet.png (${#files[@]} shots)"
if [[ -n $errors ]]; then
  echo "page errors:" >&2
  echo "$errors" >&2
  exit 1
fi
