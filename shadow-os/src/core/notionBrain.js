import { Client } from "@notionhq/client";
import { config, assertNotion } from "./config.js";

let _client;

export function getNotion() {
  assertNotion();
  if (!_client) _client = new Client({ auth: config.notionApiKey });
  return _client;
}

/** @typedef {{ category?: string, recordType?: string }} PageMeta */

/**
 * @param {string} title
 * @param {PageMeta} meta
 */
export function buildProperties(title, meta = {}) {
  const t = title.slice(0, 2000);
  const props = {
    [config.notionTitleProperty]: {
      title: [{ type: "text", text: { content: t } }],
    },
  };
  if (config.notionCategoryProperty && meta.category) {
    props[config.notionCategoryProperty] = {
      select: { name: meta.category.slice(0, 100) },
    };
  }
  if (config.notionTypeProperty && meta.recordType) {
    props[config.notionTypeProperty] = {
      select: { name: meta.recordType.slice(0, 100) },
    };
  }
  return props;
}

/**
 * @param {string} text
 * @returns {import('@notionhq/client').BlockObjectRequest[]}
 */
export function textToParagraphBlocks(text) {
  const chunks = (text || "").split(/\n\n+/).filter(Boolean);
  return chunks.slice(0, 90).map((chunk) => ({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        { type: "text", text: { content: chunk.replace(/\n/g, " ").slice(0, 2000) } },
      ],
    },
  }));
}

/**
 * @param {string} markdown-ish body (headings + bullets + paragraphs)
 */
export function roughMarkdownToBlocks(md) {
  const lines = (md || "").split("\n");
  /** @type {import('@notionhq/client').BlockObjectRequest[]} */
  const out = [];
  for (const line of lines) {
    const t = line.trimEnd();
    if (!t.trim()) continue;
    if (t.startsWith("### ")) {
      out.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: t.slice(4).slice(0, 2000) } }],
        },
      });
    } else if (t.startsWith("## ")) {
      out.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: t.slice(3).slice(0, 2000) } }],
        },
      });
    } else if (t.startsWith("# ")) {
      out.push({
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: [{ type: "text", text: { content: t.slice(2).slice(0, 2000) } }],
        },
      });
    } else if (/^[-*]\s+/.test(t)) {
      out.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: t.replace(/^[-*]\s+/, "").slice(0, 2000) } }],
        },
      });
    } else {
      out.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: t.slice(0, 2000) } }],
        },
      });
    }
    if (out.length >= 95) break;
  }
  return out;
}

/**
 * @param {import('@notionhq/client').Client} notion
 * @param {string} title
 * @param {PageMeta} meta
 * @param {import('@notionhq/client').BlockObjectRequest[]} children
 */
async function pagesCreateWithFallback(notion, title, meta, children) {
  const sliced = children.slice(0, 100);
  const attempts = [
    () => ({
      parent: { database_id: config.notionDbId },
      properties: buildProperties(title, meta),
      ...(sliced.length ? { children: sliced } : {}),
    }),
    () => ({
      parent: { database_id: config.notionDbId },
      properties: buildProperties(title, {}),
      ...(sliced.length ? { children: sliced } : {}),
    }),
    () => ({
      parent: { database_id: config.notionDbId },
      properties: buildProperties(title, {}),
    }),
  ];
  let lastErr;
  for (const make of attempts) {
    try {
      return await notion.pages.create(make());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Subpage under a normal Notion page (not a database row).
 * @param {import('@notionhq/client').Client} notion
 */
async function createChildPage(notion, title, children) {
  const sliced = children.slice(0, 100);
  return notion.pages.create({
    parent: { page_id: config.notionPageId },
    properties: {
      title: {
        title: [{ type: "text", text: { content: title.slice(0, 2000) } }],
      },
    },
    ...(sliced.length ? { children: sliced } : {}),
  });
}

/**
 * @param {{ title: string, body?: string, meta?: PageMeta }} p
 */
export async function createBrainPage({ title, body = "", meta = {} }) {
  const notion = getNotion();
  const children =
    body.includes("#") || body.includes("- ") || body.includes("* ")
      ? roughMarkdownToBlocks(body)
      : textToParagraphBlocks(body);
  if (config.notionDbId) {
    return pagesCreateWithFallback(notion, title, meta, children);
  }
  return createChildPage(notion, title, children);
}

/**
 * @param {string} pageId
 * @param {import('@notionhq/client').BlockObjectRequest[]} blocks
 */
export async function appendBlocks(pageId, blocks) {
  const notion = getNotion();
  const batch = blocks.slice(0, 100);
  if (!batch.length) return null;
  return notion.blocks.children.append({ block_id: pageId, children: batch });
}

/**
 * @param {{ category?: string, limit?: number }} q
 */
export async function queryRecentBrain({ category, limit = 10 } = {}) {
  const notion = getNotion();
  if (!config.notionDbId) {
    return { results: [], object: "list", has_more: false, next_cursor: null };
  }
  /** @type {import('@notionhq/client').QueryDatabaseParameters} */
  const params = {
    database_id: config.notionDbId,
    page_size: Math.min(limit, 100),
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  };
  if (category && config.notionCategoryProperty) {
    params.filter = {
      property: config.notionCategoryProperty,
      select: { equals: category },
    };
  }
  try {
    return await notion.databases.query(params);
  } catch {
    if (params.filter) {
      delete params.filter;
      return notion.databases.query(params);
    }
    throw new Error("Notion query failed");
  }
}
