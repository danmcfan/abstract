// Checks the production build in dist/ for what the game promises players:
// dev pages and Three.js stay out of the first load, and no chunk is big
// enough for Vite to warn about. Run after `vite build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const CHUNK_LIMIT = 500 * 1024;
// A class every Three.js renderer build defines.
const THREE_MARKER = "WebGLRenderer";

const failures: string[] = [];
const html = readdirSync(DIST).filter((file) => file.endsWith(".html"));
if (html.join() !== "index.html") failures.push(`dist/ should hold only index.html, found: ${html.join(", ")}`);

const index = readFileSync(join(DIST, "index.html"), "utf8");
// The entry script plus every chunk it imports statically (Vite preloads
// those) make up the first load.
const firstLoad = [
  ...[...index.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)].map((m) => m[1]!),
  ...[...index.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g)].map((m) => m[1]!),
];
if (firstLoad.length === 0) failures.push("no entry script found in dist/index.html");
for (const file of firstLoad) {
  if (readFileSync(join(DIST, file), "utf8").includes(THREE_MARKER)) {
    failures.push(`${file} is in the first load and includes Three.js; load it with import() from src/robot`);
  }
}

const assets = join(DIST, "assets");
for (const file of readdirSync(assets).filter((f) => f.endsWith(".js"))) {
  const size = statSync(join(assets, file)).size;
  if (size > CHUNK_LIMIT)
    failures.push(`${file} is ${Math.round(size / 1024)} kB, over the ${CHUNK_LIMIT / 1024} kB limit`);
}

if (failures.length > 0) {
  console.error(`bundle check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`bundle check passed (first load: ${firstLoad.join(", ")})`);
