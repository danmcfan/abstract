import { claudeCode, createSandbox, type SandboxRunResult } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { $ } from "bun";
import { cpSync, existsSync, rmSync } from "node:fs";
import { createTui } from "./tui.ts";

// Run with `bun run sandcastle [issue-number] [--fresh]`. Needs Docker, the image
// (`bunx sandcastle docker build-image`, again after editing the Dockerfile) and .sandcastle/.env (copy .env.example).
// With no number it takes the lowest-numbered open ready-for-agent issue.
//
// One container, one branch (agent/<issue>, cut from the branch you have checked out):
//   implement (Opus) → review and triage (Opus) → fix (Sonnet) → check, refixing up to 3 times → PR body (Sonnet)
// then this script pushes the branch and opens the PR. It is a draft if the check is still red.
// A branch with no commits (an audit that only filed issues) gets the PR body as an issue comment instead.
// The terminal shows a progress view; each agent's full output goes to .sandcastle/logs/<issue>/.
//
// Ctrl-C stops the agent and removes the container; a second Ctrl-C force-removes it and quits.
// Running the same issue again skips the steps an earlier run finished (kept in
// .sandcastle/logs/<issue>/state.json) and starts the stopped step over on the same branch.
// --fresh forgets those and starts from implement; the branch keeps its commits.
const MAX_FIX_ROUNDS = 3;
const OPUS = claudeCode("claude-opus-5-5", { effort: "low" });
const SONNET = claudeCode("claude-sonnet-5-5", { effort: "low" });

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const issue =
  args.find((arg) => arg !== "--fresh") ??
  (
    await $`gh issue list --label ready-for-agent --state open --json number --jq 'map(.number) | min // empty'`.text()
  ).trim();
if (issue === "") throw new Error("No open ready-for-agent issue; pass an issue number.");
if (!/^\d+$/u.test(issue))
  throw new Error(`Not an issue number: ${issue}. To build the image, run \`bunx sandcastle docker build-image\`.`);

const branch = `agent/${issue}`;
const logs = `.sandcastle/logs/${issue}`;
// Sandcastle removes a clean worktree when the run ends, and out/ and evidence/ are gitignored, so
// the step outputs (out/pipeline) and the PR's screenshots and videos (evidence/) are kept here
// between runs and put back on the next one.
const KEPT = ["out", "evidence"];
const stateFile = `${logs}/state.json`;

interface Progress {
  done: string[];
  green?: boolean;
  url?: string;
  // publish found no commits and commented on the issue instead of opening a PR
  commented?: boolean;
}
if (fresh) for (const dir of KEPT) rmSync(`${logs}/${dir}`, { recursive: true, force: true });
const stored: unknown = !fresh && existsSync(stateFile) ? await Bun.file(stateFile).json() : undefined;
let progress: Progress = isProgress(stored) ? stored : { done: [] };

const runs: { step: string; result: SandboxRunResult }[] = [];
const tui = createTui(`Sandcastle · issue #${issue} · ${branch}`, [
  "setup",
  "implement",
  "review",
  "fix",
  "check",
  "pr",
  "publish",
]);
let current = "setup";

// Ctrl-C: the first aborts the run so `await using` removes the container; the second removes
// every Sandcastle container this run started and quits at once.
const stop = new AbortController();
const INTERRUPTED = new Error("Interrupted");
const before = new Set(containers());
let interrupts = 0;
const interrupt = (): void => {
  interrupts++;
  if (interrupts === 1) {
    tui.activity("\u001B[33mStopping\u001B[0m: removing the container. Ctrl-C again to force quit.");
    stop.abort(INTERRUPTED);
    return;
  }
  const ours = containers().filter((id) => !before.has(id));
  if (ours.length > 0) Bun.spawnSync(["docker", "rm", "-f", ...ours]);
  tui.close([`Force quit during ${current}. Removed ${ours.length} container(s).`]);
  process.exit(130);
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

// Rejects as soon as Ctrl-C is pressed, for work that takes no AbortSignal of its own.
const interruptible = async <T>(work: Promise<T>): Promise<T> => {
  const settled = await Promise.race([
    work,
    new Promise<never>((_, reject) => {
      if (stop.signal.aborted) reject(INTERRUPTED);
      stop.signal.addEventListener(
        "abort",
        () => {
          reject(INTERRUPTED);
        },
        { once: true },
      );
    }),
  ]);
  return settled;
};

try {
  tui.start("setup", "container and bun install");
  const creating = createSandbox({
    branch,
    sandbox: docker(),
    hooks: { sandbox: { onSandboxReady: [{ command: "bun install --frozen-lockfile" }] } },
  });
  let started: Awaited<typeof creating>;
  try {
    started = await interruptible(creating);
  } catch (error) {
    // Ctrl-C during setup: let the container come up, then remove it.
    const [late] = await Promise.allSettled([creating]);
    if (late.status === "fulfilled") await late.value.close();
    throw error;
  }
  await using sandbox = started;
  // Sandcastle's own SIGINT/SIGTERM listeners remove the container and exit(1) at once, before
  // this script can close the progress view or say how to carry on. Its exit listener stays, so
  // a crash still removes the container.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    for (const listener of process.listeners(signal)) if (listener !== interrupt) process.off(signal, listener);
  }
  const out = `${sandbox.worktreePath}/out`;
  for (const dir of KEPT) {
    const saved = `${logs}/${dir}`;
    if (existsSync(saved)) cpSync(saved, `${sandbox.worktreePath}/${dir}`, { recursive: true, force: false });
  }
  tui.done("setup");

  const record = async (name: string, extra: Omit<Progress, "done"> = {}): Promise<void> => {
    progress = { ...progress, ...extra, done: [...progress.done, name] };
    await Bun.write(stateFile, JSON.stringify(progress, null, 2));
    for (const dir of KEPT) {
      const live = `${sandbox.worktreePath}/${dir}`;
      if (existsSync(live)) cpSync(live, `${logs}/${dir}`, { recursive: true, force: true });
    }
  };

  // One pipeline step: skipped if an earlier run finished it, recorded once it is done.
  const phase = async (name: string, note: string, body: () => Promise<void>): Promise<void> => {
    current = name;
    if (progress.done.includes(name)) {
      tui.skip(name, "done in an earlier run");
      return;
    }
    tui.start(name, note);
    await body();
    tui.done(name);
    await record(name);
  };

  // One agent session, shown under the TUI step `tuiStep`; `name` also names its log file.
  const step = async (
    tuiStep: string,
    name: string,
    agent: typeof OPUS,
    promptFile: string,
    promptArgs: Record<string, string> = {},
  ): Promise<void> => {
    const result = await sandbox.run({
      name,
      agent,
      promptFile: `./.sandcastle/${promptFile}`,
      promptArgs: { ISSUE_NUMBER: issue, ...promptArgs },
      logging: { type: "file", path: `${logs}/${name}.log`, onAgentStreamEvent: tui.event },
      signal: stop.signal,
    });
    for (const { usage } of result.iterations) tui.tokens(tuiStep, usage);
    tui.activity(`${name}: ${result.commits.length} commit(s)`);
    runs.push({ step: name, result });
  };

  await phase("implement", "Opus", async () => {
    await step("implement", "implement", OPUS, "implement.md");
  });
  await phase("review", "Opus", async () => {
    await step("review", "review", OPUS, "review.md");
  });
  await phase("fix", "Sonnet", async () => {
    await step("fix", "fix", SONNET, "fix.md", {
      TASK: "The review findings are in `out/pipeline/review.md`. If it says `No findings.`, write that to `out/pipeline/fixes.md` and stop.",
    });
  });

  // The fix agent is told to leave the check green; this makes sure, and refixes if not.
  const checkGreen = async (round: number): Promise<boolean> => {
    tui.start("check", round === 1 ? "bun run check" : `bun run check, after fix round ${round - 1}`);
    const check = await interruptible(sandbox.exec("bun run check"));
    if (check.exitCode === 0) return true;
    tui.activity(`\u001B[31mbun run check failed\u001B[0m (round ${round})`);
    if (round > MAX_FIX_ROUNDS) return false;
    // A file, not a prompt arg: prompt args are pasted in before !`...` blocks run.
    await Bun.write(`${out}/pipeline/check.log`, `${check.stdout}\n${check.stderr}`);
    tui.start("check", `fixing, round ${round} of ${MAX_FIX_ROUNDS} (Sonnet)`);
    await step("check", `fix-check-${round}`, SONNET, "fix.md", {
      TASK: "`bun run check` fails; its output is in `out/pipeline/check.log`. Make it pass by fixing the code, never the rules. Each failure is one item; use its tool and file as the id.",
    });
    return checkGreen(round + 1);
  };
  current = "check";
  if (progress.done.includes("check")) tui.skip("check", "done in an earlier run");
  else {
    const green = await checkGreen(1);
    if (green) tui.done("check", "green");
    else tui.fail("check", `red after ${MAX_FIX_ROUNDS} fix rounds; PR will be a draft`);
    await record("check", { green });
  }
  const green = progress.green ?? false;

  await phase("pr", "Sonnet", async () => {
    await step("pr", "pr", SONNET, "pr.md", { CHECK: green ? "passing" : "FAILING" });
  });

  current = "publish";
  if (progress.done.includes("publish")) tui.skip("publish", progress.url ?? "");
  else {
    tui.start("publish", "push and gh pr create");
    const pipeline = `${out}/pipeline`;
    const pr: unknown = await Bun.file(`${pipeline}/pr.json`).json();
    if (!isPrSpec(pr)) throw new Error(`${pipeline}/pr.json is not {"title": string, "attach": string[]}`);
    // An audit can end with only follow-up issues and no commits, and GitHub refuses a PR with no
    // commits, so the PR body goes on the issue as a comment instead. HEAD here is the branch the
    // run was cut from.
    const commits = Number((await $`git rev-list --count HEAD..${branch}`.quiet().text()).trim());
    if (commits === 0) {
      const url = (await $`gh issue comment ${issue} --body-file ${pipeline}/pr-body.md`.quiet().text()).trim();
      tui.done("publish", url);
      await record("publish", { url, commented: true });
    } else {
      const attachments = pr.attach.flatMap((path) => ["--attach", path]);
      await $`git push -q -u origin ${branch}`.quiet();
      // A run stopped after gh pr create but before recording it has already opened the PR.
      const existing = (await $`gh pr view ${branch} --json url --jq .url`.nothrow().quiet().text()).trim();
      const draft = green ? [] : ["--draft"];
      const url =
        existing ||
        (
          await $`gh pr create --head ${branch} --title ${pr.title} --body-file ${pipeline}/pr-body.md ${draft} ${attachments}`
            .cwd(sandbox.worktreePath)
            .quiet()
            .text()
        ).trim();
      tui.done("publish", url);
      await record("publish", { url });
    }
  }

  let outcome = green ? "PR" : "Draft PR (check failing)";
  if (progress.commented === true) outcome = "No commits, so no PR; the PR body is a comment on the issue";
  tui.close([`${outcome}: ${progress.url ?? ""}`, `Logs: ${logs}/`, "", ...usageReport()]);
} catch (error) {
  if (!stop.signal.aborted) {
    tui.fail(current, "failed");
    tui.close([`Failed during ${current}. Logs: ${logs}/`, "", ...usageReport()]);
    throw error;
  }
  tui.stop(current, "stopped (Ctrl-C)");
  tui.close([
    `Stopped during ${current}; the container is removed.`,
    `Run \`bun run sandcastle ${issue}\` to carry on from ${current}, or add --fresh to start over.`,
    `Logs: ${logs}/`,
    "",
    ...usageReport(),
  ]);
  process.exitCode = 130;
}

function containers(): string[] {
  const ps = Bun.spawnSync(["docker", "ps", "-q", "--filter", "name=sandcastle-"]);
  return ps.stdout.toString().split("\n").filter(Boolean);
}

function usageReport(): string[] {
  return runs.flatMap(({ step: name, result }) =>
    result.iterations.map(({ sessionId, usage }) => {
      const tokens = usage
        ? `in ${usage.inputTokens}, out ${usage.outputTokens}, cache write ${usage.cacheCreationInputTokens}, cache read ${usage.cacheReadInputTokens}`
        : "no usage reported";
      return `${name} (${sessionId ?? "no id"}): ${tokens}`;
    }),
  );
}

function isProgress(value: unknown): value is Progress {
  if (typeof value !== "object" || value === null || !("done" in value)) return false;
  const { done } = value;
  return Array.isArray(done) && done.every((name: unknown) => typeof name === "string");
}

function isPrSpec(value: unknown): value is { title: string; attach: string[] } {
  if (typeof value !== "object" || value === null) return false;
  if (!("title" in value) || !("attach" in value)) return false;
  const { title, attach } = value;
  return (
    typeof title === "string" && Array.isArray(attach) && attach.every((path: unknown) => typeof path === "string")
  );
}
