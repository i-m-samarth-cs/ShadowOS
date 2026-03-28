import { config, assertNotion, assertLlm } from "./core/config.js";
import {
  logActivity,
  watchWorkspace,
  ingestBrowserJsonl,
  drainPending,
  peekPendingCount,
  replayFromLog,
} from "./tracker/tracker.js";
import { runBehaviorCycle, flushPendingQueue } from "./pipeline.js";
import path from "path";

function parseArgs(argv) {
  const out = { watch: false, demo: false, browser: "", once: false, root: config.workspaceRoot };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--watch") out.watch = true;
    else if (a === "--demo") out.demo = true;
    else if (a === "--once") out.once = true;
    else if (a === "--browser") out.browser = path.resolve(argv[++i] || "");
    else if (!a.startsWith("-")) positional.push(a);
  }
  if (positional[0]) out.root = path.resolve(positional[0]);
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  assertLlm();
  assertNotion();

  if (args.browser) {
    const n = ingestBrowserJsonl(args.browser);
    console.log(`[ShadowOS] Ingested ${n} browser events from ${args.browser}`);
  }

  if (args.demo) {
    logActivity({
      type: "code_change",
      file: "src/payments/checkout.ts",
      summary: "Implementing retry logic for failed card charges",
    });
    logActivity({
      type: "code_change",
      file: "src/payments/checkout.test.ts",
      summary: "Adding tests for charge retry backoff",
    });
    const pending = drainPending();
    const result = await runBehaviorCycle(pending, { quiet: false });
    console.log("[ShadowOS] Demo cycle result:", result);
    return;
  }

  if (args.watch) {
    console.log(`[ShadowOS] Watching ${args.root} (debounce ${config.debounceMs}ms, tick ${config.tickMs}ms)`);
    logActivity({ type: "shadowos_start", message: "Behavior capture online", root: args.root });

    const watcher = await watchWorkspace(
      args.root,
      async () => {
        await flushPendingQueue({ quiet: false });
      },
      config.debounceMs
    );

    const interval = setInterval(async () => {
      await flushPendingQueue({ quiet: true });
    }, config.tickMs);

    process.on("SIGINT", async () => {
      clearInterval(interval);
      await watcher.close();
      process.exit(0);
    });

    console.log("[ShadowOS] Idle — edit files to capture behavior, or pipe terminal/browser logs.");
    return;
  }

  if (args.once) {
    if (!peekPendingCount()) {
      const n = replayFromLog(40);
      console.log(`[ShadowOS] Replayed ${n} events from activity.log`);
    }
    const result = await flushPendingQueue({ quiet: false });
    console.log("[ShadowOS] --once:", result);
    return;
  }

  console.log(`Usage:
  node src/index.js --demo          Run a sample decision + Notion sync
  node src/index.js --watch [dir]   Watch filesystem and sync on debounce + interval
  node src/index.js --once          Flush pending queue from this session's log calls
  node src/index.js --browser path  Ingest JSONL browser events then exit (pair with --once)

Environment: NOTION_*, GROQ_* or OPENAI_*, optional NOTION_TITLE_PROPERTY, NOTION_CATEGORY_PROPERTY, NOTION_TYPE_PROPERTY
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
