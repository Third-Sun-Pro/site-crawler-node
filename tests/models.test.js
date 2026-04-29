import { describe, it, expect } from "vitest";
import {
  Severity,
  IssueType,
  ISSUE_SEVERITY,
  ISSUE_TYPE_LABELS,
  Issue,
} from "../crawler/models.js";

describe("IssueType", () => {
  it("has 62 issue types", () => {
    expect(Object.keys(IssueType)).toHaveLength(62);
  });

  it("all issue types have severity mappings", () => {
    for (const type of Object.values(IssueType)) {
      expect(ISSUE_SEVERITY[type]).toBeDefined();
    }
  });

  it("all issue types have labels", () => {
    for (const type of Object.values(IssueType)) {
      expect(ISSUE_TYPE_LABELS[type]).toBeDefined();
    }
  });
});

describe("Issue", () => {
  it("creates an issue with defaults", () => {
    const issue = new Issue({
      issueType: IssueType.BROKEN_LINK,
      pageUrl: "https://example.com",
    });
    expect(issue.issueType).toBe("broken_link");
    expect(issue.pageUrl).toBe("https://example.com");
    expect(issue.severity).toBe(Severity.ERROR);
    expect(issue.id).toHaveLength(8);
  });

  it("toJSON produces expected shape", () => {
    const issue = new Issue({
      issueType: IssueType.IMAGE_MISSING_ALT,
      pageUrl: "https://example.com/page",
      message: "Missing alt text",
      suggestion: "Add alt text",
    });
    const json = issue.toJSON();
    expect(json.severity).toBe("warning");
    expect(json.issue_type).toBe("image_missing_alt");
    expect(json.issue_type_label).toBe("Image Missing Alt Text");
    expect(json.page_url).toBe("https://example.com/page");
  });

  it("toCSV produces expected columns", () => {
    const issue = new Issue({
      issueType: IssueType.BROKEN_LINK,
      pageUrl: "https://example.com",
      httpStatus: 404,
      message: "Not found",
    });
    const csv = issue.toCSV();
    expect(csv.ID).toHaveLength(8);
    expect(csv.Priority).toBe("Error");
    expect(csv["Issue Type"]).toBe("Broken Link");
    expect(csv.Problem).toBe("Server returned error 404");
  });
});
