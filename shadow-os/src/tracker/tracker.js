import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const LOG_DIR = path.join(ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "activity.log");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** @type {object[]} */
const pending = [];

/**
 * @param {object} activity
 */
export function logActivity(activity) {
  ensureLogDir();
  const row = { ...activity, timestamp: activity.timestamp ?? Date.now() };
  pending.push(row);
  fs.appendFileSync(LOG_FILE, JSON.stringify(row) + "\n");
}

export function drainPending() {
  const batch = pending.splice(0, pending.length);
  return batch;
}

export function peekPendingCount() {
  return pending.length;
}

/** Load last N lines from activity.log into the pending queue (for cold --once runs). */
export function replayFromLog(maxLines = 40) {
  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) return 0;
  const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean).slice(-maxLines);
  let n = 0;
  for (const line of lines) {
    try {
      pending.push(JSON.parse(line));
      n++;
    } catch {
      /* skip */
    }
  }
  return n;
}

/**
 * @param {string} filePath
 */
export function ingestBrowserJsonl(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  let n = 0;
  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      logActivity({
        type: "browser",
        ...o,
      });
      n++;
    } catch {
      /* skip */
    }
  }
  return n;
}

/**
 * @param {string} commandLine
 * @param {{ cwd?: string, exitCode?: number }} meta
 */
export function logTerminalCommand(commandLine, meta = {}) {
  logActivity({
    type: "terminal",
    command: commandLine,
    ...meta,
  });
}

/**
 * @param {string} rootDir
 * @param {(events: object[]) => void} onBatch
 * @param {number} debounceMs
 * @returns {Promise<import('chokidar').FSWatcher>}
 */
export async function watchWorkspace(rootDir, onBatch, debounceMs) {
  ensureLogDir();
  let timer = null;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onBatch(), debounceMs);
  };

  const watcher = chokidar.watch(rootDir, {
    ignoreInitial: true,
    ignored: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/logs/**",
    ],
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });

  const push = (type, filePath) => {
    logActivity({
      type,
      file: path.relative(rootDir, filePath),
      absPath: filePath,
      timestamp: Date.now(),
    });
    schedule();
  };

  watcher.on("add", (p) => push("code_change", p));
  watcher.on("change", (p) => push("code_change", p));

  await new Promise((resolve, reject) => {
    const ms = 120_000;
    const to = setTimeout(() => reject(new Error(`chokidar ready timeout after ${ms}ms`)), ms);
    watcher.once("ready", () => {
      clearTimeout(to);
      resolve(undefined);
    });
    watcher.once("error", (err) => {
      clearTimeout(to);
      reject(err);
    });
  });
  return watcher;
}
