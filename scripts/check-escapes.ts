// The lint and type rules only hold if code can't opt out of them, and
// Oxlint has no switch to turn off inline disable comments, so this fails
// the check on any comment that would silence a rule.
import { Glob } from "bun";

const ESCAPES = /(?:eslint|oxlint)-disable|@ts-(?:ignore|expect-error|nocheck)|prettier-ignore/u;
const SELF = "scripts/check-escapes.ts";

const found: string[] = [];
for await (const path of new Glob("{src,scripts}/**/*.{ts,tsx}").scan(".")) {
  if (path === SELF) continue;
  const lines = (await Bun.file(path).text()).split("\n");
  lines.forEach((line, index) => {
    if (ESCAPES.test(line)) found.push(`${path}:${String(index + 1)}: ${line.trim()}`);
  });
}

if (found.length > 0) {
  process.stderr.write(`Comments that switch off a check aren't allowed:\n${found.join("\n")}\n`);
  process.exit(1);
}
