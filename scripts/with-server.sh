#!/usr/bin/env bash
# Runs a command against a private dev server, then shuts the server down.
# The server gets a free port and has hot reload off, so edits made while the
# command runs can't reload the page under it. The command sees BASE_URL, and
# AGENT_BROWSER_SESSION is unique to this run, so parallel runs don't share a
# browser.
#
# Usage: scripts/with-server.sh <command> [args...]
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=$(bun -e 'const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(s.port); s.stop(true)')
LOG=${TMPDIR:-/tmp}/abstract-vite-$PORT.log
export BASE_URL="http://localhost:$PORT/"
export AGENT_BROWSER_SESSION=${AGENT_BROWSER_SESSION:-abstract-$PORT}

ABSTRACT_NO_HMR=1 bunx vite --port "$PORT" --strictPort >"$LOG" 2>&1 &
SERVER=$!
cleanup() {
  agent-browser close >/dev/null 2>&1 || true
  kill "$SERVER" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  curl -sf -o /dev/null "$BASE_URL" && break
  kill -0 "$SERVER" 2>/dev/null || { echo "dev server exited; log:" >&2; cat "$LOG" >&2; exit 1; }
  sleep 0.5
done
curl -sf -o /dev/null "$BASE_URL" || { echo "dev server didn't start; log:" >&2; cat "$LOG" >&2; exit 1; }
echo "dev server at $BASE_URL (log: $LOG)" >&2

"$@"
