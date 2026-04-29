/**
 * SEO analyzer — checks meta tags, titles, canonical URLs, and AI crawler access.
 * Ported from the Python site-crawler (seo_analyzer.py).
 */

const cheerio = require("cheerio");
const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

const AI_BOT_NAMES = ["gptbot", "claudebot", "google-extended", "perplexitybot", "ccbot"];

const TITLE_MIN = 10;
const TITLE_MAX = 60;
const DESC_MIN = 50;
const DESC_MAX = 160;

class SEOAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { htmlContent = "" } = {}) {
    if (!htmlContent) return [];

    const $ = cheerio.load(htmlContent);
    const issues = [];

    checkTitle($, pageUrl, issues);
    checkMetaDescription($, pageUrl, issues);
    checkCanonical($, pageUrl, issues);
    checkAICrawlerBlocking($, pageUrl, issues);

    return issues;
  }
}

function checkTitle($, pageUrl, issues) {
  const titleText = ($("title").first().text() || "").trim();

  if (!titleText) {
    issues.push(new Issue({
      issueType: IssueType.SEO_MISSING_TITLE,
      pageUrl,
      message: "Page is missing a <title> tag",
      suggestion: "Add a descriptive title tag (10-60 characters) that includes the business name and key services",
    }));
    return;
  }

  const length = titleText.length;
  if (length < TITLE_MIN) {
    issues.push(new Issue({
      issueType: IssueType.SEO_SHORT_TITLE,
      pageUrl,
      elementText: titleText,
      message: `Title tag is too short (${length} chars, minimum ${TITLE_MIN})`,
      suggestion: "Expand the title to include the business name, location, or key service",
    }));
  } else if (length > TITLE_MAX) {
    issues.push(new Issue({
      issueType: IssueType.SEO_LONG_TITLE,
      pageUrl,
      elementText: titleText.slice(0, 80),
      message: `Title tag is too long (${length} chars, maximum ${TITLE_MAX})`,
      suggestion: "Shorten the title — search engines and AI models typically truncate after 60 characters",
    }));
  }
}

function checkMetaDescription($, pageUrl, issues) {
  const descText = (firstMetaContent($, "description") || "").trim();

  if (!descText) {
    issues.push(new Issue({
      issueType: IssueType.SEO_MISSING_META_DESC,
      pageUrl,
      message: "Page is missing a meta description",
      suggestion: "Add a meta description (50-160 characters) summarizing the page content with relevant keywords",
    }));
    return;
  }

  const length = descText.length;
  if (length < DESC_MIN) {
    issues.push(new Issue({
      issueType: IssueType.SEO_SHORT_META_DESC,
      pageUrl,
      elementText: descText,
      message: `Meta description is too short (${length} chars, minimum ${DESC_MIN})`,
      suggestion: "Expand the description to better summarize the page content (aim for 50-160 characters)",
    }));
  } else if (length > DESC_MAX) {
    issues.push(new Issue({
      issueType: IssueType.SEO_LONG_META_DESC,
      pageUrl,
      elementText: descText.slice(0, 100),
      message: `Meta description is too long (${length} chars, maximum ${DESC_MAX})`,
      suggestion: "Shorten the description — search engines truncate after ~160 characters",
    }));
  }
}

function checkCanonical($, pageUrl, issues) {
  const href = ($('link[rel="canonical" i]').first().attr("href") || "").trim();
  if (!href) {
    issues.push(new Issue({
      issueType: IssueType.SEO_MISSING_CANONICAL,
      pageUrl,
      message: "Page is missing a canonical URL",
      suggestion: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues',
    }));
  }
}

function checkAICrawlerBlocking($, pageUrl, issues) {
  // General robots meta tag
  const robotsContent = (firstMetaContent($, "robots") || "").toLowerCase();
  if (robotsContent && (robotsContent.includes("noindex") || robotsContent.includes("nofollow"))) {
    issues.push(new Issue({
      issueType: IssueType.SEO_AI_CRAWLER_BLOCKED,
      pageUrl,
      message: `Meta robots tag blocks indexing: ${robotsContent}`,
      suggestion: "This page won't be indexed by search engines or AI models. Remove noindex/nofollow if this page should be discoverable.",
    }));
    return;
  }

  // AI-specific bot blocking tags
  for (const bot of AI_BOT_NAMES) {
    const content = (firstMetaContent($, bot) || "").toLowerCase();
    if (content && (content.includes("noindex") || content.includes("nofollow") || content.includes("none"))) {
      issues.push(new Issue({
        issueType: IssueType.SEO_AI_CRAWLER_BLOCKED,
        pageUrl,
        message: `AI crawler '${bot}' is blocked via meta tag: ${content}`,
        suggestion: `Remove the ${bot} meta tag to allow this AI platform to index your content`,
      }));
    }
  }
}

// Case-insensitive lookup of <meta name="..."> content attribute
function firstMetaContent($, name) {
  return $(`meta[name="${name}" i]`).first().attr("content");
}

module.exports = { SEOAnalyzer };
