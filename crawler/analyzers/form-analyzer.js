/**
 * Form analyzer — detects form issues through static analysis.
 */

const { BaseAnalyzer } = require("./base");
const { Issue, IssueType } = require("../models");

class FormAnalyzer extends BaseAnalyzer {
  async analyze(pageUrl, { forms = [] } = {}) {
    if (!forms.length) return [];
    const issues = [];

    for (const form of forms) {
      if (!form.action) {
        issues.push(new Issue({
          issueType: IssueType.FORM_MISSING_ACTION,
          pageUrl,
          elementSelector: form.selector,
          message: "Form has no action attribute - may not submit properly",
          suggestion: "Add an action URL or handle submission with JavaScript",
        }));
      }

      if (form.action && form.action.toLowerCase().startsWith("mailto:")) {
        const emailTarget = form.action.slice(7);
        issues.push(new Issue({
          issueType: IssueType.FORM_MAILTO_ACTION,
          pageUrl,
          elementSelector: form.selector,
          targetUrl: form.action,
          message: `Form submits to email address: ${emailTarget}`,
          suggestion: "Consider using a server-side form handler for better reliability and security",
        }));
      }

      if (!form.hasSubmit) {
        issues.push(new Issue({
          issueType: IssueType.FORM_NO_SUBMIT,
          pageUrl,
          elementSelector: form.selector,
          message: "Form has no submit button",
          suggestion: "Add a submit button or input[type=submit]",
        }));
      }

      for (const field of form.fields) {
        if (field.required && !field.hasValidation) {
          issues.push(new Issue({
            issueType: IssueType.FORM_REQUIRED_NO_VALIDATION,
            pageUrl,
            elementSelector: field.selector,
            elementText: field.name || "",
            message: "Required field has no input validation",
            suggestion: "Add pattern attribute or use specific input type (email, url, etc.)",
          }));
        }

        if (!field.hasLabel) {
          issues.push(new Issue({
            issueType: IssueType.FORM_MISSING_LABELS,
            pageUrl,
            elementSelector: field.selector,
            elementText: field.name || "",
            message: "Form field has no associated label",
            suggestion: "Add a <label for='id'> or aria-label attribute",
          }));
        }
      }
    }

    return issues;
  }
}

module.exports = { FormAnalyzer };
