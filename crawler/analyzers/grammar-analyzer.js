/**
 * Grammar analyzer — STUB.
 *
 * The Python version uses language-tool-python which runs a local Java server.
 * This cannot run on Hostinger shared hosting. Grammar checking is disabled
 * by default in the webapp (skip_grammar = true).
 */

const { BaseAnalyzer } = require("./base");

class GrammarAnalyzer extends BaseAnalyzer {
  constructor() {
    super();
    this.isAvailable = false;
  }

  async setup() {
    console.log("[GrammarAnalyzer] Stub — grammar checking not available on this platform");
  }

  async analyze() {
    return [];
  }
}

module.exports = { GrammarAnalyzer };
