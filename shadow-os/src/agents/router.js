import { runFeatureGenerator } from "./featureGenerator.js";
import { runDebugAssistant } from "./debugAssistant.js";
import { runLearningPlanner } from "./learningPlanner.js";
import { runProductivityOptimizer } from "./productivityOptimizer.js";

/**
 * @param {object} decision
 * @param {object[]} activities
 * @returns {Promise<{ agent: string, pageId?: string, error?: string }[]>}
 */
export async function routeAgents(decision, activities) {
  const triggers = new Set(
    Array.isArray(decision.agent_triggers) ? decision.agent_triggers.map((s) => String(s).toLowerCase()) : []
  );
  const ctx = { decision, activities };
  /** @type {Promise<{ agent: string, pageId?: string, error?: string }>[]} */
  const jobs = [];

  if (triggers.has("feature")) {
    jobs.push(
      runFeatureGenerator(ctx).then(
        (page) => ({ agent: "feature", pageId: page.id }),
        (e) => ({ agent: "feature", error: String(e.message || e) })
      )
    );
  }
  if (triggers.has("debug")) {
    jobs.push(
      runDebugAssistant(ctx).then(
        (page) => ({ agent: "debug", pageId: page.id }),
        (e) => ({ agent: "debug", error: String(e.message || e) })
      )
    );
  }
  if (triggers.has("learning")) {
    jobs.push(
      runLearningPlanner(ctx).then(
        (page) => ({ agent: "learning", pageId: page.id }),
        (e) => ({ agent: "learning", error: String(e.message || e) })
      )
    );
  }
  if (triggers.has("productivity")) {
    jobs.push(
      runProductivityOptimizer(ctx).then(
        (page) => ({ agent: "productivity", pageId: page.id }),
        (e) => ({ agent: "productivity", error: String(e.message || e) })
      )
    );
  }

  if (!jobs.length) {
    return [];
  }
  return Promise.all(jobs);
}
