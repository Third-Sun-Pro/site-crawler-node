/**
 * HTTP fetcher with rate limiting and retries.
 */

const FetchStatus = Object.freeze({
  SUCCESS: "success",
  TIMEOUT: "timeout",
  CONNECTION_ERROR: "connection_error",
  HTTP_ERROR: "http_error",
  INVALID_URL: "invalid_url",
});

class Fetcher {
  constructor({
    timeout = 30,
    rateLimit = 2.0,
    maxRetries = 3,
    userAgent = "JoomlaCrawler/1.0",
    followRedirects = true,
  } = {}) {
    this.timeout = timeout * 1000; // convert to ms
    this.delay = 1000 / rateLimit; // ms between requests
    this.maxRetries = maxRetries;
    this.userAgent = userAgent;
    this.followRedirects = followRedirects;
    this._lastRequestTime = 0;
  }

  async _rateLimit() {
    const now = Date.now();
    const wait = this.delay - (now - this._lastRequestTime);
    this._lastRequestTime = Math.max(now, this._lastRequestTime + this.delay);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  async fetch(url) {
    await this._rateLimit();

    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          headers: { "User-Agent": this.userAgent },
          redirect: this.followRedirects ? "follow" : "manual",
          signal: controller.signal,
        });
        clearTimeout(timer);

        const contentType = response.headers.get("content-type") || "";
        let content = null;
        if (contentType.includes("text/html")) {
          content = await response.text();
        }

        return {
          url,
          status: FetchStatus.SUCCESS,
          httpStatus: response.status,
          content,
          contentType,
          finalUrl: response.url,
        };
      } catch (err) {
        if (err.name === "AbortError") {
          lastError = "Request timed out";
        } else {
          lastError = err.message;
        }
        if (attempt < this.maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    // All retries exhausted
    if (lastError && lastError.toLowerCase().includes("timed out")) {
      return { url, status: FetchStatus.TIMEOUT, errorMessage: lastError };
    }
    return { url, status: FetchStatus.CONNECTION_ERROR, errorMessage: lastError };
  }

  async head(url) {
    await this._rateLimit();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": this.userAgent },
        redirect: this.followRedirects ? "follow" : "manual",
        signal: controller.signal,
      });
      clearTimeout(timer);

      return {
        url,
        status: FetchStatus.SUCCESS,
        httpStatus: response.status,
        finalUrl: response.url,
      };
    } catch (err) {
      if (err.name === "AbortError") {
        return { url, status: FetchStatus.TIMEOUT, errorMessage: "Request timed out" };
      }
      return { url, status: FetchStatus.CONNECTION_ERROR, errorMessage: err.message };
    }
  }
}

module.exports = { Fetcher, FetchStatus };
