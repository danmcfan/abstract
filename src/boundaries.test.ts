import { expect, test } from "bun:test";
import { Glob } from "bun";
import { join } from "node:path";

// Import rules from CODING_STANDARDS.md that a script can check.

const root = join(import.meta.dir, "..");
const sources = [...new Glob("src/**/*.{ts,tsx}").scanSync({ cwd: root })].filter((file) => !file.endsWith(".test.ts"));
const contents = new Map(
  await Promise.all(sources.map(async (file) => [file, await Bun.file(join(root, file)).text()] as const)),
);
const imports = (file: string): string[] =>
  [...contents.get(file)!.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/gu)].map((m) => m[1]!);

test("only src/robot/ imports Three.js", () => {
  const offenders = sources.filter(
    (file) =>
      !file.startsWith("src/robot/") && imports(file).some((spec) => spec === "three" || spec.startsWith("three/")),
  );
  expect(offenders).toEqual([]);
});

test("src/sim/ imports only other sim modules", () => {
  const offenders = sources
    .filter((file) => file.startsWith("src/sim/"))
    .flatMap((file) =>
      imports(file)
        .filter((spec) => !spec.startsWith("./"))
        .map((spec) => `${file}: ${spec}`),
    );
  expect(offenders).toEqual([]);
});
