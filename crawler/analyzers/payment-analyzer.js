/**
 * Payment analyzer — detects Stripe test mode keys in static HTML.
 */

const cheerio = require("cheerio");
const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

const STRIPE_TEST_KEY_RE = /pk_test_[a-zA-Z0-9]+/;

const DONATION_KEYWORDS = [
  "donate", "donation", "give", "giving", "contribute", "contribution",
  "support", "payment", "pay", "checkout", "gift", "fund", "fundrais",
];

class PaymentAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { htmlContent = "" } = {}) {
    if (!htmlContent) return [];
    const issues = [];

    const match = STRIPE_TEST_KEY_RE.exec(htmlContent);

    if (match) {
      const testKey = match[0];
      const lower = htmlContent.toLowerCase();
      const isDonationPage = DONATION_KEYWORDS.some((kw) => lower.includes(kw));

      if (isDonationPage) {
        issues.push(new Issue({
          issueType: IssueType.DONATION_FORM_TEST_MODE,
          pageUrl,
          message: `Donation/payment form is using Stripe TEST mode (key: ${testKey.slice(0, 20)}...)`,
          suggestion: "Switch to production Stripe keys (pk_live_*) before going live",
          context: "Stripe test keys found on donation page - payments will not process real transactions",
        }));
      } else {
        issues.push(new Issue({
          issueType: IssueType.STRIPE_TEST_MODE,
          pageUrl,
          message: `Stripe is in TEST mode (key: ${testKey.slice(0, 20)}...)`,
          suggestion: "Switch to production Stripe keys (pk_live_*) before going live",
          context: "Test keys will not process real payments",
        }));
      }
    }

    // Fallback: check for data attributes / classes
    if (!match) {
      const $ = cheerio.load(htmlContent);
      const testEls = $('[data-stripe-test], [class*="stripe-test"], [class*="test-mode"]');
      if (testEls.length > 0) {
        issues.push(new Issue({
          issueType: IssueType.STRIPE_TEST_MODE,
          pageUrl,
          message: "Stripe test mode indicator found in page elements",
          suggestion: "Verify Stripe is configured for production",
        }));
      }
    }

    return issues;
  }
}

module.exports = { PaymentAnalyzer };
