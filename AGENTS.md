## Shipping

Work on a branch and open a PR; merging to `main` deploys abstract.dannyobrien.dev. CI runs `bun run check` on each PR, with no browser. Before the PR, verify the change (`docs/agents/verify.md`): a PR that adds or edits a level runs `bun run playthrough <N>` for those levels and attaches their screenshots and videos, and any other change a player sees carries its own evidence by convention. Review it with `/code-review main`, which enforces `CODING_STANDARDS.md`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (danmcfan/abstract) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`. The vision board (`docs/vision/board.html`) is the reference for the look, Bitbox and the story.
