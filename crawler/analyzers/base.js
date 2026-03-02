/**
 * Base analyzer class.
 */

class BaseAnalyzer {
  async analyze(pageUrl, _opts) {
    throw new Error("analyze() must be implemented by subclass");
  }

  async setup() {}
  async teardown() {}
}

module.exports = { BaseAnalyzer };
