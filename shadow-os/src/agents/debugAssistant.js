import { agentExpand } from "../engine/decision.js";
import { createBrainPage } from "../core/notionBrain.js";

/**
 * @param {{ decision: object, activities: object[] }} ctx
 */
export async function runDebugAssistant(ctx) {
  const context = JSON.stringify(
    { decision: ctx.decision, activities: ctx.activities },
    null,
    2
  );
  const body = await agentExpand(
    "Debug assistant",
    context,
    `Build a personal debugging knowledge page:
# Observed pattern
# Likely causes
# Isolation checklist
# Related commands or searches to try
# Prevention / guardrails`
  );
  const title = `Debug KB · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  return createBrainPage({
    title,
    body,
    meta: { category: "Pattern", recordType: "Debug" },
  });
}
