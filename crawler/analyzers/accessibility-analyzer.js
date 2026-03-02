/**
 * Accessibility analyzer — detects structural a11y issues.
 */

const cheerio = require("cheerio");
const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

function basicSelector($, el) {
  const tag = el.tagName || el.name;
  if (!tag) return "";
  const id = $(el).attr("id");
  if (id) return `${tag}#${id}`;
  const classes = ($(el).attr("class") || "").split(/\s+/).filter(Boolean);
  if (classes.length) return `${tag}.${classes.slice(0, 2).join(".")}`;
  return tag;
}

class AccessibilityAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { htmlContent = "" } = {}) {
    if (!htmlContent) return [];

    const $ = cheerio.load(htmlContent);
    const issues = [];

    this._checkLang($, pageUrl, issues);
    this._checkLandmarks($, pageUrl, issues);
    this._checkSkipNav($, pageUrl, issues);
    this._checkEmptyLinks($, pageUrl, issues);
    this._checkHeadingHierarchy($, pageUrl, issues);

    return issues;
  }

  _checkLang($, pageUrl, issues) {
    const html = $("html");
    if (!html.length) return;
    const lang = html.attr("lang");
    if (!lang || !lang.trim()) {
      issues.push(new Issue({
        issueType: IssueType.A11Y_MISSING_LANG,
        pageUrl,
        elementSelector: "html",
        message: "Page is missing lang attribute on <html> tag",
        suggestion: 'Add lang attribute: <html lang="en"> (use appropriate language code)',
      }));
    }
  }

  _checkLandmarks($, pageUrl, issues) {
    const hasMain = !!($("main").length || $('[role="main"]').length);
    const hasNav = !!($("nav").length || $('[role="navigation"]').length);

    const missing = [];
    if (!hasMain) missing.push("<main>");
    if (!hasNav) missing.push("<nav>");

    if (missing.length) {
      issues.push(new Issue({
        issueType: IssueType.A11Y_MISSING_LANDMARKS,
        pageUrl,
        message: `Page is missing landmark elements: ${missing.join(", ")}`,
        suggestion: "Add semantic landmark elements (<main>, <nav>) for screen reader navigation",
      }));
    }
  }

  _checkSkipNav($, pageUrl, issues) {
    const links = $("a[href]").slice(0, 10);
    let found = false;

    links.each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().toLowerCase();
      const ariaLabel = ($(el).attr("aria-label") || "").toLowerCase();
      if (href.startsWith("#") && (text.includes("skip") || ariaLabel.includes("skip"))) {
        found = true;
        return false; // break
      }
    });

    if (!found) {
      issues.push(new Issue({
        issueType: IssueType.A11Y_MISSING_SKIP_NAV,
        pageUrl,
        message: "Page is missing a 'skip to content' navigation link",
        suggestion: 'Add a skip link as the first focusable element: <a href="#main-content">Skip to content</a>',
      }));
    }
  }

  _checkEmptyLinks($, pageUrl, issues) {
    let flagged = 0;
    const maxFlags = 10;

    $("a[href]").each((_, el) => {
      if (flagged >= maxFlags) return false;

      const text = $(el).text().trim();
      const ariaLabel = $(el).attr("aria-label");
      const ariaLabelledby = $(el).attr("aria-labelledby");
      const title = $(el).attr("title");

      const childImg = $(el).find("img").first();
      const imgAlt = childImg.length ? (childImg.attr("alt") || "").trim() : "";

      const hasAccessibleName = !!(text || ariaLabel || ariaLabelledby || title || imgAlt);

      if (!hasAccessibleName) {
        const href = $(el).attr("href") || "";
        const selector = basicSelector($, el);
        issues.push(new Issue({
          issueType: IssueType.A11Y_EMPTY_LINK,
          pageUrl,
          elementSelector: selector,
          targetUrl: href,
          message: "Link has no accessible text for screen readers",
          suggestion: "Add text content, aria-label, or a child image with alt text",
        }));
        flagged++;
      }
    });
  }

  _checkHeadingHierarchy($, pageUrl, issues) {
    const headings = $("h1, h2, h3, h4, h5, h6");
    if (!headings.length) return;

    let prevLevel = 0;
    headings.each((_, el) => {
      const tag = el.tagName || el.name;
      const level = parseInt(tag[1], 10);

      if (prevLevel > 0 && level > prevLevel + 1) {
        const text = $(el).text().trim().slice(0, 60);
        const selector = basicSelector($, el);
        issues.push(new Issue({
          issueType: IssueType.A11Y_HEADING_HIERARCHY,
          pageUrl,
          elementSelector: selector,
          elementText: text,
          message: `Heading level skipped: h${prevLevel} -> h${level}`,
          suggestion: `Use h${prevLevel + 1} instead of h${level} to maintain proper heading hierarchy`,
        }));
      }

      prevLevel = level;
    });
  }
}

module.exports = { AccessibilityAnalyzer };
