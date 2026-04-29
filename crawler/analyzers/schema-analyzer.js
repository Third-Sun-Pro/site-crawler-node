/**
 * Schema markup analyzer — detects structured data presence, validity, and completeness.
 * Ported from the Python site-crawler (schema_analyzer.py).
 */

const cheerio = require("cheerio");
const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

class SchemaAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { htmlContent = "" } = {}) {
    if (!htmlContent) return [];

    const $ = cheerio.load(htmlContent);
    const issues = [];

    const jsonldBlocks = $('script[type="application/ld+json"]').toArray();
    const microdataElements = $("[itemscope]").toArray();

    const hasAnySchema = jsonldBlocks.length > 0 || microdataElements.length > 0;

    const schemaTypes = [];

    for (const block of jsonldBlocks) {
      const raw = ($(block).html() || "").trim();
      if (!raw) {
        issues.push(new Issue({
          issueType: IssueType.SCHEMA_INVALID_JSON_LD,
          pageUrl,
          message: "Empty JSON-LD script block",
          suggestion: "Add valid structured data or remove the empty script tag",
        }));
        continue;
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        issues.push(new Issue({
          issueType: IssueType.SCHEMA_INVALID_JSON_LD,
          pageUrl,
          message: `Invalid JSON in JSON-LD block: ${String(err.message).slice(0, 100)}`,
          suggestion: "Fix the JSON syntax in the structured data block",
          context: raw.slice(0, 200),
        }));
        continue;
      }

      const objects = Array.isArray(data) ? data : [data];
      for (const obj of objects) {
        if (!obj || typeof obj !== "object") continue;
        validateJsonldObject(obj, pageUrl, issues);
        if (obj["@type"]) schemaTypes.push(String(obj["@type"]));
      }
    }

    for (const el of microdataElements) {
      const itemtype = $(el).attr("itemtype") || "";
      if (itemtype) {
        const typeName = itemtype.replace(/\/+$/, "").split("/").pop();
        if (typeName) schemaTypes.push(typeName);
      }
    }

    if (!hasAnySchema) {
      issues.push(new Issue({
        issueType: IssueType.SCHEMA_MISSING,
        pageUrl,
        message: "No structured data found (no JSON-LD or Microdata)",
        suggestion: "Add JSON-LD structured data to help search engines and AI models understand page content",
      }));
    }

    if (schemaTypes.length > 0) {
      const uniqueTypes = [...new Set(schemaTypes)].sort();
      issues.push(new Issue({
        issueType: IssueType.SCHEMA_FOUND,
        pageUrl,
        message: `Schema types found: ${uniqueTypes.join(", ")}`,
        context: `${jsonldBlocks.length} JSON-LD block(s), ${microdataElements.length} Microdata element(s)`,
      }));
    }

    return issues;
  }
}

function validateJsonldObject(obj, pageUrl, issues) {
  const missing = [];
  if (!("@context" in obj)) missing.push("@context");
  if (!("@type" in obj)) missing.push("@type");

  if (missing.length > 0) {
    const preview = JSON.stringify(obj).slice(0, 150);
    issues.push(new Issue({
      issueType: IssueType.SCHEMA_INCOMPLETE,
      pageUrl,
      message: `JSON-LD missing required fields: ${missing.join(", ")}`,
      suggestion: `Add ${missing.join(" and ")} to the structured data object`,
      context: preview,
    }));
  }
}

module.exports = { SchemaAnalyzer };
