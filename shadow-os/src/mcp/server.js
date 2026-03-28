import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { assertNotion, assertLlm } from "../core/config.js";
import {
  createBrainPage,
  appendBlocks,
  queryRecentBrain,
  roughMarkdownToBlocks,
} from "../core/notionBrain.js";
import { logActivity } from "../tracker/tracker.js";
import { runBehaviorCycle } from "../pipeline.js";

const server = new McpServer(
  { name: "shadow-os", version: "1.0.0" },
  { instructions: "ShadowOS Notion brain: log behavior, query memory, append knowledge. Use tools proactively when the user is coding, debugging, or researching." }
);

server.registerTool(
  "shadowos_capture_event",
  {
    description:
      "Record a behavior event (code edit, terminal line, browser topic) into ShadowOS local log for batch AI processing.",
    inputSchema: {
      eventType: z
        .enum(["code_edit", "terminal", "browser", "note"])
        .describe("Kind of signal"),
      summary: z.string().describe("What happened, with paths or URLs if relevant"),
      detail: z.string().optional().describe("Extra structured context as text"),
    },
  },
  async ({ eventType, summary, detail }) => {
    logActivity({
      type: eventType,
      summary,
      detail,
      source: "mcp",
      timestamp: Date.now(),
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, eventType }) }],
    };
  }
);

server.registerTool(
  "shadowos_run_decision_cycle",
  {
    description:
      "Send recent captured events (provide them here) through the ShadowOS decision engine and sync selected outputs to Notion. Use after 2+ related events.",
    inputSchema: {
      events: z.array(z.any()).describe("Recent behavior objects (same shape as capture_event)"),
    },
  },
  async ({ events }) => {
    assertNotion();
    assertLlm();
    const result = await runBehaviorCycle(events, { quiet: true });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.registerTool(
  "shadowos_create_brain_page",
  {
    description: "Create a page in the ShadowOS Notion database (title + markdown body + optional category labels).",
    inputSchema: {
      title: z.string(),
      body: z.string().describe("Markdown-style body (headings, bullets)"),
      category: z.string().optional(),
      recordType: z.string().optional(),
    },
  },
  async ({ title, body, category, recordType }) => {
    assertNotion();
    const page = await createBrainPage({
      title,
      body,
      meta: { category, recordType },
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ id: page.id, url: page.url }) }],
    };
  }
);

server.registerTool(
  "shadowos_append_blocks",
  {
    description: "Append markdown blocks to an existing Notion page by id.",
    inputSchema: {
      pageId: z.string().describe("Notion page UUID"),
      markdown: z.string(),
    },
  },
  async ({ pageId, markdown }) => {
    assertNotion();
    const blocks = roughMarkdownToBlocks(markdown);
    await appendBlocks(pageId, blocks);
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, blocks: blocks.length }) }] };
  }
);

server.registerTool(
  "shadowos_query_brain",
  {
    description: "List recent pages from the ShadowOS Notion database (optional category filter if your DB has that select property).",
    inputSchema: {
      category: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  async ({ category, limit }) => {
    assertNotion();
    const res = await queryRecentBrain({ category, limit: limit ?? 10 });
    const simplified = res.results.map((p) => ({
      id: p.id,
      last_edited: p.last_edited_time,
    }));
    return { content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }] };
  }
);

server.registerTool(
  "shadowos_ingest_research_topics",
  {
    description:
      "Log a cluster of browser/research topics as a learning-gap signal (e.g. many Docker error tabs). Feeds the learning planner on the next decision cycle.",
    inputSchema: {
      topics: z.array(z.string()).describe("Tab titles or search queries"),
      notes: z.string().optional(),
    },
  },
  async ({ topics, notes }) => {
    logActivity({
      type: "browser",
      topics,
      notes,
      timestamp: Date.now(),
      source: "mcp",
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true, count: topics.length }),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
