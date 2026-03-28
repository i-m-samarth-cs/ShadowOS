import { agentExpand } from "../engine/decision.js";
import { createBrainPage } from "../core/notionBrain.js";

/**
 * @param {{ decision: object, activities: object[] }} ctx
 */
export async function runProductivityOptimizer(ctx) {
  const context = JSON.stringify(
    { decision: ctx.decision, activities: ctx.activities },
    null,
    2
  );
  const body = await agentExpand(
    "Productivity optimizer",
    context,
    `From behavior signals, write:
# Observed workflow friction
# One concrete workflow tweak (step-by-step)
# What to batch or defer
# Optional automation hooks (no code, just ideas)`
  );
  const title = `Workflow · ${new Date().toISOString().slice(0, 10)} · optimization note`;
  return createBrainPage({
    title,
    body,
    meta: { category: "Productivity", recordType: "Workflow" },
  });
}
