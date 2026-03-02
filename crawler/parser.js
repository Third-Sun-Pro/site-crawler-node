/**
 * HTML parser for extracting links, buttons, forms, text, and images.
 */

const cheerio = require("cheerio");

// Tags to skip when extracting text
const SKIP_TAGS = new Set(["script", "style", "noscript", "code", "pre", "textarea"]);

// Navigation-related classes
const NAV_CLASSES = new Set([
  "nav-link", "nav-item", "menu-item", "dropdown-toggle",
  "dropdown-item", "navbar-link", "menu-link",
]);
const NAV_PARENT_CLASSES = new Set([
  "nav", "navbar", "menu", "navigation", "main-menu",
  "primary-menu", "site-menu", "dropdown-menu",
]);

function getSelector($, el) {
  const tag = el.tagName || el.name;
  if (!tag) return "";

  const id = $(el).attr("id");
  if (id) return `${tag}#${id}`;

  const classes = ($(el).attr("class") || "").split(/\s+/).filter(Boolean);
  if (classes.length > 0) {
    return `${tag}.${classes.slice(0, 2).join(".")}`;
  }

  return tag;
}

function isNavigationLink($, el) {
  // Check if inside <nav>
  if ($(el).closest("nav").length > 0) return true;

  // Check element classes
  const classes = ($(el).attr("class") || "").toLowerCase();
  for (const nc of NAV_CLASSES) {
    if (classes.includes(nc)) return true;
  }

  // Check for dropdown toggle attributes
  if ($(el).attr("data-toggle") || $(el).attr("data-bs-toggle")) return true;

  // Check parent elements
  let parent = $(el).parent();
  while (parent.length > 0 && parent[0].tagName !== "html") {
    const pClasses = (parent.attr("class") || "").toLowerCase();
    for (const nc of NAV_PARENT_CLASSES) {
      if (pClasses.includes(nc)) return true;
    }
    const pId = (parent.attr("id") || "").toLowerCase();
    if (pId.includes("nav") || pId.includes("menu")) return true;
    parent = parent.parent();
  }

  return false;
}

function getParentClasses($, el) {
  const classes = [];
  let parent = $(el).parent();
  while (parent.length > 0 && parent[0].tagName !== "html") {
    const pClasses = (parent.attr("class") || "").split(/\s+/).filter(Boolean);
    classes.push(...pClasses);
    parent = parent.parent();
  }
  return classes;
}

class HTMLParser {
  constructor(html, baseUrl) {
    this.$ = cheerio.load(html);
    this.baseUrl = baseUrl;
  }

  extractLinks() {
    const $ = this.$;
    const links = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().slice(0, 100);
      const selector = getSelector($, el);
      const isNav = isNavigationLink($, el);

      links.push({ href, text, selector, tag: "a", isNavLink: isNav });
    });

    return links;
  }

  extractButtons() {
    const $ = this.$;
    const buttons = [];

    // <button> elements
    $("button").each((_, el) => {
      buttons.push({
        href: $(el).attr("href") || null,
        text: $(el).text().trim().slice(0, 100),
        selector: getSelector($, el),
        tag: "button",
        onclick: $(el).attr("onclick") || null,
        buttonType: $(el).attr("type") || null,
        isInForm: $(el).closest("form").length > 0,
        ariaLabel: $(el).attr("aria-label") || null,
        disabled: $(el).attr("disabled") !== undefined,
        classes: ($(el).attr("class") || "").split(/\s+/).filter(Boolean),
        parentClasses: getParentClasses($, el),
      });
    });

    // <a> elements that look like buttons
    $("a").each((_, el) => {
      const classes = ($(el).attr("class") || "").split(/\s+/).filter(Boolean);
      const role = $(el).attr("role") || "";
      const isButtonLike =
        role === "button" ||
        classes.some((c) => c.toLowerCase().includes("btn")) ||
        classes.some((c) => c.toLowerCase().includes("button"));

      if (isButtonLike) {
        buttons.push({
          href: $(el).attr("href") || "",
          text: $(el).text().trim().slice(0, 100),
          selector: getSelector($, el),
          tag: "a",
          onclick: $(el).attr("onclick") || null,
          buttonType: null,
          isInForm: $(el).closest("form").length > 0,
          ariaLabel: $(el).attr("aria-label") || null,
          disabled: false,
          classes,
          parentClasses: getParentClasses($, el),
        });
      }
    });

    // input[type=submit] and input[type=button]
    $('input[type="submit"], input[type="button"]').each((_, el) => {
      buttons.push({
        href: null,
        text: ($(el).attr("value") || $(el).attr("aria-label") || "").slice(0, 100),
        selector: getSelector($, el),
        tag: "input",
        onclick: $(el).attr("onclick") || null,
        buttonType: $(el).attr("type") || null,
        isInForm: $(el).closest("form").length > 0,
        ariaLabel: $(el).attr("aria-label") || null,
        disabled: $(el).attr("disabled") !== undefined,
        classes: ($(el).attr("class") || "").split(/\s+/).filter(Boolean),
        parentClasses: getParentClasses($, el),
      });
    });

    return buttons;
  }

  extractForms() {
    const $ = this.$;
    const forms = [];

    $("form").each((_, formEl) => {
      const action = $(formEl).attr("action") || null;
      const method = ($(formEl).attr("method") || "GET").toUpperCase();
      const selector = getSelector($, formEl);
      const formId = $(formEl).attr("id") || null;
      const formName = $(formEl).attr("name") || null;
      const enctype = $(formEl).attr("enctype") || null;

      // Check for submit button
      const hasSubmit = !!(
        $(formEl).find('input[type="submit"]').length ||
        $(formEl).find('button[type="submit"]').length ||
        $(formEl).find("button:not([type])").length
      );

      // Extract fields
      const fields = [];
      $(formEl).find("input, textarea, select").each((_, inp) => {
        const tagName = inp.tagName || inp.name;
        const fieldType =
          tagName === "input" ? $(inp).attr("type") || "text" : tagName;

        if (["hidden", "submit", "button"].includes(fieldType)) return;

        const fieldId = $(inp).attr("id");
        const hasLabel = !!(
          $(inp).attr("aria-label") ||
          $(inp).attr("aria-labelledby") ||
          (fieldId && $(formEl).find(`label[for="${fieldId}"]`).length)
        );

        const hasValidation = !!(
          $(inp).attr("pattern") ||
          ["email", "url", "tel", "number", "date"].includes(fieldType)
        );

        fields.push({
          name: $(inp).attr("name") || null,
          fieldType,
          selector: getSelector($, inp),
          required: $(inp).attr("required") !== undefined,
          hasLabel,
          hasValidation,
          placeholder: $(inp).attr("placeholder") || null,
          value: $(inp).attr("value") || null,
        });
      });

      forms.push({
        action,
        method,
        selector,
        id: formId,
        name: formName,
        hasSubmit,
        fields,
        enctype,
      });
    });

    return forms;
  }

  extractTextBlocks() {
    const $ = this.$;
    const blocks = [];
    const contentTags = [
      "p", "h1", "h2", "h3", "h4", "h5", "h6",
      "li", "td", "th", "span", "div",
    ];

    for (const tag of contentTags) {
      $(tag).each((_, el) => {
        // Skip if inside a skip tag
        if ($(el).closest([...SKIP_TAGS].join(",")).length > 0) return;

        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (text.length < 20) return;

        const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
        if (alphaCount / text.length < 0.5) return;

        blocks.push({
          text: text.slice(0, 1000),
          selector: getSelector($, el),
          tag,
        });
      });
    }

    return blocks;
  }

  extractImages() {
    const $ = this.$;
    const images = [];

    $("img").each((_, el) => {
      images.push({
        src: $(el).attr("src") || "",
        alt: $(el).attr("alt") === undefined ? null : $(el).attr("alt"),
        selector: getSelector($, el),
        title: $(el).attr("title") || null,
      });
    });

    return images;
  }

  getPageTitle() {
    return this.$("title").text().trim();
  }

  getMetaDescription() {
    const meta = this.$('meta[name="description"]');
    return meta.length ? meta.attr("content") || "" : "";
  }
}

module.exports = { HTMLParser };
