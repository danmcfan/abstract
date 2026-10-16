import { defineConfig } from "sandworm";

// The Sandcastle pipeline lives in sandworm (github.com/danmcfan/sandworm); this is what is
// particular to abstract. A file in .sandcastle/ named like one of sandworm's prompts replaces it.
export default defineConfig({
  repo: "abstract",
  // evidence/ holds the PR's screenshots and videos (docs/agents/verify.md).
  keep: ["out", "evidence"],
  prompts: {
    verify:
      "Verify the change as `docs/agents/verify.md` says: for a level you added or edited, run `bun run playthrough <N>` and copy its `level<N>.png` and `level<N>.webm` into `evidence/`; for anything else the player sees or hears, capture it into `evidence/`. Look at each file to check it shows the change.",
    reverify:
      "If a fix changes what the player sees or hears, capture it again into `evidence/` (`docs/agents/verify.md`).",
    evidence: "evidence",
  },
});
