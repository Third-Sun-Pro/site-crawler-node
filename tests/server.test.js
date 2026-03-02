import { describe, it, expect } from "vitest";
import request from "supertest";

process.env.APP_PASSWORD = "test-password";
process.env.NODE_ENV = "test";

const app = (await import("../server.js")).default;

async function getAuthCookie() {
  const res = await request(app)
    .post("/login")
    .send({ password: "test-password" });
  const setCookie = res.headers["set-cookie"];
  return setCookie[0].split(";")[0];
}

describe("Auth", () => {
  it("rejects invalid password", async () => {
    const res = await request(app)
      .post("/login")
      .send({ password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("accepts valid password and sets cookie", async () => {
    const res = await request(app)
      .post("/login")
      .send({ password: "test-password" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("auth-check returns false without cookie", async () => {
    const res = await request(app).get("/auth-check");
    expect(res.body.authenticated).toBe(false);
  });

  it("auth-check returns true with valid cookie", async () => {
    const cookie = await getAuthCookie();
    const res = await request(app)
      .get("/auth-check")
      .set("Cookie", cookie);
    expect(res.body.authenticated).toBe(true);
  });
});

describe("Routes", () => {
  it("serves index.html at /", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Site Crawler");
  });

  it("rejects crawl without auth", async () => {
    const res = await request(app)
      .post("/crawl")
      .send({ url: "https://example.com" });
    expect(res.status).toBe(401);
  });

  it("rejects crawl without URL", async () => {
    const cookie = await getAuthCookie();
    const res = await request(app)
      .post("/crawl")
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("starts crawl with valid request", async () => {
    const cookie = await getAuthCookie();
    const res = await request(app)
      .post("/crawl")
      .set("Cookie", cookie)
      .send({ url: "https://example.com", max_pages: 1 });
    expect(res.status).toBe(200);
    expect(res.body.crawl_id).toBeDefined();
    expect(res.body.crawl_id).toHaveLength(8);
  });

  it("returns 404 for unknown crawl stream", async () => {
    const cookie = await getAuthCookie();
    const res = await request(app)
      .get("/crawl/notexist/stream")
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown crawl csv", async () => {
    const cookie = await getAuthCookie();
    const res = await request(app)
      .get("/crawl/notexist/csv")
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});
