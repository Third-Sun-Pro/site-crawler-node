/**
 * Site Crawler — Express webapp.
 */

const crypto = require("crypto");
const path = require("path");
const { URL } = require("url");

require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const { createConfig } = require("./crawler/config");
const { Crawler } = require("./crawler/crawler");
const { generateCSV, COLUMNS } = require("./crawler/csv-reporter");
const auditStore = require("./crawler/audit-store");

// ---------------------------------------------------------------------------
// Structured logging (matches Brief Generator pattern)
// ---------------------------------------------------------------------------

function log(level, msg, extra = {}) {
  const entry = { time: new Date().toISOString(), level, msg, ...extra };
  const out = level === "error" ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

const APP_PASSWORD = process.env.APP_PASSWORD || "";
if (!APP_PASSWORD) {
  log("warn", "APP_PASSWORD not set — authentication will reject all logins");
}
const AUTH_SECRET = APP_PASSWORD;
const isTest = process.env.NODE_ENV === "test";

// Audit history needs DATA_DIR set outside the deploy folder in production —
// otherwise Hostinger wipes the history on every push.
if (process.env.NODE_ENV === "production" && !process.env.DATA_DIR) {
  log("warn", "DATA_DIR is not set in production — audit history will be wiped on the next Hostinger deploy. Set DATA_DIR=../data (or another path outside the app folder).");
}

// ---------------------------------------------------------------------------
// Auth helpers (HMAC-signed cookie, matching Brief Generator pattern)
// ---------------------------------------------------------------------------

function createAuthToken() {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || !AUTH_SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [timestamp, signature] = parts;
  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(timestamp)
    .digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return false;
    }
  } catch {
    return false;
  }
  const ageMs = Date.now() - parseInt(timestamp, 10);
  if (isNaN(ageMs)) return false;
  return ageMs < 24 * 60 * 60 * 1000;
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.auth_token;
  if (!verifyAuthToken(token)) {
    return res.status(401).json({ error: "Authentication required." });
  }
  next();
}

// ---------------------------------------------------------------------------
// In-memory crawl job store
// ---------------------------------------------------------------------------

class CrawlJob {
  constructor(crawlId, url) {
    this.crawlId = crawlId;
    this.url = url;
    this.issues = [];
    this.pagesCrawled = 0;
    this.linksChecked = 0;
    this.done = false;
    this.error = null;
    this.diff = null; // populated after crawl if a prior audit existed
    this.createdAt = Date.now();
    this.listeners = new Set(); // SSE response objects
  }

  send(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of this.listeners) {
      res.write(payload);
    }
  }
}

const jobs = new Map();
const CLEANUP_INTERVAL = 300_000; // 5 min
const MAX_JOB_AGE = 3_600_000; // 1 hour

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - MAX_JOB_AGE;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, CLEANUP_INTERVAL);
cleanupTimer.unref();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Rate limiting (disabled in test mode)
const crawlLimiter = isTest
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      message: { error: "Too many requests. Please wait before starting another crawl." },
    });

const loginLimiter = isTest
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: { error: "Too many login attempts. Please try again later." },
    });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/login", loginLimiter, (req, res) => {
  const password = (req.body && req.body.password) || "";
  if (!APP_PASSWORD || password !== APP_PASSWORD) {
    return res.status(401).json({ error: "Invalid password." });
  }
  const token = createAuthToken();
  res.cookie("auth_token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ success: true });
});

app.get("/auth-check", (req, res) => {
  const token = req.cookies && req.cookies.auth_token;
  res.json({ authenticated: verifyAuthToken(token) });
});

app.post("/crawl", requireAuth, crawlLimiter, (req, res) => {
  const data = req.body || {};
  let url = (data.url || "").trim();
  if (!url) return res.status(400).json({ error: "URL is required." });
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  const maxPages = Math.min(parseInt(data.max_pages, 10) || 50, 500);
  const skipGrammar = data.skip_grammar !== false; // default true
  const skipExternal = !!data.skip_external;
  const skipForms = !!data.skip_forms;
  const skipJoomla = !!data.skip_joomla;
  const skipPerformance = !!data.skip_performance;
  const skipSchema = !!data.skip_schema;
  const skipSeo = !!data.skip_seo;

  let config;
  try {
    config = createConfig({
      startUrl: url,
      outputFile: "",
      maxPages,
      concurrency: 15,
      rateLimit: 50.0,
      timeout: 10,
      skipGrammar,
      skipExternal,
      skipForms,
      skipJoomla,
      skipPerformance,
      skipSchema,
      skipSeo,
    });
  } catch (err) {
    return res.status(400).json({ error: `Invalid configuration: ${err.message}` });
  }

  const crawlId = crypto.randomUUID().slice(0, 8);
  const job = new CrawlJob(crawlId, url);
  jobs.set(crawlId, job);

  // Start crawl asynchronously
  runCrawl(job, config);

  res.json({ crawl_id: crawlId });
});

app.get("/crawl/:crawlId/stream", requireAuth, (req, res) => {
  const job = jobs.get(req.params.crawlId);
  if (!job) return res.status(404).json({ error: "Crawl not found." });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  job.listeners.add(res);

  // If already done, send final state
  if (job.done) {
    if (job.error) {
      res.write(`data: ${JSON.stringify({ type: "error", message: job.error })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({
        type: "complete",
        total_issues: job.issues.length,
        pages_crawled: job.pagesCrawled,
        links_checked: job.linksChecked,
        issues: applyChangeStatus(job.issues.map((i) => i.toJSON()), job.diff),
        diff: job.diff,
      })}\n\n`);
    }
    res.end();
    job.listeners.delete(res);
    return;
  }

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (!job.done) {
      res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`);
    }
  }, 5000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    job.listeners.delete(res);
  });
});

app.get("/crawl/:crawlId/csv", requireAuth, (req, res) => {
  const job = jobs.get(req.params.crawlId);
  if (!job) return res.status(404).json({ error: "Crawl not found." });
  if (!job.done) return res.status(409).json({ error: "Crawl still in progress." });

  const csvContent = generateCSV(job.issues);
  let domain;
  try {
    domain = new URL(job.url).hostname.replace("www.", "");
  } catch {
    domain = "site";
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${domain}_report.csv"`);
  res.send(csvContent);
});

// ---------------------------------------------------------------------------
// Background crawl runner
// ---------------------------------------------------------------------------

async function runCrawl(job, config) {
  try {
    const crawler = new Crawler(config);

    crawler.on("progress", (data) => {
      job.pagesCrawled = data.pages;
      job.send({ type: "progress", ...data });
    });

    const issues = await crawler.crawl();
    job.issues = issues;
    job.pagesCrawled = crawler.pagesCrawled;
    job.linksChecked = crawler.linksChecked;

    // Compare against previous audit and persist this run. Best-effort: any
    // failure here is logged inside audit-store and the crawl still completes.
    const previousAudit = auditStore.getLastAudit(job.url);
    job.diff = auditStore.computeDiff(issues, previousAudit);
    auditStore.saveAudit(job.url, {
      totalPages: crawler.pagesCrawled,
      issues,
      completedAt: new Date().toISOString(),
    });

    const issuesJSON = applyChangeStatus(issues.map((i) => i.toJSON()), job.diff);

    job.send({
      type: "complete",
      total_issues: issues.length,
      pages_crawled: crawler.pagesCrawled,
      links_checked: crawler.linksChecked,
      issues: issuesJSON,
      diff: job.diff,
    });
  } catch (err) {
    job.error = err.message;
    job.send({ type: "error", message: err.message });
    log("error", "Crawl failed", { crawlId: job.crawlId, error: err.message });
  } finally {
    job.done = true;
    // End all SSE connections
    for (const res of job.listeners) {
      res.end();
    }
    job.listeners.clear();
  }
}

// Tag each issue JSON with change_status ("new" or "persisting") based on the
// computed diff. Order of issuesJSON matches diff.changeStatus.
function applyChangeStatus(issuesJSON, diff) {
  if (!diff || !Array.isArray(diff.changeStatus)) return issuesJSON;
  return issuesJSON.map((issue, idx) => ({
    ...issue,
    change_status: diff.changeStatus[idx],
  }));
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use((err, _req, res, _next) => {
  log("error", "Unhandled error", { error: err.message });
  res.status(500).json({ error: "Internal server error." });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    log("info", "Server running", { port: Number(PORT) });
  });
}

module.exports = app;
module.exports.jobs = jobs;
