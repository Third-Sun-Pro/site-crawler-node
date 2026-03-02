/**
 * Performance analyzer — detects common performance anti-patterns.
 */

const cheerio = require("cheerio");
const { URL } = require("url");
const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

const CDN_RE = /(googleapis\.com|gstatic\.com|cloudflare\.com|jsdelivr\.net|unpkg\.com|cdnjs\.com|bootstrapcdn\.com|fontawesome\.com|jquery\.com|google-analytics\.com|googletagmanager\.com|facebook\.net|twitter\.com|analytics|recaptcha|stripe\.com|gravatar\.com|wp\.com)/i;
const NON_BLOCKING_TYPES = new Set(["application/ld+json", "application/json", "text/template", "text/html"]);
const TRACKER_RE = /(pixel|spacer|blank|tracking|beacon|1x1|transparent)/i;

function isOwnUnminified(url, siteDomain) {
  if (!url) return false;

  let urlDomain = "";
  try {
    const parsed = new URL(url, `https://${siteDomain}`);
    urlDomain = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }

  const isOwn = !urlDomain || urlDomain === siteDomain ||
    urlDomain === `www.${siteDomain}` || siteDomain === `www.${urlDomain}`;
  if (!isOwn) return false;
  if (CDN_RE.test(url)) return false;

  let pathname;
  try {
    pathname = new URL(url, `https://${siteDomain}`).pathname.toLowerCase();
  } catch {
    return false;
  }
  const filename = pathname.split("/").pop() || "";
  if (!filename.endsWith(".js") && !filename.endsWith(".css")) return false;
  if (filename.includes(".min.")) return false;

  return true;
}

class PerformanceAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { htmlContent = "" } = {}) {
    if (!htmlContent) return [];

    const $ = cheerio.load(htmlContent);
    const issues = [];

    let siteDomain;
    try {
      siteDomain = new URL(pageUrl).hostname.toLowerCase();
    } catch {
      siteDomain = "";
    }

    this._checkRenderBlockingScripts($, pageUrl, issues);
    this._checkImageDimensions($, pageUrl, issues);
    this._checkLazyLoading($, pageUrl, issues);
    this._checkExcessiveResources($, pageUrl, issues);
    this._checkViewport($, pageUrl, issues);
    this._checkInlineStyles($, pageUrl, issues);
    this._checkUnminifiedAssets($, pageUrl, siteDomain, issues);

    return issues;
  }

  _checkRenderBlockingScripts($, pageUrl, issues) {
    const head = $("head");
    if (!head.length) return;

    head.find("script[src]").each((_, el) => {
      if ($(el).attr("async") !== undefined || $(el).attr("defer") !== undefined) return;

      const type = ($(el).attr("type") || "").toLowerCase().trim();
      if (type === "module") return;
      if (NON_BLOCKING_TYPES.has(type)) return;

      const src = $(el).attr("src");
      issues.push(new Issue({
        issueType: IssueType.PERF_RENDER_BLOCKING_SCRIPT,
        pageUrl,
        targetUrl: src,
        message: `Script in <head> blocks rendering: ${src.split("?")[0].slice(-80)}`,
        suggestion: "Add async or defer attribute, or move to end of <body>",
      }));
    });
  }

  _checkImageDimensions($, pageUrl, issues) {
    $("img").each((_, el) => {
      if ($(el).closest("noscript").length) return;

      const hasWidth = $(el).attr("width");
      const hasHeight = $(el).attr("height");
      if (hasWidth && hasHeight) return;

      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      if (TRACKER_RE.test(src)) return;
      if (src.startsWith("data:")) return;

      const alt = $(el).attr("alt") || "";
      const displaySrc = src ? src.split("?")[0].slice(-60) : "(no src)";

      issues.push(new Issue({
        issueType: IssueType.PERF_IMAGE_MISSING_DIMENSIONS,
        pageUrl,
        elementText: alt.slice(0, 100),
        targetUrl: src,
        message: `Image missing width/height attributes: ${displaySrc}`,
        suggestion: "Add width and height attributes to prevent layout shift (CLS)",
      }));
    });
  }

  _checkLazyLoading($, pageUrl, issues) {
    const allImgs = [];
    $("img").each((_, el) => {
      if (!$(el).closest("noscript").length) allImgs.push(el);
    });

    // Skip first 3 (above the fold)
    const belowFold = allImgs.slice(3);

    for (const el of belowFold) {
      const loading = ($(el).attr("loading") || "").toLowerCase();
      if (loading === "lazy") continue;

      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      if (TRACKER_RE.test(src)) continue;
      if (src.startsWith("data:")) continue;

      const displaySrc = src ? src.split("?")[0].slice(-60) : "(no src)";
      issues.push(new Issue({
        issueType: IssueType.PERF_IMAGE_NO_LAZY_LOADING,
        pageUrl,
        targetUrl: src,
        message: `Image not lazy-loaded: ${displaySrc}`,
        suggestion: 'Add loading="lazy" to images below the fold',
      }));
    }
  }

  _checkExcessiveResources($, pageUrl, issues) {
    const externalCSS = $('link[rel="stylesheet"]').length;
    const externalJS = $("script[src]").length;
    const total = externalCSS + externalJS;

    if (total >= 20) {
      issues.push(new Issue({
        issueType: IssueType.PERF_EXCESSIVE_RESOURCES,
        pageUrl,
        message: `Page loads ${total} external resources (${externalCSS} CSS, ${externalJS} JS)`,
        suggestion: "Combine or reduce external CSS/JS files to speed up initial page load",
      }));
    }
  }

  _checkViewport($, pageUrl, issues) {
    const viewport = $('meta[name="viewport"], meta[name="Viewport"], meta[name="VIEWPORT"]');
    if (!viewport.length) {
      issues.push(new Issue({
        issueType: IssueType.PERF_MISSING_VIEWPORT,
        pageUrl,
        message: 'Page is missing <meta name="viewport"> tag',
        suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0"> to <head>',
      }));
    }
  }

  _checkInlineStyles($, pageUrl, issues) {
    $("style").each((_, el) => {
      const content = $(el).text() || "";
      const sizeBytes = Buffer.byteLength(content, "utf8");

      if (sizeBytes > 10240) {
        const sizeKB = (sizeBytes / 1024).toFixed(1);
        issues.push(new Issue({
          issueType: IssueType.PERF_INLINE_STYLE_BLOCK,
          pageUrl,
          message: `Inline <style> block is ${sizeKB}KB (over 10KB threshold)`,
          suggestion: "Move large style blocks to external CSS files for browser caching",
        }));
      }
    });
  }

  _checkUnminifiedAssets($, pageUrl, siteDomain, issues) {
    let flagged = 0;
    const maxFlags = 5;

    $("script[src]").each((_, el) => {
      if (flagged >= maxFlags) return false;
      const src = $(el).attr("src");
      if (isOwnUnminified(src, siteDomain)) {
        const filename = src.split("/").pop().split("?")[0];
        issues.push(new Issue({
          issueType: IssueType.PERF_UNMINIFIED_ASSETS,
          pageUrl,
          targetUrl: src,
          message: `JS file may not be minified: ${filename}`,
          suggestion: "Use a minified version (.min.js) for production",
        }));
        flagged++;
      }
    });

    $('link[rel="stylesheet"]').each((_, el) => {
      if (flagged >= maxFlags) return false;
      const href = $(el).attr("href") || "";
      if (isOwnUnminified(href, siteDomain)) {
        const filename = href.split("/").pop().split("?")[0];
        issues.push(new Issue({
          issueType: IssueType.PERF_UNMINIFIED_ASSETS,
          pageUrl,
          targetUrl: href,
          message: `CSS file may not be minified: ${filename}`,
          suggestion: "Use a minified version (.min.css) for production",
        }));
        flagged++;
      }
    });
  }
}

module.exports = { PerformanceAnalyzer };
