/**
 * Image analyzer — detects missing alt text.
 */

const { URL } = require("url");
const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

class ImageAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { images = [] } = {}) {
    const issues = [];

    for (const image of images) {
      if (image.alt === null || (image.alt !== undefined && image.alt.trim() === "")) {
        let fullUrl = "";
        try {
          fullUrl = image.src ? new URL(image.src, pageUrl).toString() : "";
        } catch {
          fullUrl = image.src || "";
        }

        issues.push(new Issue({
          issueType: IssueType.IMAGE_MISSING_ALT,
          pageUrl,
          elementSelector: image.selector,
          elementText: image.title || "",
          targetUrl: fullUrl,
          message: "Image is missing alt text for accessibility",
          suggestion: "Add a descriptive alt attribute to the image for screen readers",
        }));
      }
    }

    return issues;
  }
}

module.exports = { ImageAnalyzer };
