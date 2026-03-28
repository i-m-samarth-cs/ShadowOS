import dotenv from "dotenv";

// quiet: stdout must stay clean for MCP (JSON-RPC on stdio); tips would corrupt the stream
dotenv.config({ quiet: true });

/**
 * Notion API requires a hyphenated UUID. URLs often use a 32-char hex string without dashes.
 * @param {string} raw
 */
export function normalizeNotionUuid(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s.toLowerCase();
  }
  const hex = s.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) return s;
  if (hex.length !== 32) {
    console.warn(
      `[ShadowOS] NOTION_DB_ID must be 32 hex characters (copy full ID from the Notion URL). Length is ${hex.length}.`
    );
    return s;
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const groqKey = (process.env.GROQ_API_KEY || "").trim();
const openaiKey = (process.env.OPENAI_API_KEY || "").trim();
const useGroq = Boolean(groqKey);

/** OpenAI SDK base URL. Groq uses OpenAI-compatible chat at api.groq.com. */
const groqBase = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").trim();
const openaiBase = (process.env.OPENAI_BASE_URL || "").trim();

const defaultGroqModel = "llama-3.3-70b-versatile";
const defaultOpenaiModel = "gpt-4o-mini";

export const config = {
  notionApiKey: process.env.NOTION_API_KEY || "",
  /** Notion *database* id (table). Use NOTION_PAGE_ID instead if your URL is a normal page. */
  notionDbId: normalizeNotionUuid(process.env.NOTION_DB_ID || ""),
  /** Parent *page* id — ShadowOS creates child pages here (no DB columns). */
  notionPageId: normalizeNotionUuid(process.env.NOTION_PAGE_ID || ""),
  notionTitleProperty: process.env.NOTION_TITLE_PROPERTY || "Name",
  notionCategoryProperty: process.env.NOTION_CATEGORY_PROPERTY || "",
  notionTypeProperty: process.env.NOTION_TYPE_PROPERTY || "",
  /** @deprecated use llmApiKey */
  get openaiApiKey() {
    return this.llmApiKey;
  },
  /** @deprecated use llmModel */
  get openaiModel() {
    return this.llmModel;
  },
  llmProvider: useGroq ? "groq" : "openai",
  /** Groq key takes precedence if both are set. */
  llmApiKey: groqKey || openaiKey,
  llmBaseUrl: useGroq ? groqBase : openaiBase,
  llmModel: useGroq
    ? process.env.GROQ_MODEL || process.env.OPENAI_MODEL || defaultGroqModel
    : process.env.OPENAI_MODEL || defaultOpenaiModel,
  workspaceRoot: process.env.SHADOW_WORKSPACE || process.cwd(),
  debounceMs: Number(process.env.SHADOW_DEBOUNCE_MS || 8000),
  tickMs: Number(process.env.SHADOW_TICK_MS || 45000),
};

export function assertNotion() {
  if (!config.notionApiKey) throw new Error("NOTION_API_KEY is required");
  if (!config.notionDbId && !config.notionPageId) {
    throw new Error("Set NOTION_DB_ID (Notion database) or NOTION_PAGE_ID (parent page for sub-pages)");
  }
}

/** Requires GROQ_API_KEY or OPENAI_API_KEY. */
export function assertLlm() {
  if (!config.llmApiKey) {
    throw new Error("Set GROQ_API_KEY (Groq) or OPENAI_API_KEY (OpenAI)");
  }
}

/** @deprecated use assertLlm */
export const assertOpenAI = assertLlm;
