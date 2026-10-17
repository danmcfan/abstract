#!/usr/bin/env bash
# Puts every line in the script in Bitbox's desk at 1280×800 and fails on any
# that overflows it even at the smallest text size. Split those in the script.
#
# Usage: bun run desk-lines
set -euo pipefail

BASE=${BASE_URL:?run through scripts/with-server.sh, or set BASE_URL}
agent-browser set viewport 1280 800 >/dev/null
agent-browser open "${BASE}?level=1" >/dev/null
agent-browser wait "#dialogue" >/dev/null

# Says each line, waits two frames for it to fit, and collects those that don't.
result=$(agent-browser eval "(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const over = [];
  for (const text of __abstract.lines()) {
    __abstract.say(text);
    await frame();
    if (document.querySelector('#dialogue [data-overflow]')) over.push(text);
  }
  return over.length === 0 ? 'fits' : over.join(' | ');
})()" | tail -1)
echo "$result"
[[ $result == '"fits"' ]] || { echo "failed: some lines overflow Bitbox's desk" >&2; exit 1; }
echo "Every line fits."
