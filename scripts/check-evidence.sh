#!/usr/bin/env bash
# Fails when a PR changes what a player sees or hears but its body has no
# uploaded screenshot or video and no line starting "No visible change", or
# when an evidence/ link in the body was never uploaded. CI runs it on every PR
# and every body edit; it reads the live PR, so a body edit is all it takes.
#
# Usage: scripts/check-evidence.sh <pr-number>
set -euo pipefail
PR=${1:?usage: scripts/check-evidence.sh <pr-number>}

files=$(gh pr diff "$PR" --name-only)
visible=$(grep -E '^(src/|public/|index\.html$)' <<<"$files" | grep -vE '\.test\.tsx?$' || true)
if [ -z "$visible" ]; then
  echo "No player-facing files changed; no evidence needed."
  exit 0
fi

body=$(gh pr view "$PR" --json body --jq .body)
# gh rewrites each attached file's link; one left as evidence/ failed to upload.
if grep -q '](evidence/' <<<"$body"; then
  echo "PR #$PR links files under evidence/ that weren't uploaded. Re-attach them:" >&2
  echo "  gh pr edit $PR --body-file <body.md> --attach <path> ..." >&2
  exit 1
fi
if grep -q 'github.com/user-attachments/' <<<"$body"; then
  echo "Evidence attached."
  exit 0
fi
if grep -qE '^[-*> ]*No visible change' <<<"$body"; then
  echo "The body says there is no visible change."
  exit 0
fi

cat >&2 <<EOF
PR #$PR changes player-facing files:
$(sed 's/^/  /' <<<"$visible")
but its body has no uploaded screenshot or video.

Attach them (docs/agents/verify.md, "Evidence on the PR"):
  gh pr edit $PR --body-file <body.md> --attach <path> ...
or, if nothing a player sees or hears changed, start a line of the body with
"No visible change" and say why. Editing the body re-runs the CI check.
EOF
exit 1
