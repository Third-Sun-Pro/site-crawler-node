import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import * as auditStore from "../crawler/audit-store.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-store-test-"));
  process.env.DATA_DIR = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function makeIssue(overrides = {}) {
  return {
    issue_type: "broken_link",
    page_url: "https://example.com/about",
    target_url: "https://example.com/missing",
    element_text: "Click here",
    severity: "error",
    message: "404 Not Found",
    ...overrides,
  };
}

describe("normalizeUrl", () => {
  it("lowercases host and strips www and trailing slash", () => {
    expect(auditStore.normalizeUrl("HTTPS://WWW.Example.COM/About/")).toBe("https://example.com/about");
  });
  it("drops query and fragment", () => {
    expect(auditStore.normalizeUrl("https://example.com/page?utm=x#hash")).toBe("https://example.com/page");
  });
  it("normalizes example.com and example.com/ to the same value", () => {
    expect(auditStore.normalizeUrl("https://example.com/")).toBe(auditStore.normalizeUrl("https://example.com"));
  });
});

describe("urlHash", () => {
  it("collides for equivalent URLs", () => {
    expect(auditStore.urlHash("https://example.com/")).toBe(auditStore.urlHash("https://EXAMPLE.com"));
  });
  it("differs for different paths", () => {
    expect(auditStore.urlHash("https://example.com/a")).not.toBe(auditStore.urlHash("https://example.com/b"));
  });
});

describe("fingerprintIssue", () => {
  it("is stable across runs with same identity", () => {
    const a = auditStore.fingerprintIssue(makeIssue());
    const b = auditStore.fingerprintIssue(makeIssue());
    expect(a).toBe(b);
  });
  it("ignores message changes", () => {
    const a = auditStore.fingerprintIssue(makeIssue({ message: "404 Not Found" }));
    const b = auditStore.fingerprintIssue(makeIssue({ message: "Server returned 404" }));
    expect(a).toBe(b);
  });
  it("differs when target_url differs", () => {
    const a = auditStore.fingerprintIssue(makeIssue({ target_url: "https://x.com/1" }));
    const b = auditStore.fingerprintIssue(makeIssue({ target_url: "https://x.com/2" }));
    expect(a).not.toBe(b);
  });
});

describe("saveAudit + getLastAudit + getHistory", () => {
  it("persists and retrieves the most recent audit", () => {
    auditStore.saveAudit("https://example.com", { totalPages: 10, issues: [makeIssue()] });
    const last = auditStore.getLastAudit("https://example.com");
    expect(last).toBeTruthy();
    expect(last.totalIssues).toBe(1);
    expect(last.fingerprints).toHaveLength(1);
  });

  it("orders history newest first", async () => {
    auditStore.saveAudit("https://example.com", { totalPages: 10, issues: [makeIssue()], completedAt: "2026-04-01T00:00:00Z" });
    auditStore.saveAudit("https://example.com", { totalPages: 10, issues: [makeIssue(), makeIssue({ target_url: "https://x.com/2" })], completedAt: "2026-04-15T00:00:00Z" });
    const last = auditStore.getLastAudit("https://example.com");
    expect(last.totalIssues).toBe(2);
    const history = auditStore.getHistory("https://example.com");
    expect(history).toHaveLength(2);
    expect(history[0].completedAt).toBe("2026-04-15T00:00:00Z");
  });

  it("caps history at HISTORY_LIMIT", () => {
    for (let i = 0; i < auditStore.HISTORY_LIMIT + 5; i++) {
      auditStore.saveAudit("https://example.com", { totalPages: i, issues: [], completedAt: `2026-04-${String(i + 1).padStart(2, "0")}T00:00:00Z` });
    }
    expect(auditStore.getHistory("https://example.com")).toHaveLength(auditStore.HISTORY_LIMIT);
  });

  it("getLastAudit returns null when no history exists", () => {
    expect(auditStore.getLastAudit("https://nothing.example.com")).toBeNull();
  });
});

describe("computeDiff", () => {
  it("returns null when there is no previous audit", () => {
    expect(auditStore.computeDiff([makeIssue()], null)).toBeNull();
  });

  it("classifies new, persisting, and resolved correctly", () => {
    const issueA = makeIssue({ target_url: "https://x.com/a" });
    const issueB = makeIssue({ target_url: "https://x.com/b" });
    const issueC = makeIssue({ target_url: "https://x.com/c" });

    auditStore.saveAudit("https://example.com", { totalPages: 5, issues: [issueA, issueB] });
    const previous = auditStore.getLastAudit("https://example.com");

    // Current run: A persists, B is gone (resolved), C is new
    const diff = auditStore.computeDiff([issueA, issueC], previous);
    expect(diff.persistingCount).toBe(1);
    expect(diff.resolvedCount).toBe(1);
    expect(diff.newCount).toBe(1);
    expect(diff.changeStatus).toEqual(["persisting", "new"]);
  });
});
