/**
 * Main crawler orchestrator.
 */

const { EventEmitter } = require("events");
const { URL } = require("url");
const { Fetcher, FetchStatus } = require("./fetcher");
const { HTMLParser } = require("./parser");
const { URLManager } = require("./url-manager");
const { LinkAnalyzer } = require("./analyzers/link-analyzer");
const { ButtonAnalyzer } = require("./analyzers/button-analyzer");
const { ImageAnalyzer } = require("./analyzers/image-analyzer");
const { AccessibilityAnalyzer } = require("./analyzers/accessibility-analyzer");
const { GrammarAnalyzer } = require("./analyzers/grammar-analyzer");
const { FormAnalyzer } = require("./analyzers/form-analyzer");
const { JoomlaAnalyzer } = require("./analyzers/joomla-analyzer");
const { PaymentAnalyzer } = require("./analyzers/payment-analyzer");
const { PerformanceAnalyzer } = require("./analyzers/performance-analyzer");
const { SchemaAnalyzer } = require("./analyzers/schema-analyzer");
const { SEOAnalyzer } = require("./analyzers/seo-analyzer");
const { fetchSitemapUrls } = require("./sitemap-fetcher");

class Crawler extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;

    // Core components
    this.urlManager = new URLManager(config.startUrl);
    this.fetcher = new Fetcher({
      timeout: config.timeout,
      rateLimit: config.rateLimit,
      maxRetries: config.maxRetries,
      userAgent: config.userAgent,
      followRedirects: config.followRedirects,
    });

    // Always-on analyzers
    this.linkAnalyzer = new LinkAnalyzer(this.fetcher, {
      skipExternal: config.skipExternal,
    });
    this.linkAnalyzer.setBaseDomain(new URL(config.startUrl).hostname);

    this.buttonAnalyzer = new ButtonAnalyzer();
    this.imageAnalyzer = new ImageAnalyzer();
    this.accessibilityAnalyzer = new AccessibilityAnalyzer();
    this.paymentAnalyzer = new PaymentAnalyzer();

    // Optional analyzers
    this.grammarAnalyzer = config.skipGrammar ? null : new GrammarAnalyzer();
    this.formAnalyzer = config.skipForms ? null : new FormAnalyzer();
    this.joomlaAnalyzer = config.skipJoomla ? null : new JoomlaAnalyzer();
    this.performanceAnalyzer = config.skipPerformance ? null : new PerformanceAnalyzer();
    this.schemaAnalyzer = config.skipSchema ? null : new SchemaAnalyzer();
    this.seoAnalyzer = config.skipSeo ? null : new SEOAnalyzer();

    // Stats
    this._pagesCrawled = 0;
    this._issuesFound = 0;
  }

  async crawl() {
    // Setup
    if (this.grammarAnalyzer) await this.grammarAnalyzer.setup();

    // Seed the URL queue from sitemap.xml so orphan pages get audited.
    // Best-effort: failures are logged but the crawl continues with link-following.
    if (!this.config.skipSitemap) {
      try {
        const sitemapUrls = await fetchSitemapUrls(this.config.startUrl, this.fetcher, {
          maxUrls: this.config.maxSitemapUrls,
        });
        let added = 0;
        for (const url of sitemapUrls) {
          if (this.urlManager.addUrl(url)) added++;
        }
        if (added > 0) {
          this.emit("progress", { pages: 0, issues: 0, url: `Sitemap: queued ${added} URL${added === 1 ? "" : "s"}` });
        }
      } catch (err) {
        // Silent — sitemap discovery is optional
      }
    }

    const allIssues = [];

    try {
      while (this._pagesCrawled < this.config.maxPages) {
        const url = this.urlManager.getNext();
        if (!url) break;

        const result = await this.fetcher.fetch(url);
        this.urlManager.markVisited(url);
        this._pagesCrawled++;

        this.emit("progress", {
          pages: this._pagesCrawled,
          issues: this._issuesFound,
          url,
        });

        if (result.status !== FetchStatus.SUCCESS || !result.content) {
          continue;
        }

        // Parse HTML
        const parser = new HTMLParser(result.content, url);
        const links = parser.extractLinks();
        const buttons = parser.extractButtons();
        const textBlocks = parser.extractTextBlocks();
        const forms = parser.extractForms();
        const images = parser.extractImages();

        // Queue internal links
        for (const link of links) {
          const fullUrl = this.urlManager.normalizeUrl(link.href, url);
          if (fullUrl && this.urlManager.isInternal(fullUrl)) {
            this.urlManager.addUrl(link.href, url);
          }
        }

        // Run analyzers
        const pageIssues = [];

        const linkIssues = await this.linkAnalyzer.analyze(url, { links });
        pageIssues.push(...linkIssues);

        const buttonIssues = await this.buttonAnalyzer.analyze(url, { links, buttons });
        pageIssues.push(...buttonIssues);

        const imageIssues = await this.imageAnalyzer.analyze(url, { images });
        pageIssues.push(...imageIssues);

        const a11yIssues = await this.accessibilityAnalyzer.analyze(url, {
          htmlContent: result.content,
        });
        pageIssues.push(...a11yIssues);

        if (this.grammarAnalyzer && this.grammarAnalyzer.isAvailable) {
          const grammarIssues = await this.grammarAnalyzer.analyze(url, { textBlocks });
          pageIssues.push(...grammarIssues);
        }

        if (this.formAnalyzer) {
          const formIssues = await this.formAnalyzer.analyze(url, { forms });
          pageIssues.push(...formIssues);
        }

        if (this.joomlaAnalyzer) {
          const joomlaIssues = await this.joomlaAnalyzer.analyze(url, {
            htmlContent: result.content,
            links,
            forms,
          });
          pageIssues.push(...joomlaIssues);
        }

        const paymentIssues = await this.paymentAnalyzer.analyze(url, {
          htmlContent: result.content,
        });
        pageIssues.push(...paymentIssues);

        if (this.performanceAnalyzer) {
          const perfIssues = await this.performanceAnalyzer.analyze(url, {
            htmlContent: result.content,
          });
          pageIssues.push(...perfIssues);
        }

        if (this.schemaAnalyzer) {
          const schemaIssues = await this.schemaAnalyzer.analyze(url, {
            htmlContent: result.content,
          });
          pageIssues.push(...schemaIssues);
        }

        if (this.seoAnalyzer) {
          const seoIssues = await this.seoAnalyzer.analyze(url, {
            htmlContent: result.content,
          });
          pageIssues.push(...seoIssues);
        }

        allIssues.push(...pageIssues);
        this._issuesFound += pageIssues.length;

        this.emit("progress", {
          pages: this._pagesCrawled,
          issues: this._issuesFound,
          url,
        });
      }
    } finally {
      if (this.grammarAnalyzer) await this.grammarAnalyzer.teardown();
    }

    return allIssues;
  }

  get pagesCrawled() {
    return this._pagesCrawled;
  }

  get issuesFound() {
    return this._issuesFound;
  }

  get linksChecked() {
    return this.linkAnalyzer.checkedCount;
  }
}

module.exports = { Crawler };
