import { agentExpand } from "../engine/decision.js";
import { createBrainPage } from "../core/notionBrain.js";

/**
 * @param {{ decision: object, activities: object[] }} ctx
 */
export async function runLearningPlanner(ctx) {
  const context = JSON.stringify(
    { decision: ctx.decision, activities: ctx.activities },
    null,
    2
  );
  const body = await agentExpand(
    "Learning planner",
    context,
    `The user appears to be filling a knowledge gap. Produce:
# Learning gap (one sentence)
# 7-day micro-plan (day by day, bullets)
# Suggested resources (tutorials, docs, search queries — bullets)
# Success criteria (how they'll know they closed the gap)`
  );
  const title = `Learning plan · ${(ctx.decision.intent_summary || "topic").slice(0, 70)}`;
  return createBrainPage({
    title,
    body,
    meta: { category: "Learning", recordType: "Learning Gap" },
  });
}
