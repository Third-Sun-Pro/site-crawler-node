/**
 * Joomla component analyzer — detects misconfigured or broken Joomla components.
 */

const cheerio = require("cheerio");
const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

// Patterns that indicate a Joomla site
const JOOMLA_INDICATORS = [
  /<meta\s+name=["']generator["']\s+content=["']Joomla/i,
  /\/media\/jui\//i,
  /option=com_/i,
  /\/components\/com_/i,
];

// Error page signatures
const ERROR_PATTERNS = [
  /\b0\s*-\s*Component not found\b/i,
  /Call Stack.*#\d+/is,
  /Error displaying the error page/i,
  /<title>\s*Error:\s/i,
];

const VERSION_RE = /<meta\s+name=["']generator["']\s+content=["']Joomla!\s*([\d.]+)/i;

function isJoomla(html) {
  return JOOMLA_INDICATORS.some((p) => p.test(html));
}

class JoomlaAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { htmlContent = "", links = [], forms = [] } = {}) {
    if (!htmlContent) return [];
    if (!isJoomla(htmlContent)) return [];

    const $ = cheerio.load(htmlContent);
    const issues = [];

    this._checkErrorPage(htmlContent, pageUrl, issues);
    this._checkAdminExposed($, pageUrl, issues);
    this._checkVersionLeak(htmlContent, pageUrl, issues);
    this._checkEventBooking(htmlContent, $, pageUrl, issues);
    this._checkDPCalendar(htmlContent, $, pageUrl, issues);
    this._checkConvertForms(htmlContent, $, pageUrl, issues);
    this._checkRsseo(htmlContent, $, pageUrl, issues);
    this._checkEngageBox(htmlContent, $, pageUrl, issues);
    this._checkDroppics(htmlContent, $, pageUrl, issues);
    this._checkSPPageBuilder(htmlContent, $, pageUrl, issues);
    this._checkJCE(htmlContent, pageUrl, issues);

    return issues;
  }

  _checkErrorPage(html, pageUrl, issues) {
    for (const pattern of ERROR_PATTERNS) {
      const match = pattern.exec(html);
      if (match) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_ERROR_PAGE,
          pageUrl,
          message: `Joomla error page detected: ${match[0].slice(0, 120)}`,
          suggestion: "Check that the component is installed and enabled in Joomla admin",
        }));
        return;
      }
    }
  }

  _checkAdminExposed($, pageUrl, issues) {
    const body = $("body");
    if (!body.length) return;

    let found = false;
    body.find("a[href]").each((_, el) => {
      if (found) return false;
      const href = $(el).attr("href") || "";
      if (href.includes("/administrator") && !href.endsWith("/administrator/")) {
        if (href.startsWith("mailto:") || href.startsWith("#")) return;
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_ADMIN_EXPOSED,
          pageUrl,
          elementText: $(el).text().trim().slice(0, 100),
          targetUrl: href,
          message: "Public page links to Joomla admin area",
          suggestion: "Remove admin links from public-facing content",
        }));
        found = true;
      }
    });
  }

  _checkVersionLeak(html, pageUrl, issues) {
    const match = VERSION_RE.exec(html);
    if (match) {
      issues.push(new Issue({
        issueType: IssueType.JOOMLA_VERSION_LEAK,
        pageUrl,
        message: `Joomla version ${match[1]} exposed in meta generator tag`,
        suggestion: "Disable the generator meta tag in Global Configuration or use a plugin to remove it",
      }));
    }
  }

  // ── Event Booking (com_eventbooking) ──

  _checkEventBooking(html, $, pageUrl, issues) {
    const hasEB = !!(
      $(".eb-container, .eb-event-list").length ||
      /com_eventbooking/i.test(html)
    );
    if (!hasEB) return;

    // Empty event list
    const container = $(".eb-container, .eb-event-list").first();
    if (container.length) {
      const events = container.find(".eb-event");
      const text = container.text().trim().toLowerCase();
      const noEventsPhrases = ["no events", "no upcoming events", "no items"];
      const hasNoMsg = noEventsPhrases.some((p) => text.includes(p));
      if (!events.length && (hasNoMsg || text.length < 50)) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_EMPTY_EVENT_LIST,
          pageUrl,
          message: "Event Booking container is present but shows no events",
          suggestion: "Add events in Event Booking admin or hide the module when empty",
        }));
      }
    }

    // Broken registration form
    const regForm = $('form[action*="com_eventbooking"][action*="register"]');
    if (regForm.length) {
      const fields = regForm.find("input, select, textarea");
      if (fields.length < 2) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_BROKEN_REGISTRATION,
          pageUrl,
          message: "Event Booking registration form appears broken (missing fields)",
          suggestion: "Check Event Booking configuration and registration form layout",
        }));
      }
    }

    // Missing assets
    if (!/\/com_eventbooking\/.*\.(css|js)/i.test(html)) {
      if (/com_eventbooking/i.test(html)) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_MISSING_COMPONENT_ASSETS,
          pageUrl,
          message: "Event Booking markup detected but CSS/JS assets not loaded",
          suggestion: "Check that Event Booking assets are being included properly",
        }));
      }
    }
  }

  // ── DP Calendar (com_dpcalendar) ──

  _checkDPCalendar(html, $, pageUrl, issues) {
    const hasDPC = !!(
      $(".dp-calendar, .dpcalendar").length ||
      /com_dpcalendar/i.test(html)
    );
    if (!hasDPC) return;

    const container = $(".dp-calendar, .dpcalendar").first();
    if (container.length) {
      const events = container.find('[class*="event"], .fc-event');
      const text = container.text().trim().toLowerCase();
      const noEvents = ["no events", "no items", "nothing"].some((p) => text.includes(p));
      if (!events.length && (noEvents || text.length < 30)) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_EMPTY_CALENDAR,
          pageUrl,
          message: "DP Calendar container is present but shows no events",
          suggestion: "Add events in DP Calendar admin or hide the calendar when empty",
        }));
      }
    }

    if ($(".dp-calendar, .dpcalendar").length) {
      if (!/com_dpcalendar.*\.js|dpcalendar.*\.js|fullcalendar/i.test(html)) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_CALENDAR_JS_MISSING,
          pageUrl,
          message: "DP Calendar markup present but JavaScript not loaded — calendar won't render",
          suggestion: "Ensure DP Calendar JS assets are included; check template overrides",
        }));
      }
    }
  }

  // ── Convert Forms / Forms by Tassos ──

  _checkConvertForms(html, $, pageUrl, issues) {
    const hasCF = !!(
      $(".cf-form, .cf-field").length ||
      /com_convertforms|com_fta/i.test(html)
    );
    if (!hasCF) return;

    const containers = $(".cf-form");
    let renderFailure = false;
    containers.each((_, el) => {
      if (renderFailure) return false;
      const fields = $(el).find(".cf-field");
      const inputs = $(el).find("input, select, textarea");
      if (!fields.length && inputs.length < 2) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_FORM_RENDER_FAILURE,
          pageUrl,
          message: "Convert Forms container present but form fields not rendered",
          suggestion: "Check that the form exists in Convert Forms admin and the plugin is enabled",
        }));
        renderFailure = true;
      }
    });

    if ($(".cf-form").length) {
      if (!/com_convertforms.*\.(css|js)|convertforms/i.test(html)) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_MISSING_COMPONENT_ASSETS,
          pageUrl,
          message: "Convert Forms markup detected but CSS/JS assets not loaded",
          suggestion: "Check that Convert Forms system plugin is enabled",
        }));
      }
    }
  }

  // ── RSSEO! ──

  _checkRsseo(html, $, pageUrl, issues) {
    if (!/\/media\/com_rsseo\//i.test(html)) return;

    const metaDesc = $('meta[name="description"]');
    const titleTag = $("title");

    const missing = [];
    if (!metaDesc.length || !(metaDesc.attr("content") || "").trim()) {
      missing.push("meta description");
    }
    if (!titleTag.length || !titleTag.text().trim()) {
      missing.push("title tag");
    }

    if (missing.length) {
      issues.push(new Issue({
        issueType: IssueType.JOOMLA_SEO_MISCONFIGURED,
        pageUrl,
        message: `RSSEO! is active but ${missing.join(" and ")} missing`,
        suggestion: "Configure meta description and title in RSSEO! or article settings",
      }));
    }
  }

  // ── Engage Box ──

  _checkEngageBox(html, $, pageUrl, issues) {
    const hasEB = !!(
      $(".engagebox, .rstbox").length ||
      /engagebox|rstbox/i.test(html)
    );
    if (!hasEB) return;

    const hasMarkup = !!$(".engagebox, .rstbox").length;
    const hasJS = /engagebox.*\.js|rstbox.*\.js/i.test(html);
    if (hasMarkup && !hasJS) {
      issues.push(new Issue({
        issueType: IssueType.JOOMLA_POPUP_ASSETS_MISSING,
        pageUrl,
        message: "Engage Box popup markup present but JavaScript not loaded",
        suggestion: "Ensure the Engage Box system plugin is enabled",
      }));
    }
  }

  // ── Droppics ──

  _checkDroppics(html, $, pageUrl, issues) {
    const has = !!(
      $(".droppics").length ||
      /\/media\/com_droppics\//i.test(html)
    );
    if (!has) return;

    let emptyFound = false;
    $(".droppics").each((_, el) => {
      if (emptyFound) return false;
      const images = $(el).find("img");
      if (!images.length) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_EMPTY_GALLERY,
          pageUrl,
          message: "Droppics gallery container present but contains no images",
          suggestion: "Add images to the gallery in Droppics admin or remove the empty gallery",
        }));
        emptyFound = true;
      }
    });

    if ($(".droppics").length) {
      if (!/com_droppics.*\.(css|js)|droppics.*\.(css|js)/i.test(html)) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_MISSING_COMPONENT_ASSETS,
          pageUrl,
          message: "Droppics gallery markup detected but CSS/JS assets not loaded",
          suggestion: "Check that Droppics is properly installed and assets are loading",
        }));
      }
    }
  }

  // ── SP Page Builder ──

  _checkSPPageBuilder(html, $, pageUrl, issues) {
    const hasSPPB = !!$(".sppb-section, .sppb-row, .sppb-addon").length;
    if (!hasSPPB) return;

    if (!/sppagebuilder.*\.(css|js)|sppb.*\.css/i.test(html)) {
      issues.push(new Issue({
        issueType: IssueType.JOOMLA_PAGEBUILDER_ASSETS_MISSING,
        pageUrl,
        message: "SP Page Builder markup present but CSS/JS assets not loaded — layout will be broken",
        suggestion: "Ensure SP Page Builder component and plugin are enabled",
      }));
    }

    let emptyFound = false;
    $(".sppb-section").each((_, el) => {
      if (emptyFound) return false;
      const addons = $(el).find(".sppb-addon");
      const text = $(el).text().trim();
      if (!addons.length && text.length < 10) {
        issues.push(new Issue({
          issueType: IssueType.JOOMLA_EMPTY_SECTION,
          pageUrl,
          message: "SP Page Builder section is empty (no addons or content)",
          suggestion: "Add content to the section or remove it in SP Page Builder editor",
        }));
        emptyFound = true;
      }
    });
  }

  // ── JCE Editor ──

  _checkJCE(html, pageUrl, issues) {
    if (/(?:option=com_jce|\/component\/jce\/)/i.test(html)) {
      issues.push(new Issue({
        issueType: IssueType.JOOMLA_EDITOR_LINK_EXPOSED,
        pageUrl,
        message: "JCE editor internal link exposed in rendered page HTML",
        suggestion: "Remove or fix links that point to the JCE editor component",
      }));
    }
  }
}

module.exports = { JoomlaAnalyzer };
