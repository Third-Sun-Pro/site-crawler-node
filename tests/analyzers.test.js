import { describe, it, expect } from "vitest";
import { IssueType } from "../crawler/models.js";
import { PaymentAnalyzer } from "../crawler/analyzers/payment-analyzer.js";
import { ImageAnalyzer } from "../crawler/analyzers/image-analyzer.js";
import { ButtonAnalyzer } from "../crawler/analyzers/button-analyzer.js";
import { FormAnalyzer } from "../crawler/analyzers/form-analyzer.js";
import { AccessibilityAnalyzer } from "../crawler/analyzers/accessibility-analyzer.js";
import { PerformanceAnalyzer } from "../crawler/analyzers/performance-analyzer.js";
import { JoomlaAnalyzer } from "../crawler/analyzers/joomla-analyzer.js";

const URL = "https://example.com/page";

describe("PaymentAnalyzer", () => {
  const analyzer = new PaymentAnalyzer();

  it("detects Stripe test key", async () => {
    const html = '<script>var stripe = Stripe("pk_test_abc123def456");</script>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe(IssueType.STRIPE_TEST_MODE);
  });

  it("detects donation form test mode", async () => {
    const html = '<div class="donate">Donate Now</div><script>Stripe("pk_test_abc123");</script>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe(IssueType.DONATION_FORM_TEST_MODE);
  });

  it("returns nothing for production keys", async () => {
    const html = '<script>var stripe = Stripe("pk_live_abc123def456");</script>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues).toHaveLength(0);
  });
});

describe("ImageAnalyzer", () => {
  const analyzer = new ImageAnalyzer();

  it("flags images with missing alt", async () => {
    const images = [
      { src: "/photo.jpg", alt: null, selector: "img", title: null },
      { src: "/ok.jpg", alt: "Good alt", selector: "img.ok", title: null },
      { src: "/empty.jpg", alt: "", selector: "img.empty", title: null },
    ];
    const issues = await analyzer.analyze(URL, { images });
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.issueType === IssueType.IMAGE_MISSING_ALT)).toBe(true);
  });
});

describe("ButtonAnalyzer", () => {
  const analyzer = new ButtonAnalyzer();

  it("flags empty href", async () => {
    const links = [{ href: "", text: "Click", selector: "a", isNavLink: false }];
    const issues = await analyzer.analyze(URL, { links });
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe(IssueType.EMPTY_HREF);
  });

  it("flags javascript:void", async () => {
    const links = [{ href: "javascript:void(0)", text: "Click", selector: "a", isNavLink: false }];
    const issues = await analyzer.analyze(URL, { links });
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe(IssueType.JAVASCRIPT_VOID);
  });

  it("skips nav link with href=#", async () => {
    const links = [{ href: "#", text: "Menu", selector: "a.nav-link", isNavLink: true }];
    const issues = await analyzer.analyze(URL, { links });
    expect(issues).toHaveLength(0);
  });

  it("flags anchor-only for non-nav links", async () => {
    const links = [{ href: "#", text: "Click", selector: "a", isNavLink: false }];
    const issues = await analyzer.analyze(URL, { links });
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe(IssueType.ANCHOR_ONLY);
  });

  it("flags button without type", async () => {
    const buttons = [{
      href: null, text: "Click", selector: "button", tag: "button",
      buttonType: null, isInForm: false, ariaLabel: null, disabled: false,
      classes: [], parentClasses: [],
    }];
    const issues = await analyzer.analyze(URL, { buttons });
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe(IssueType.BUTTON_NO_TYPE);
  });

  it("skips accessibility widget buttons", async () => {
    const buttons = [{
      href: null, text: "Invert Colors", selector: "button.a11y", tag: "button",
      buttonType: null, isInForm: false, ariaLabel: null, disabled: false,
      classes: ["accessibility"], parentClasses: [],
    }];
    const issues = await analyzer.analyze(URL, { buttons });
    expect(issues).toHaveLength(0);
  });
});

describe("FormAnalyzer", () => {
  const analyzer = new FormAnalyzer();

  it("flags form missing action", async () => {
    const forms = [{
      action: null, method: "POST", selector: "form", id: null,
      name: null, hasSubmit: true, fields: [], enctype: null,
    }];
    const issues = await analyzer.analyze(URL, { forms });
    expect(issues.some((i) => i.issueType === IssueType.FORM_MISSING_ACTION)).toBe(true);
  });

  it("flags form with no submit", async () => {
    const forms = [{
      action: "/submit", method: "POST", selector: "form", id: null,
      name: null, hasSubmit: false, fields: [], enctype: null,
    }];
    const issues = await analyzer.analyze(URL, { forms });
    expect(issues.some((i) => i.issueType === IssueType.FORM_NO_SUBMIT)).toBe(true);
  });

  it("flags field missing label", async () => {
    const forms = [{
      action: "/submit", method: "POST", selector: "form", id: null,
      name: null, hasSubmit: true, enctype: null,
      fields: [{
        name: "email", fieldType: "email", selector: "input",
        required: false, hasLabel: false, hasValidation: true,
      }],
    }];
    const issues = await analyzer.analyze(URL, { forms });
    expect(issues.some((i) => i.issueType === IssueType.FORM_MISSING_LABELS)).toBe(true);
  });
});

describe("AccessibilityAnalyzer", () => {
  const analyzer = new AccessibilityAnalyzer();

  it("flags missing lang attribute", async () => {
    const html = "<html><body>Hello</body></html>";
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.A11Y_MISSING_LANG)).toBe(true);
  });

  it("passes when lang is present", async () => {
    const html = '<html lang="en"><body><main></main><nav></nav><a href="#main">Skip</a></body></html>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.A11Y_MISSING_LANG)).toBe(false);
  });

  it("flags missing landmarks", async () => {
    const html = '<html lang="en"><body><div>Content</div></body></html>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.A11Y_MISSING_LANDMARKS)).toBe(true);
  });

  it("flags heading hierarchy skip", async () => {
    const html = '<html lang="en"><body><main><nav></nav><h1>Title</h1><h3>Skipped</h3></main></body></html>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.A11Y_HEADING_HIERARCHY)).toBe(true);
  });
});

describe("PerformanceAnalyzer", () => {
  const analyzer = new PerformanceAnalyzer();

  it("flags render-blocking script", async () => {
    const html = '<html><head><script src="/app.js"></script></head><body></body></html>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.PERF_RENDER_BLOCKING_SCRIPT)).toBe(true);
  });

  it("passes for async script", async () => {
    const html = '<html><head><script src="/app.js" async></script></head><body></body></html>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.PERF_RENDER_BLOCKING_SCRIPT)).toBe(false);
  });

  it("flags missing viewport", async () => {
    const html = "<html><head></head><body></body></html>";
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.PERF_MISSING_VIEWPORT)).toBe(true);
  });
});

describe("JoomlaAnalyzer", () => {
  const analyzer = new JoomlaAnalyzer();

  it("returns nothing for non-Joomla sites", async () => {
    const html = '<html><head></head><body><p>WordPress site</p></body></html>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues).toHaveLength(0);
  });

  it("detects Joomla version leak", async () => {
    const html = '<html><head><meta name="generator" content="Joomla! 4.3.2"></head><body></body></html>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.JOOMLA_VERSION_LEAK)).toBe(true);
  });

  it("detects Joomla error page", async () => {
    const html = '<html><head><meta name="generator" content="Joomla!"></head><body>0 - Component not found</body></html>';
    const issues = await analyzer.analyze(URL, { htmlContent: html });
    expect(issues.some((i) => i.issueType === IssueType.JOOMLA_ERROR_PAGE)).toBe(true);
  });
});
