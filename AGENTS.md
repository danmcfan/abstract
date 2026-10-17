## Shipping

Commit and push straight to `main`; every push to `main` deploys abstract.dannyobrien.dev. CI runs `bun run check` on each push, with no browser. Before you push, verify the change (`docs/agents/verify.md`): a change that adds or edits a level runs `bun run playthrough <N>` for those levels and checks their screenshots and videos, and any other change a player sees is captured and checked the same way. Review your unpushed commits with `/code-review origin/main`, which enforces `CODING_STANDARDS.md`, then push.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (danmcfan/abstract) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`. The vision board (`docs/vision/board.html`) is the reference for the look, Bitbox and the story.
