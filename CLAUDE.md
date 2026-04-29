# Site Crawler (Node.js)

Node.js rewrite of the original Python Site Crawler. **This is the version deployed at [crawler.tsapp.us](https://crawler.tsapp.us/)** — the Python version in `../site-crawler/` is CLI/local only.

Pre-launch website auditor for Third Sun client sites: broken links, accessibility issues, form problems, grammar errors, payment test mode leaks, Joomla misconfiguration, performance anti-patterns.

## Why a Node Rewrite?

Hostinger doesn't run Python well. The Node port keeps the same analyzer architecture but runs natively on Hostinger's stack. The Python version is still useful for local CLI runs — the Node version is what the team uses via the webapp.

## Tech Stack

Node.js + Express 5, cheerio (HTML parsing), p-limit (concurrency), zod (config validation), csv-stringify (report output), express-rate-limit, cookie-parser. Vanilla HTML/CSS/JS frontend with Server-Sent Events for live progress. Vitest + Supertest for tests.

**No Playwright / no headless browser** — unlike the Python version, this one is static-HTML only. Dynamic-interaction testing is not available here because Hostinger can't run a browser. If you need to actually click buttons or submit forms during an audit, use the Python version (`../site-crawler/`) locally.

## How to Run

```bash
npm install
node server.js          # Starts on port 3000 (override with PORT env var)
npm test                # Run all tests (analyzers, models, parser, server)
npm run test:watch      # Watch mode
```

## Environment Variables (.env)

- `APP_PASSWORD` — required (team login; also used as HMAC auth secret)
- `DATA_DIR` — **must be set in production** to a path outside the deploy folder (e.g. `../data`). Defaults to `./data` which lives inside the deploy folder and gets wiped on every Hostinger deploy. Stores the audit-history JSON files. Server logs a warning at startup if `NODE_ENV=production` and this isn't set.
- `PORT` — optional, defaults to 3000
- `NODE_ENV` — set to `production` on deploy

**No Anthropic API key** — this tool is pure static analysis, no LLM calls.

## Key Files

- `server.js` — Express app, auth, rate limiting, crawl orchestration, SSE progress stream, CSV download
- `crawler/`
  - `config.js` — zod-validated crawl options
  - `crawler.js` — Main orchestrator (returns array of Issues)
  - `fetcher.js` — async HTTP with rate limiting + retries
  - `parser.js` — cheerio HTML parsing (links, buttons, forms, images)
  - `url-manager.js` — URL queue and visit tracking
  - `models.js` — Issue / IssueType / PageResult shapes
  - `csv-reporter.js` — CSV output
  - `audit-store.js` — Persists each completed audit to `DATA_DIR/audits/<urlHash>.json` (newest 10 per site) and computes diffs vs the previous audit (resolved / persisting / new counts plus per-issue change_status)
  - `analyzers/` — modular issue detectors (all extend `base.js`)
    - `accessibility-analyzer.js`, `button-analyzer.js`, `form-analyzer.js`, `grammar-analyzer.js`, `image-analyzer.js`, `joomla-analyzer.js`, `link-analyzer.js`, `payment-analyzer.js`, `performance-analyzer.js`
- `public/index.html` — Single-page web UI with live progress
- `tests/` — Vitest suite (analyzers, models, parser, server)

## Endpoints

- `POST /login` / `GET /auth-check` — HMAC cookie auth (24h expiry)
- `POST /crawl` — kick off a crawl, returns crawlId
- `GET /crawl/:crawlId/stream` — SSE stream of crawl progress
- `GET /crawl/:crawlId/csv` — download finished report as CSV

## Analyzers

Same static checks as the Python version, **minus dynamic-interaction testing**:

- Link, Button, Form, Grammar, Image, Accessibility, Joomla, Performance, Payment, **Schema, SEO**

The Schema analyzer detects JSON-LD and Microdata, validates JSON-LD syntax, checks for required `@context`/`@type` fields, and reports the schema types found. The SEO analyzer checks title length (10–60 chars), meta description length (50–160 chars), canonical URLs, and AI-crawler-blocking meta tags (robots, GPTBot, ClaudeBot, Google-Extended, PerplexityBot, CCBot — `noindex`/`nofollow` flagged as ERROR severity for GEO discoverability).

## Important Context

- All client sites are Joomla — the Joomla analyzer is tuned for Third Sun's component stack (Event Booking, DP Calendar, Forms by Tassos, RSSEO!, Engage Box, Droppics)
- Payment analyzer (Stripe test mode detection) always runs — never skippable
- Crawl progress streams to the browser via SSE
- Reports are CSVs with columns: priority, type, description, page, element, suggestion
- Use the Python version (`../site-crawler/`) if you need dynamic-interaction testing (Playwright button/form clicking)

## Audit History

After every completed crawl the report is persisted to `DATA_DIR/audits/<urlHash>.json` (where `urlHash` is a hash of the normalized startUrl — same domain + path collapses to the same file). The most recent 10 audits per site are kept; older ones are dropped.

When the same URL is audited again, the server compares against the most recent prior audit and surfaces three counts (resolved / persisting / new) in a banner above the report. Each individual issue is tagged with a `NEW` or `PERSISTING` badge based on a stable fingerprint (issueType + pageUrl + targetUrl + elementText — message text is intentionally excluded since it embeds counts that change as fixes land).

URL normalization for audit identity: lowercase host (with leading `www.` stripped), lowercase path with no trailing slash, query string and fragment dropped. So `example.com`, `EXAMPLE.com`, `example.com/`, and `example.com/?utm=x` all share the same audit history.

To wipe history for one site: delete the matching `<urlHash>.json` file from `DATA_DIR/audits/`. To wipe all history: delete the whole `audits/` folder.

## Deployment

Deployed at **crawler.tsapp.us** on Hostinger (auto-deploy from GitHub push).

`.env` created **manually** on the server. Hostinger wipes the app directory on deploy — keep persistent data outside the deploy folder. Audit history depends on `DATA_DIR` being set (see Environment Variables).

## Git

- Remote: github.com/Third-Sun-Pro/site-crawler-node (public — required for scheduled remote agents)
- Separate repo from the Python version (`Third-Sun-Pro/site-crawler`, private)
