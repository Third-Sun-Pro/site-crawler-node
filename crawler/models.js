/**
 * Data models for crawler issues.
 */

const crypto = require("crypto");

// Issue severity levels
const Severity = Object.freeze({
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
});

// All issue types the crawler can detect
const IssueType = Object.freeze({
  // Links
  BROKEN_LINK: "broken_link",
  TIMEOUT: "timeout",
  CONNECTION_ERROR: "connection_error",
  EMPTY_HREF: "empty_href",
  JAVASCRIPT_VOID: "javascript_void",
  ANCHOR_ONLY: "anchor_only",
  // Grammar
  GRAMMAR_ERROR: "grammar_error",
  SPELLING_ERROR: "spelling_error",
  // Form static analysis
  FORM_MISSING_ACTION: "form_missing_action",
  FORM_NO_SUBMIT: "form_no_submit",
  FORM_MISSING_LABELS: "form_missing_labels",
  FORM_REQUIRED_NO_VALIDATION: "form_required_no_validation",
  // Button static analysis
  BUTTON_NO_TYPE: "button_no_type",
  BUTTON_NO_ACCESSIBLE_NAME: "button_no_accessible_name",
  BUTTON_OUTSIDE_FORM: "button_outside_form",
  // Dynamic testing
  BUTTON_NO_EFFECT: "button_no_effect",
  BUTTON_JS_ERROR: "button_js_error",
  FORM_SUBMIT_ERROR: "form_submit_error",
  CONSOLE_ERROR: "console_error",
  // Form configuration
  FORM_MAILTO_ACTION: "form_mailto_action",
  // Payments
  STRIPE_TEST_MODE: "stripe_test_mode",
  DONATION_FORM_TEST_MODE: "donation_form_test_mode",
  // Accessibility
  IMAGE_MISSING_ALT: "image_missing_alt",
  A11Y_MISSING_LANG: "a11y_missing_lang",
  A11Y_MISSING_LANDMARKS: "a11y_missing_landmarks",
  A11Y_MISSING_SKIP_NAV: "a11y_missing_skip_nav",
  A11Y_EMPTY_LINK: "a11y_empty_link",
  A11Y_HEADING_HIERARCHY: "a11y_heading_hierarchy",
  // Joomla components
  JOOMLA_ERROR_PAGE: "joomla_error_page",
  JOOMLA_ADMIN_EXPOSED: "joomla_admin_exposed",
  JOOMLA_VERSION_LEAK: "joomla_version_leak",
  JOOMLA_MISSING_COMPONENT_ASSETS: "joomla_missing_component_assets",
  JOOMLA_EMPTY_EVENT_LIST: "joomla_empty_event_list",
  JOOMLA_BROKEN_REGISTRATION: "joomla_broken_registration",
  JOOMLA_EMPTY_CALENDAR: "joomla_empty_calendar",
  JOOMLA_CALENDAR_JS_MISSING: "joomla_calendar_js_missing",
  JOOMLA_FORM_RENDER_FAILURE: "joomla_form_render_failure",
  JOOMLA_SEO_MISCONFIGURED: "joomla_seo_misconfigured",
  JOOMLA_POPUP_ASSETS_MISSING: "joomla_popup_assets_missing",
  JOOMLA_EMPTY_GALLERY: "joomla_empty_gallery",
  JOOMLA_PAGEBUILDER_ASSETS_MISSING: "joomla_pagebuilder_assets_missing",
  JOOMLA_EMPTY_SECTION: "joomla_empty_section",
  JOOMLA_EDITOR_LINK_EXPOSED: "joomla_editor_link_exposed",
  // Performance
  PERF_RENDER_BLOCKING_SCRIPT: "perf_render_blocking_script",
  PERF_IMAGE_MISSING_DIMENSIONS: "perf_image_missing_dimensions",
  PERF_IMAGE_NO_LAZY_LOADING: "perf_image_no_lazy_loading",
  PERF_EXCESSIVE_RESOURCES: "perf_excessive_resources",
  PERF_MISSING_VIEWPORT: "perf_missing_viewport",
  PERF_INLINE_STYLE_BLOCK: "perf_inline_style_block",
  PERF_UNMINIFIED_ASSETS: "perf_unminified_assets",
  // Schema / structured data
  SCHEMA_MISSING: "schema_missing",
  SCHEMA_INVALID_JSON_LD: "schema_invalid_json_ld",
  SCHEMA_INCOMPLETE: "schema_incomplete",
  SCHEMA_FOUND: "schema_found",
  // SEO
  SEO_MISSING_TITLE: "seo_missing_title",
  SEO_SHORT_TITLE: "seo_short_title",
  SEO_LONG_TITLE: "seo_long_title",
  SEO_MISSING_META_DESC: "seo_missing_meta_desc",
  SEO_SHORT_META_DESC: "seo_short_meta_desc",
  SEO_LONG_META_DESC: "seo_long_meta_desc",
  SEO_MISSING_CANONICAL: "seo_missing_canonical",
  SEO_AI_CRAWLER_BLOCKED: "seo_ai_crawler_blocked",
});

// Mapping of issue types to severities
const ISSUE_SEVERITY = {
  [IssueType.BROKEN_LINK]: Severity.ERROR,
  [IssueType.TIMEOUT]: Severity.ERROR,
  [IssueType.CONNECTION_ERROR]: Severity.ERROR,
  [IssueType.EMPTY_HREF]: Severity.WARNING,
  [IssueType.JAVASCRIPT_VOID]: Severity.WARNING,
  [IssueType.ANCHOR_ONLY]: Severity.WARNING,
  [IssueType.GRAMMAR_ERROR]: Severity.WARNING,
  [IssueType.SPELLING_ERROR]: Severity.INFO,
  [IssueType.FORM_MISSING_ACTION]: Severity.WARNING,
  [IssueType.FORM_NO_SUBMIT]: Severity.WARNING,
  [IssueType.FORM_MISSING_LABELS]: Severity.WARNING,
  [IssueType.FORM_REQUIRED_NO_VALIDATION]: Severity.INFO,
  [IssueType.BUTTON_NO_TYPE]: Severity.INFO,
  [IssueType.BUTTON_NO_ACCESSIBLE_NAME]: Severity.WARNING,
  [IssueType.BUTTON_OUTSIDE_FORM]: Severity.INFO,
  [IssueType.BUTTON_NO_EFFECT]: Severity.WARNING,
  [IssueType.BUTTON_JS_ERROR]: Severity.ERROR,
  [IssueType.FORM_SUBMIT_ERROR]: Severity.ERROR,
  [IssueType.CONSOLE_ERROR]: Severity.WARNING,
  [IssueType.FORM_MAILTO_ACTION]: Severity.WARNING,
  [IssueType.STRIPE_TEST_MODE]: Severity.ERROR,
  [IssueType.DONATION_FORM_TEST_MODE]: Severity.ERROR,
  [IssueType.IMAGE_MISSING_ALT]: Severity.WARNING,
  [IssueType.A11Y_MISSING_LANG]: Severity.ERROR,
  [IssueType.A11Y_MISSING_LANDMARKS]: Severity.WARNING,
  [IssueType.A11Y_MISSING_SKIP_NAV]: Severity.INFO,
  [IssueType.A11Y_EMPTY_LINK]: Severity.WARNING,
  [IssueType.A11Y_HEADING_HIERARCHY]: Severity.WARNING,
  [IssueType.JOOMLA_ERROR_PAGE]: Severity.ERROR,
  [IssueType.JOOMLA_ADMIN_EXPOSED]: Severity.WARNING,
  [IssueType.JOOMLA_VERSION_LEAK]: Severity.INFO,
  [IssueType.JOOMLA_MISSING_COMPONENT_ASSETS]: Severity.WARNING,
  [IssueType.JOOMLA_EMPTY_EVENT_LIST]: Severity.WARNING,
  [IssueType.JOOMLA_BROKEN_REGISTRATION]: Severity.ERROR,
  [IssueType.JOOMLA_EMPTY_CALENDAR]: Severity.WARNING,
  [IssueType.JOOMLA_CALENDAR_JS_MISSING]: Severity.ERROR,
  [IssueType.JOOMLA_FORM_RENDER_FAILURE]: Severity.ERROR,
  [IssueType.JOOMLA_SEO_MISCONFIGURED]: Severity.WARNING,
  [IssueType.JOOMLA_POPUP_ASSETS_MISSING]: Severity.WARNING,
  [IssueType.JOOMLA_EMPTY_GALLERY]: Severity.WARNING,
  [IssueType.JOOMLA_PAGEBUILDER_ASSETS_MISSING]: Severity.ERROR,
  [IssueType.JOOMLA_EMPTY_SECTION]: Severity.INFO,
  [IssueType.JOOMLA_EDITOR_LINK_EXPOSED]: Severity.WARNING,
  [IssueType.PERF_RENDER_BLOCKING_SCRIPT]: Severity.WARNING,
  [IssueType.PERF_IMAGE_MISSING_DIMENSIONS]: Severity.WARNING,
  [IssueType.PERF_IMAGE_NO_LAZY_LOADING]: Severity.INFO,
  [IssueType.PERF_EXCESSIVE_RESOURCES]: Severity.WARNING,
  [IssueType.PERF_MISSING_VIEWPORT]: Severity.WARNING,
  [IssueType.PERF_INLINE_STYLE_BLOCK]: Severity.INFO,
  [IssueType.PERF_UNMINIFIED_ASSETS]: Severity.INFO,
  [IssueType.SCHEMA_MISSING]: Severity.WARNING,
  [IssueType.SCHEMA_INVALID_JSON_LD]: Severity.ERROR,
  [IssueType.SCHEMA_INCOMPLETE]: Severity.WARNING,
  [IssueType.SCHEMA_FOUND]: Severity.INFO,
  [IssueType.SEO_MISSING_TITLE]: Severity.ERROR,
  [IssueType.SEO_SHORT_TITLE]: Severity.WARNING,
  [IssueType.SEO_LONG_TITLE]: Severity.WARNING,
  [IssueType.SEO_MISSING_META_DESC]: Severity.WARNING,
  [IssueType.SEO_SHORT_META_DESC]: Severity.INFO,
  [IssueType.SEO_LONG_META_DESC]: Severity.INFO,
  [IssueType.SEO_MISSING_CANONICAL]: Severity.INFO,
  [IssueType.SEO_AI_CRAWLER_BLOCKED]: Severity.ERROR,
};

// Human-readable labels
const ISSUE_TYPE_LABELS = {
  [IssueType.BROKEN_LINK]: "Broken Link",
  [IssueType.TIMEOUT]: "Page Timeout",
  [IssueType.CONNECTION_ERROR]: "Connection Failed",
  [IssueType.EMPTY_HREF]: "Empty Link",
  [IssueType.JAVASCRIPT_VOID]: "Non-Functional Button",
  [IssueType.ANCHOR_ONLY]: "Placeholder Link",
  [IssueType.GRAMMAR_ERROR]: "Grammar Error",
  [IssueType.SPELLING_ERROR]: "Spelling Error",
  [IssueType.FORM_MISSING_ACTION]: "Form Missing Action",
  [IssueType.FORM_NO_SUBMIT]: "Form No Submit Button",
  [IssueType.FORM_MISSING_LABELS]: "Form Field Missing Label",
  [IssueType.FORM_REQUIRED_NO_VALIDATION]: "Required Field No Validation",
  [IssueType.BUTTON_NO_TYPE]: "Button Missing Type",
  [IssueType.BUTTON_NO_ACCESSIBLE_NAME]: "Button No Accessible Name",
  [IssueType.BUTTON_OUTSIDE_FORM]: "Submit Button Outside Form",
  [IssueType.BUTTON_NO_EFFECT]: "Button No Effect",
  [IssueType.BUTTON_JS_ERROR]: "Button JavaScript Error",
  [IssueType.FORM_SUBMIT_ERROR]: "Form Submit Error",
  [IssueType.CONSOLE_ERROR]: "Console Error",
  [IssueType.FORM_MAILTO_ACTION]: "Form Sends to Email",
  [IssueType.STRIPE_TEST_MODE]: "Stripe Test Mode Active",
  [IssueType.DONATION_FORM_TEST_MODE]: "Donation Form in Test Mode",
  [IssueType.IMAGE_MISSING_ALT]: "Image Missing Alt Text",
  [IssueType.A11Y_MISSING_LANG]: "Missing Language Attribute",
  [IssueType.A11Y_MISSING_LANDMARKS]: "Missing ARIA Landmarks",
  [IssueType.A11Y_MISSING_SKIP_NAV]: "Missing Skip Navigation",
  [IssueType.A11Y_EMPTY_LINK]: "Empty Link (No Accessible Text)",
  [IssueType.A11Y_HEADING_HIERARCHY]: "Heading Level Skipped",
  [IssueType.JOOMLA_ERROR_PAGE]: "Joomla Error Page",
  [IssueType.JOOMLA_ADMIN_EXPOSED]: "Admin Page Exposed",
  [IssueType.JOOMLA_VERSION_LEAK]: "Joomla Version Exposed",
  [IssueType.JOOMLA_MISSING_COMPONENT_ASSETS]: "Component Assets Missing",
  [IssueType.JOOMLA_EMPTY_EVENT_LIST]: "Empty Event List",
  [IssueType.JOOMLA_BROKEN_REGISTRATION]: "Broken Registration Form",
  [IssueType.JOOMLA_EMPTY_CALENDAR]: "Empty Calendar",
  [IssueType.JOOMLA_CALENDAR_JS_MISSING]: "Calendar JavaScript Missing",
  [IssueType.JOOMLA_FORM_RENDER_FAILURE]: "Form Failed to Render",
  [IssueType.JOOMLA_SEO_MISCONFIGURED]: "SEO Component Misconfigured",
  [IssueType.JOOMLA_POPUP_ASSETS_MISSING]: "Popup Assets Missing",
  [IssueType.JOOMLA_EMPTY_GALLERY]: "Empty Image Gallery",
  [IssueType.JOOMLA_PAGEBUILDER_ASSETS_MISSING]: "Page Builder Assets Missing",
  [IssueType.JOOMLA_EMPTY_SECTION]: "Empty Page Section",
  [IssueType.JOOMLA_EDITOR_LINK_EXPOSED]: "Editor Link Exposed",
  [IssueType.PERF_RENDER_BLOCKING_SCRIPT]: "Render-Blocking Script",
  [IssueType.PERF_IMAGE_MISSING_DIMENSIONS]: "Image Missing Dimensions",
  [IssueType.PERF_IMAGE_NO_LAZY_LOADING]: "Image No Lazy Loading",
  [IssueType.PERF_EXCESSIVE_RESOURCES]: "Excessive Resources",
  [IssueType.PERF_MISSING_VIEWPORT]: "Missing Viewport Meta",
  [IssueType.PERF_INLINE_STYLE_BLOCK]: "Large Inline Style Block",
  [IssueType.PERF_UNMINIFIED_ASSETS]: "Unminified Asset",
  [IssueType.SCHEMA_MISSING]: "Schema Markup Missing",
  [IssueType.SCHEMA_INVALID_JSON_LD]: "Invalid JSON-LD",
  [IssueType.SCHEMA_INCOMPLETE]: "Schema Missing Required Fields",
  [IssueType.SCHEMA_FOUND]: "Schema Types Detected",
  [IssueType.SEO_MISSING_TITLE]: "Missing Title Tag",
  [IssueType.SEO_SHORT_TITLE]: "Title Too Short",
  [IssueType.SEO_LONG_TITLE]: "Title Too Long",
  [IssueType.SEO_MISSING_META_DESC]: "Missing Meta Description",
  [IssueType.SEO_SHORT_META_DESC]: "Meta Description Too Short",
  [IssueType.SEO_LONG_META_DESC]: "Meta Description Too Long",
  [IssueType.SEO_MISSING_CANONICAL]: "Missing Canonical URL",
  [IssueType.SEO_AI_CRAWLER_BLOCKED]: "AI Crawler Blocked",
};

const SEVERITY_LABELS = {
  [Severity.ERROR]: "Error",
  [Severity.WARNING]: "Warning",
  [Severity.INFO]: "Info",
};

/**
 * Represents a single issue found during crawling.
 */
class Issue {
  constructor({
    issueType,
    pageUrl,
    elementSelector = "",
    elementText = "",
    targetUrl = "",
    httpStatus = null,
    message = "",
    context = "",
    suggestion = "",
  }) {
    this.issueType = issueType;
    this.pageUrl = pageUrl;
    this.elementSelector = elementSelector;
    this.elementText = elementText;
    this.targetUrl = targetUrl;
    this.httpStatus = httpStatus;
    this.message = message;
    this.context = context;
    this.suggestion = suggestion;
    this.crawledAt = new Date();
    this.id = crypto.randomUUID().slice(0, 8);
  }

  get severity() {
    return ISSUE_SEVERITY[this.issueType] || Severity.WARNING;
  }

  toJSON() {
    return {
      id: this.id,
      severity: this.severity,
      severity_label: SEVERITY_LABELS[this.severity] || "Warning",
      issue_type: this.issueType,
      issue_type_label: ISSUE_TYPE_LABELS[this.issueType] || this.issueType,
      page_url: this.pageUrl,
      element_text: this.elementText ? this.elementText.slice(0, 200) : "",
      target_url: this.targetUrl,
      http_status: this.httpStatus,
      message: this.message,
      suggestion: this.suggestion,
      context: this.context ? this.context.slice(0, 200) : "",
    };
  }

  toCSV() {
    const dateStr = this.crawledAt.toISOString().slice(0, 16).replace("T", " ");
    let description = this.message;
    if (this.httpStatus && this.httpStatus >= 400) {
      description = `Server returned error ${this.httpStatus}`;
    }
    return {
      ID: this.id,
      Priority: SEVERITY_LABELS[this.severity] || "Warning",
      "Issue Type": ISSUE_TYPE_LABELS[this.issueType] || this.issueType,
      "Found On Page": this.pageUrl,
      "Link/Button Text": this.elementText ? this.elementText.slice(0, 200) : "(no text)",
      "Links To": this.targetUrl || "N/A",
      "Status Code": this.httpStatus || "",
      Problem: description,
      "Suggested Fix": this.suggestion || "",
      Context: this.context ? this.context.slice(0, 200) : "",
      "Found At": dateStr,
    };
  }
}

module.exports = {
  Severity,
  IssueType,
  ISSUE_SEVERITY,
  ISSUE_TYPE_LABELS,
  SEVERITY_LABELS,
  Issue,
};
