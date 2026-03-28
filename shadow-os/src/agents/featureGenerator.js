import { agentExpand } from "../engine/decision.js";
import { createBrainPage } from "../core/notionBrain.js";

/**
 * @param {{ decision: object, activities: object[] }} ctx
 */
export async function runFeatureGenerator(ctx) {
  const context = JSON.stringify(
    { decision: ctx.decision, activities: ctx.activities },
    null,
    2
  );
  const body = await agentExpand(
    "Feature generator",
    context,
    `From the activity, produce ONE markdown document with these sections:
# Feature spec
## User-visible behavior
## Data / API touchpoints
# Edge cases checklist
- bullet items
# Test cases
- bullet items
# Future improvements
- bullet items`
  );
  const title = `Feature · ${new Date().toISOString().slice(0, 10)} · ${(ctx.decision.intent_summary || "spec").slice(0, 80)}`;
  return createBrainPage({
    title,
    body,
    meta: { category: "Feature", recordType: "Feature Pack" },
  });
}
