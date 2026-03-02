/**
 * Dynamic analyzer — STUB.
 *
 * The Python version uses Playwright for browser-based testing.
 * Playwright requires Chromium binaries which cannot be installed on
 * Hostinger shared hosting. Dynamic testing is disabled by default
 * in the webapp (skip_dynamic = true).
 */

const { BaseAnalyzer } = require("./base");

class DynamicAnalyzer extends BaseAnalyzer {
  constructor() {
    super();
    this.isAvailable = false;
  }

  async setup() {
    console.log("[DynamicAnalyzer] Stub — browser testing not available on this platform");
  }

  async analyze() {
    return [];
  }
}

module.exports = { DynamicAnalyzer };
