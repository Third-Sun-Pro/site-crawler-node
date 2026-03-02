/**
 * URL management — queue, deduplication, and normalization.
 */

const { URL } = require("url");

class URLManager {
  constructor(startUrl) {
    this.startUrl = startUrl;
    const parsed = new URL(startUrl);
    this.baseDomain = parsed.hostname;
    this.baseScheme = parsed.protocol.replace(":", "");

    this._visited = new Set();
    this._queued = new Set();
    this._queue = [];

    const normalized = this.normalizeUrl(startUrl);
    if (normalized) {
      this._queue.push(normalized);
      this._queued.add(normalized);
    }
  }

  normalizeUrl(url, baseUrl) {
    if (!url) return null;

    // Skip non-http(s) URLs
    if (/^(mailto:|tel:|javascript:|data:)/i.test(url)) return null;

    // Resolve relative URLs
    try {
      const base = baseUrl || this.startUrl;
      const resolved = new URL(url, base);

      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        return null;
      }

      // Normalize: remove fragment, sort query params
      resolved.hash = "";
      const params = new URLSearchParams(resolved.searchParams);
      const sortedParams = new URLSearchParams([...params.entries()].sort());
      resolved.search = sortedParams.toString() ? `?${sortedParams.toString()}` : "";

      // Normalize path: remove trailing slash (except root)
      if (resolved.pathname !== "/" && resolved.pathname.endsWith("/")) {
        resolved.pathname = resolved.pathname.slice(0, -1);
      }

      // Lowercase hostname
      resolved.hostname = resolved.hostname.toLowerCase();

      return resolved.toString();
    } catch {
      return null;
    }
  }

  isInternal(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase() === this.baseDomain.toLowerCase();
    } catch {
      return false;
    }
  }

  addUrl(url, baseUrl) {
    const normalized = this.normalizeUrl(url, baseUrl);
    if (!normalized) return false;
    if (this._visited.has(normalized) || this._queued.has(normalized)) return false;

    this._queue.push(normalized);
    this._queued.add(normalized);
    return true;
  }

  getNext() {
    while (this._queue.length > 0) {
      const url = this._queue.shift();
      if (!this._visited.has(url)) return url;
    }
    return null;
  }

  markVisited(url) {
    const normalized = this.normalizeUrl(url);
    if (normalized) this._visited.add(normalized);
  }

  get visitedCount() {
    return this._visited.size;
  }

  get queueSize() {
    return this._queue.length;
  }
}

module.exports = { URLManager };
