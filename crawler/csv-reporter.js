/**
 * CSV reporter for outputting crawl results.
 */

const { stringify } = require("csv-stringify/sync");

const COLUMNS = [
  "ID",
  "Priority",
  "Issue Type",
  "Found On Page",
  "Link/Button Text",
  "Links To",
  "Status Code",
  "Problem",
  "Suggested Fix",
  "Context",
  "Found At",
];

function generateCSV(issues) {
  const rows = issues.map((issue) => issue.toCSV());
  return stringify(rows, { header: true, columns: COLUMNS });
}

module.exports = { generateCSV, COLUMNS };
