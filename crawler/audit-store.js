/**
 * Persists completed audits and computes diffs between runs for the same site.
 *
 * Storage layout (under DATA_DIR/audits/):
 *   <urlHash>.json  → { url, history: [<audit>, ...] } — newest first, capped at HISTORY_LIMIT
 *
 * Each audit:
 *   { id, url, completedAt, totalPages, severityCounts, fingerprints: [...], issues: [<issue JSON>] }
 *
 * All public functions are best-effort: they catch and log internally so a
 * persistence failure never blocks a crawl from completing.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HISTORY_LIMIT = 10;

function getDataDir() {
  return process.env.DATA_DIR || path.join(__dirname, "..", "data");
}

function getAuditsDir() {
  return path.join(getDataDir(), "audits");
}

function ensureAuditsDir() {
  const dir = getAuditsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Normalize URL for site identity: lowercase host, lowercase path with no
// trailing slash, drop query and fragment. example.com and example.com/ collide
// (intentionally — they're the same audit target).
function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let pathname = u.pathname.toLowerCase();
    if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
    return `${u.protocol}//${host}${pathname}`;
  } catch {
    return rawUrl;
  }
}

function urlHash(rawUrl) {
  return crypto.createHash("sha256").update(normalizeUrl(rawUrl)).digest("hex").slice(0, 16);
}

// Stable identity for an issue across runs — skips the human-readable message
// (which often embeds counts that change when the issue gets partially fixed).
function fingerprintIssue(issue) {
  const parts = [
    issue.issue_type || issue.issueType || "",
    issue.page_url || issue.pageUrl || "",
    issue.target_url || issue.targetUrl || "",
    issue.element_text || issue.elementText || "",
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

function loadFile(rawUrl) {
  try {
    const file = path.join(getAuditsDir(), `${urlHash(rawUrl)}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    logWarn("loadFile failed", err);
    return null;
  }
}

function saveFile(rawUrl, data) {
  try {
    ensureAuditsDir();
    const file = path.join(getAuditsDir(), `${urlHash(rawUrl)}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    logWarn("saveFile failed", err);
  }
}

function getLastAudit(rawUrl) {
  const data = loadFile(rawUrl);
  if (!data || !Array.isArray(data.history) || data.history.length === 0) return null;
  return data.history[0];
}

function getHistory(rawUrl) {
  const data = loadFile(rawUrl);
  if (!data || !Array.isArray(data.history)) return [];
  return data.history.map(({ issues, fingerprints, ...summary }) => summary);
}

// Save a completed audit. Returns the audit object that was saved.
function saveAudit(rawUrl, { totalPages, issues, completedAt }) {
  const issuesJSON = issues.map((i) => (typeof i.toJSON === "function" ? i.toJSON() : i));
  const fingerprints = issuesJSON.map(fingerprintIssue);
  const severityCounts = countBySeverity(issuesJSON);

  const audit = {
    id: crypto.randomUUID().slice(0, 8),
    url: rawUrl,
    completedAt: completedAt || new Date().toISOString(),
    totalPages: totalPages || 0,
    totalIssues: issuesJSON.length,
    severityCounts,
    fingerprints,
    issues: issuesJSON,
  };

  const existing = loadFile(rawUrl) || { url: rawUrl, history: [] };
  existing.url = rawUrl;
  existing.history = [audit, ...existing.history].slice(0, HISTORY_LIMIT);
  saveFile(rawUrl, existing);
  return audit;
}

// Compare current issues against the most recent prior audit. Returns null when
// there's no prior audit to compare against.
function computeDiff(currentIssues, previousAudit) {
  if (!previousAudit) return null;
  const currentIssuesJSON = currentIssues.map((i) => (typeof i.toJSON === "function" ? i.toJSON() : i));
  const currentFingerprints = currentIssuesJSON.map(fingerprintIssue);
  const previousSet = new Set(previousAudit.fingerprints || []);
  const currentSet = new Set(currentFingerprints);

  let newCount = 0;
  let persistingCount = 0;
  for (const fp of currentSet) {
    if (previousSet.has(fp)) persistingCount++;
    else newCount++;
  }
  let resolvedCount = 0;
  for (const fp of previousSet) {
    if (!currentSet.has(fp)) resolvedCount++;
  }

  // Per-issue change status, in the same order as currentIssues
  const changeStatus = currentFingerprints.map((fp) => (previousSet.has(fp) ? "persisting" : "new"));

  return {
    prevId: previousAudit.id,
    prevDate: previousAudit.completedAt,
    prevTotalIssues: previousAudit.totalIssues || (previousAudit.issues || []).length,
    newCount,
    persistingCount,
    resolvedCount,
    changeStatus,
  };
}

function countBySeverity(issuesJSON) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issuesJSON) {
    const s = issue.severity || "warning";
    if (counts[s] !== undefined) counts[s]++;
  }
  return counts;
}

function logWarn(msg, err) {
  process.stderr.write(JSON.stringify({
    time: new Date().toISOString(),
    level: "warn",
    msg: `audit-store: ${msg}`,
    err: err ? String(err.message || err) : undefined,
  }) + "\n");
}

module.exports = {
  HISTORY_LIMIT,
  getDataDir,
  normalizeUrl,
  urlHash,
  fingerprintIssue,
  getLastAudit,
  getHistory,
  saveAudit,
  computeDiff,
};
