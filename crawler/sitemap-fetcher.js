/**
 * Discovers URLs from a site's sitemap.xml so that orphan pages and pages
 * not linked from the start URL still get crawled.
 *
 * Tries /sitemap.xml then /sitemap_index.xml. Handles both the regular
 * <urlset> format and the <sitemapindex> format (one level of recursion —
 * an index can point to up to MAX_NESTED_SITEMAPS child sitemaps).
 *
 * Cross-domain URLs (e.g. a sitemap that points to a subdomain) are filtered
 * out. All errors are silent — sitemap is best-effort, link-following still
 * happens regardless.
 */

const { URL } = require("url");

const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml"];
const LOC_RE = /<loc[^>]*>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
const MAX_NESTED_SITEMAPS = 10;

async function fetchSitemapUrls(startUrl, fetcher, options = {}) {
  const { maxUrls = 500 } = options;
  let base;
  try {
    base = new URL(startUrl);
  } catch {
    return [];
  }
  const baseHost = base.hostname.toLowerCase();

  let content = null;
  for (const sPath of SITEMAP_PATHS) {
    const sitemapUrl = `${base.protocol}//${base.host}${sPath}`;
    const result = await fetcher.fetch(sitemapUrl);
    if (result && result.content && result.content.includes("<loc")) {
      content = result.content;
      break;
    }
  }
  if (!content) return [];

  const seen = new Set();
  await collectUrls(content, fetcher, { baseHost, maxUrls, depth: 0, seen });
  return [...seen];
}

async function collectUrls(xmlContent, fetcher, ctx) {
  const isIndex = /<sitemapindex/i.test(xmlContent);
  const locs = [...xmlContent.matchAll(LOC_RE)].map((m) => decodeXmlEntities(m[1].trim()));

  if (isIndex && ctx.depth === 0) {
    let fetched = 0;
    for (const childUrl of locs) {
      if (fetched >= MAX_NESTED_SITEMAPS) break;
      if (ctx.seen.size >= ctx.maxUrls) break;
      if (!sameHost(childUrl, ctx.baseHost)) continue;
      const result = await fetcher.fetch(childUrl);
      fetched++;
      if (!result || !result.content) continue;
      await collectUrls(result.content, fetcher, { ...ctx, depth: ctx.depth + 1 });
    }
  } else {
    for (const url of locs) {
      if (ctx.seen.size >= ctx.maxUrls) break;
      if (!sameHost(url, ctx.baseHost)) continue;
      ctx.seen.add(url);
    }
  }
}

function sameHost(url, baseHost) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname.toLowerCase() === baseHost;
  } catch {
    return false;
  }
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

module.exports = { fetchSitemapUrls };
