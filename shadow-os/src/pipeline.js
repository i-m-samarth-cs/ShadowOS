import { decideFromActivities } from "./engine/decision.js";
import { routeAgents } from "./agents/router.js";
import { createBrainPage } from "./core/notionBrain.js";
import { drainPending } from "./tracker/tracker.js";

/**
 * @param {object[]} activities
 * @param {{ quiet?: boolean }} opts
 */
export async function runBehaviorCycle(activities, opts = {}) {
  const { quiet = false } = opts;
  const filtered = activities.filter((a) => a && a.type !== "shadowos_start");
  if (!filtered.length) {
    return { skipped: true, reason: "no_activities" };
  }

  const decision = await decideFromActivities(filtered);
  if (!quiet) {
    console.log("\n[ShadowOS] Decision:", JSON.stringify(decision, null, 2));
  }

  if (!decision.should_sync_notion) {
    return { decision, synced: false };
  }

  /** @type {Awaited<ReturnType<typeof routeAgents>>} */
  let agentResults = [];
  try {
    agentResults = await routeAgents(decision, filtered);
  } catch (e) {
    if (!quiet) console.error("[ShadowOS] Agent routing error:", e);
  }

  if (!agentResults.length && decision.classification && decision.classification !== "other") {
    try {
      const page = await createBrainPage({
        title: `Signal · ${decision.classification} · ${new Date().toISOString().slice(0, 16)}`,
        body: `# Intent\n${decision.intent_summary || ""}\n\n## Signals\n${(decision.signals || []).map((s) => `- ${s}`).join("\n")}\n\n## Next (predicted)\n${(decision.predicted_next_steps || []).map((s) => `- ${s}`).join("\n")}`,
        meta: { category: "Signal", recordType: "Auto" },
      });
      agentResults = [{ agent: "fallback_page", pageId: page.id }];
    } catch (e) {
      if (!quiet) console.error("[ShadowOS] Fallback Notion page failed:", e);
    }
  }

  return { decision, synced: true, agentResults };
}

/**
 * Process in-memory pending queue from tracker (and clear it).
 */
export async function flushPendingQueue(opts) {
  const batch = drainPending();
  if (!batch.length) return { skipped: true };
  return runBehaviorCycle(batch, opts);
}
