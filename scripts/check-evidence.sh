#!/usr/bin/env bash
# Fails when a PR changes what a player sees or hears but its body has no
# uploaded screenshot or video and doesn't say "No visible change". CI runs it
# on every PR and on every body edit. It reads the live PR, so re-running the
# job after `gh pr edit --attach` picks up the new body.
#
# Usage: scripts/check-evidence.sh <pr-number>
set -euo pipefail
PR=${1:?usage: scripts/check-evidence.sh <pr-number>}

files=$(gh pr diff "$PR" --name-only)
visible=$(grep -E '^(src/|public/|index\.html$|bitbox\.html$)' <<<"$files" | grep -vE '\.test\.tsx?$' || true)
if [ -z "$visible" ]; then
  echo "No player-facing files changed; no evidence needed."
  exit 0
fi

body=$(gh pr view "$PR" --json body --jq .body)
if grep -q 'github.com/user-attachments/' <<<"$body"; then
  echo "Evidence attached."
  exit 0
fi
if grep -qi 'no visible change' <<<"$body"; then
  echo "The body says there is no visible change."
  exit 0
fi

cat >&2 <<EOF
PR #$PR changes player-facing files:
$(sed 's/^/  /' <<<"$visible")
but its body has no uploaded screenshot or video.

Attach them (docs/agents/verify.md, "Evidence on the PR"):
  gh pr edit $PR --body-file <body.md> --attach <path> ...
or, if nothing a player sees or hears changed, write "No visible change" and why
in the body. Then re-run this job.
EOF
exit 1
