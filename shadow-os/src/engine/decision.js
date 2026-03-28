import OpenAI from "openai";
import { config, assertLlm } from "../core/config.js";

const client = () => {
  assertLlm();
  return new OpenAI({
    apiKey: config.llmApiKey,
    ...(config.llmBaseUrl ? { baseURL: config.llmBaseUrl } : {}),
  });
};

const SYSTEM = `You are ShadowOS, a behavior-aware operating layer. You observe streams of developer activity (code edits, terminal, browser topics) and decide what the system should do next — without waiting for explicit user commands.

Respond with ONLY valid JSON (no markdown fences) matching this shape:
{
  "intent_summary": "one or two sentences",
  "classification": "code_feature|debug_cluster|research_binge|habit_pattern|other",
  "confidence": 0.0,
  "signals": ["short evidence strings"],
  "predicted_next_steps": ["what the human will likely do next"],
  "agent_triggers": ["feature","debug","learning","productivity"],
  "should_sync_notion": true,
  "summary_for_agents": "compact context for downstream agents"
}

Rules:
- agent_triggers: include "feature" when the user is implementing or shaping product behavior from code.
- Include "debug" when errors, stack traces, repeated failures, or bugfix language dominate.
- Include "learning" when many similar research tabs/topics or exploratory reading suggest a knowledge gap.
- Include "productivity" when repetitive shallow context switches or thrashing appears.
- Keep signals grounded in the payload; do not invent file paths you did not see.
- should_sync_notion: false only for noise (single trivial keystroke with no pattern).`;

/**
 * @param {object[]} activities
 */
export async function decideFromActivities(activities) {
  const openai = client();
  const user = JSON.stringify(
    { activities, hint: "Classify and choose agent_triggers for autonomous Notion sync." },
    null,
    2
  );
  const baseReq = {
    model: config.llmModel,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  };
  let res;
  try {
    res = await openai.chat.completions.create({
      ...baseReq,
      response_format: { type: "json_object" },
    });
  } catch {
    res = await openai.chat.completions.create(baseReq);
  }
  const raw = res.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return {
      intent_summary: raw.slice(0, 500),
      classification: "other",
      confidence: 0.3,
      signals: [],
      predicted_next_steps: [],
      agent_triggers: [],
      should_sync_notion: false,
      summary_for_agents: "",
    };
  }
}

/**
 * @param {string} agentName
 * @param {string} context
 * @param {string} instruction
 */
export async function agentExpand(agentName, context, instruction) {
  const openai = client();
  const res = await openai.chat.completions.create({
    model: config.llmModel,
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content: `You are the ShadowOS "${agentName}" agent. Output clear markdown sections with headings. Be specific and actionable. No preamble.`,
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nTask:\n${instruction}`,
      },
    ],
  });
  return res.choices[0]?.message?.content || "";
}
