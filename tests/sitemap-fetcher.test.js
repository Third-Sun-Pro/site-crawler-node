import { describe, it, expect } from "vitest";
import { fetchSitemapUrls } from "../crawler/sitemap-fetcher.js";

// Minimal in-memory fetcher mock — registers responses by URL
class MockFetcher {
  constructor(responses) {
    this.responses = responses;
    this.requested = [];
  }
  async fetch(url) {
    this.requested.push(url);
    if (this.responses[url]) {
      return { url, content: this.responses[url], status: "success" };
    }
    return { url, content: "", status: "connection_error" };
  }
}

const URLSET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact?ref=foo&amp;src=bar</loc></url>
  <url><loc>https://other.com/external</loc></url>
</urlset>`;

const SITEMAP_INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
  <sitemap><loc>https://other.com/cross-domain.xml</loc></sitemap>
</sitemapindex>`;

const PAGES_XML = `<?xml version="1.0"?>
<urlset><url><loc>https://example.com/page-a</loc></url><url><loc>https://example.com/page-b</loc></url></urlset>`;

const POSTS_XML = `<?xml version="1.0"?>
<urlset><url><loc>https://example.com/post-1</loc></url></urlset>`;

describe("fetchSitemapUrls", () => {
  it("returns empty array when no sitemap exists", async () => {
    const fetcher = new MockFetcher({});
    const urls = await fetchSitemapUrls("https://example.com", fetcher);
    expect(urls).toEqual([]);
  });

  it("parses urlset and skips cross-domain URLs", async () => {
    const fetcher = new MockFetcher({ "https://example.com/sitemap.xml": URLSET_XML });
    const urls = await fetchSitemapUrls("https://example.com", fetcher);
    expect(urls).toContain("https://example.com/");
    expect(urls).toContain("https://example.com/about");
    expect(urls).toContain("https://example.com/contact?ref=foo&src=bar"); // entity-decoded
    expect(urls.find((u) => u.includes("other.com"))).toBeUndefined();
  });

  it("falls back to /sitemap_index.xml when /sitemap.xml is missing", async () => {
    const fetcher = new MockFetcher({ "https://example.com/sitemap_index.xml": URLSET_XML });
    const urls = await fetchSitemapUrls("https://example.com", fetcher);
    expect(urls.length).toBeGreaterThan(0);
  });

  it("recurses into a sitemap index, skips cross-domain children", async () => {
    const fetcher = new MockFetcher({
      "https://example.com/sitemap.xml": SITEMAP_INDEX_XML,
      "https://example.com/sitemap-pages.xml": PAGES_XML,
      "https://example.com/sitemap-posts.xml": POSTS_XML,
    });
    const urls = await fetchSitemapUrls("https://example.com", fetcher);
    expect(urls).toContain("https://example.com/page-a");
    expect(urls).toContain("https://example.com/page-b");
    expect(urls).toContain("https://example.com/post-1");
    expect(fetcher.requested).not.toContain("https://other.com/cross-domain.xml");
  });

  it("respects maxUrls cap", async () => {
    const fetcher = new MockFetcher({ "https://example.com/sitemap.xml": URLSET_XML });
    const urls = await fetchSitemapUrls("https://example.com", fetcher, { maxUrls: 2 });
    expect(urls).toHaveLength(2);
  });

  it("returns empty for malformed start URL", async () => {
    const fetcher = new MockFetcher({});
    const urls = await fetchSitemapUrls("not-a-url", fetcher);
    expect(urls).toEqual([]);
  });
});
