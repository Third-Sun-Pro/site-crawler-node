/**
 * Link analyzer — detects broken links via HEAD requests.
 */

const { URL } = require("url");
const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");
const { FetchStatus } = require("../fetcher");

class LinkAnalyzer extends BaseAnalyzer {
  constructor(fetcher, { skipExternal = false } = {}) {
    super();
    this.fetcher = fetcher;
    this.skipExternal = skipExternal;
    this._checkedUrls = new Set();
    this._baseDomain = "";
  }

  setBaseDomain(domain) {
    this._baseDomain = domain.toLowerCase();
  }

  _isExternal(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase() !== this._baseDomain;
    } catch {
      return true;
    }
  }

  _resultToIssue(result, pageUrl, link, fullUrl) {
    if (result.status === FetchStatus.TIMEOUT) {
      return new Issue({
        issueType: IssueType.TIMEOUT,
        pageUrl,
        elementSelector: link.selector,
        elementText: link.text,
        targetUrl: fullUrl,
        message: "This link took too long to respond",
        suggestion: "Check if the target website is working or remove the link",
      });
    }

    if (result.status === FetchStatus.CONNECTION_ERROR) {
      return new Issue({
        issueType: IssueType.CONNECTION_ERROR,
        pageUrl,
        elementSelector: link.selector,
        elementText: link.text,
        targetUrl: fullUrl,
        message: "Could not connect to this link",
        suggestion: "Verify the URL is correct or remove the link",
      });
    }

    if (result.status === FetchStatus.SUCCESS && result.httpStatus >= 400) {
      let msg, fix;
      if (result.httpStatus === 404) {
        msg = "Page not found - this link leads to a missing page";
        fix = "Update the link to a valid page or remove it";
      } else if (result.httpStatus === 403) {
        msg = "Access forbidden - visitors cannot view this page";
        fix = "Check page permissions or use a different link";
      } else if (result.httpStatus === 500) {
        msg = "Server error on the target page";
        fix = "The linked page has an error - contact the site owner";
      } else {
        msg = `Link returns an error (code ${result.httpStatus})`;
        fix = "Verify the link works or replace it";
      }

      return new Issue({
        issueType: IssueType.BROKEN_LINK,
        pageUrl,
        elementSelector: link.selector,
        elementText: link.text,
        targetUrl: fullUrl,
        httpStatus: result.httpStatus,
        message: msg,
        suggestion: fix,
      });
    }

    return null;
  }

  async analyze(pageUrl, { links = [] } = {}) {
    const toCheck = [];

    for (const link of links) {
      const href = link.href;
      if (!href || /^(#|javascript:|mailto:|tel:)/.test(href)) continue;

      let fullUrl;
      try {
        fullUrl = new URL(href, pageUrl).toString();
      } catch {
        continue;
      }

      if (this._checkedUrls.has(fullUrl)) continue;
      this._checkedUrls.add(fullUrl);

      if (this.skipExternal && this._isExternal(fullUrl)) continue;

      toCheck.push({ link, fullUrl });
    }

    if (!toCheck.length) return [];

    // Use dynamic import for p-limit (ESM module)
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(20);

    const results = await Promise.all(
      toCheck.map(({ link, fullUrl }) =>
        limit(async () => {
          const result = await this.fetcher.head(fullUrl);
          return this._resultToIssue(result, pageUrl, link, fullUrl);
        })
      )
    );

    return results.filter(Boolean);
  }

  get checkedCount() {
    return this._checkedUrls.size;
  }
}

module.exports = { LinkAnalyzer };
