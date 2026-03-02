/**
 * Button analyzer — detects non-functional buttons and links.
 */

const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

const JAVASCRIPT_VOID_PATTERNS = [
  "javascript:void(0)",
  "javascript:void(0);",
  "javascript:;",
  "javascript:",
];

const ACCESSIBILITY_WIDGET_LABELS = new Set([
  "invert colors", "monochrome", "dark contrast", "light contrast",
  "low saturation", "high saturation", "highlight links", "highlight headings",
  "screen reader", "read mode", "reset", "big cursor", "reading guide",
  "text spacing", "pause animations", "dyslexia friendly", "larger text",
  "smaller text", "increase text", "decrease text", "readable font",
  "accessibility", "contrast", "font size", "line height",
]);

const A11Y_WIDGET_CLASS_PATTERNS = [
  "accessibility", "a11y", "userway", "accessibe", "equalweb",
  "audioeye", "texthelp", "recite", "ada-", "wcag",
  "djacc", "djaccess",
];

function isAccessibilityWidgetButton(button) {
  if (button.text) {
    const textLower = button.text.toLowerCase().trim();
    if (ACCESSIBILITY_WIDGET_LABELS.has(textLower)) return true;
  }

  if (button.classes) {
    for (const cls of button.classes) {
      const lower = cls.toLowerCase();
      if (A11Y_WIDGET_CLASS_PATTERNS.some((p) => lower.includes(p))) return true;
    }
  }

  if (button.parentClasses) {
    for (const cls of button.parentClasses) {
      const lower = cls.toLowerCase();
      if (A11Y_WIDGET_CLASS_PATTERNS.some((p) => lower.includes(p))) return true;
    }
  }

  const selectorLower = (button.selector || "").toLowerCase();
  if (A11Y_WIDGET_CLASS_PATTERNS.some((p) => selectorLower.includes(p))) return true;

  return false;
}

function checkHref(pageUrl, href, selector, text, isNavLink = false) {
  if (href === null || href === undefined) return null;

  const hrefLower = href.toLowerCase().trim();

  if (href === "" || hrefLower === "") {
    return new Issue({
      issueType: IssueType.EMPTY_HREF,
      pageUrl,
      elementSelector: selector,
      elementText: text,
      targetUrl: href,
      message: "This link has no destination - clicking it does nothing",
      suggestion: "Add a URL for this link to go to",
    });
  }

  for (const pattern of JAVASCRIPT_VOID_PATTERNS) {
    if (hrefLower === pattern || hrefLower.startsWith(pattern)) {
      return new Issue({
        issueType: IssueType.JAVASCRIPT_VOID,
        pageUrl,
        elementSelector: selector,
        elementText: text,
        targetUrl: href,
        message: "This button/link may not work - it uses placeholder code",
        suggestion: "Add proper functionality or link destination",
      });
    }
  }

  if (href === "#" && !isNavLink) {
    return new Issue({
      issueType: IssueType.ANCHOR_ONLY,
      pageUrl,
      elementSelector: selector,
      elementText: text,
      targetUrl: href,
      message: "This link only has '#' - clicking scrolls to top instead of going somewhere",
      suggestion: "Add a destination URL or remove if not needed",
    });
  }

  return null;
}

class ButtonAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { links = [], buttons = [] } = {}) {
    const issues = [];

    // Check links
    for (const link of links) {
      const issue = checkHref(pageUrl, link.href, link.selector, link.text, link.isNavLink);
      if (issue) issues.push(issue);
    }

    // Check buttons
    for (const button of buttons) {
      if (isAccessibilityWidgetButton(button)) continue;

      if (button.href !== null && button.href !== undefined) {
        const issue = checkHref(pageUrl, button.href, button.selector, button.text);
        if (issue) issues.push(issue);
      }

      if (button.tag === "button" && button.buttonType === null) {
        issues.push(new Issue({
          issueType: IssueType.BUTTON_NO_TYPE,
          pageUrl,
          elementSelector: button.selector,
          elementText: button.text,
          message: "Button has no type attribute - defaults to 'submit' which may cause unexpected form submission",
          suggestion: "Add type='button' or type='submit' explicitly",
        }));
      }

      if (!button.text && !button.ariaLabel) {
        issues.push(new Issue({
          issueType: IssueType.BUTTON_NO_ACCESSIBLE_NAME,
          pageUrl,
          elementSelector: button.selector,
          message: "Button has no accessible name for screen readers",
          suggestion: "Add text content or aria-label attribute",
        }));
      }

      if (button.buttonType === "submit" && !button.isInForm) {
        issues.push(new Issue({
          issueType: IssueType.BUTTON_OUTSIDE_FORM,
          pageUrl,
          elementSelector: button.selector,
          elementText: button.text,
          message: "Submit button is not inside a form element",
          suggestion: "Place button inside a form or use type='button'",
        }));
      }
    }

    return issues;
  }
}

module.exports = { ButtonAnalyzer };
