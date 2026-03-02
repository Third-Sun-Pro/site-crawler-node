import { describe, it, expect } from "vitest";
import { HTMLParser } from "../crawler/parser.js";

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Test Page</title></head>
<body>
  <nav>
    <a href="/about" class="nav-link">About</a>
    <a href="#" data-bs-toggle="dropdown">Menu</a>
  </nav>
  <main>
    <h1>Hello World</h1>
    <p>This is a paragraph with some text content for testing purposes.</p>
    <a href="https://example.com">Example Link</a>
    <a href="">Empty Link</a>
    <button type="submit">Submit</button>
    <button>No Type</button>
    <a href="#" role="button" class="btn btn-primary">CTA Button</a>
    <form action="/submit" method="POST">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required>
      <input type="text" name="name" placeholder="Name">
      <button type="submit">Send</button>
    </form>
    <img src="/photo.jpg" alt="A photo">
    <img src="/logo.png">
  </main>
</body>
</html>`;

describe("HTMLParser", () => {
  const parser = new HTMLParser(SAMPLE_HTML, "https://test.com");

  it("extracts links", () => {
    const links = parser.extractLinks();
    expect(links.length).toBeGreaterThanOrEqual(4);
    const aboutLink = links.find((l) => l.href === "/about");
    expect(aboutLink).toBeDefined();
    expect(aboutLink.isNavLink).toBe(true);
  });

  it("extracts buttons", () => {
    const buttons = parser.extractButtons();
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    const submit = buttons.find((b) => b.tag === "button" && b.buttonType === "submit");
    expect(submit).toBeDefined();
    const noType = buttons.find((b) => b.tag === "button" && b.buttonType === null);
    expect(noType).toBeDefined();
    const cta = buttons.find((b) => b.tag === "a" && b.classes.includes("btn"));
    expect(cta).toBeDefined();
  });

  it("extracts forms with fields", () => {
    const forms = parser.extractForms();
    expect(forms).toHaveLength(1);
    const form = forms[0];
    expect(form.action).toBe("/submit");
    expect(form.method).toBe("POST");
    expect(form.hasSubmit).toBe(true);
    expect(form.fields.length).toBeGreaterThanOrEqual(2);

    const emailField = form.fields.find((f) => f.name === "email");
    expect(emailField.required).toBe(true);
    expect(emailField.hasLabel).toBe(true);
    expect(emailField.hasValidation).toBe(true);
  });

  it("extracts text blocks", () => {
    const blocks = parser.extractTextBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    const para = blocks.find((b) => b.text.includes("paragraph"));
    expect(para).toBeDefined();
  });

  it("extracts images", () => {
    const images = parser.extractImages();
    expect(images).toHaveLength(2);
    const photo = images.find((i) => i.src === "/photo.jpg");
    expect(photo.alt).toBe("A photo");
    const logo = images.find((i) => i.src === "/logo.png");
    expect(logo.alt).toBeNull();
  });

  it("gets page title", () => {
    expect(parser.getPageTitle()).toBe("Test Page");
  });
});
