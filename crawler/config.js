/**
 * Crawler configuration with Zod validation.
 */

const { z } = require("zod");

const CrawlerConfigSchema = z.object({
  startUrl: z.string().url(),
  outputFile: z.string().default("report.csv"),
  maxPages: z.number().int().min(1).default(100),
  concurrency: z.number().int().min(1).max(20).default(5),
  timeout: z.number().int().min(1).default(30),
  rateLimit: z.number().min(0.1).default(2.0),
  skipGrammar: z.boolean().default(false),
  skipExternal: z.boolean().default(false),
  skipForms: z.boolean().default(false),
  skipJoomla: z.boolean().default(false),
  skipPerformance: z.boolean().default(false),
  skipSchema: z.boolean().default(false),
  skipSeo: z.boolean().default(false),
  userAgent: z.string().default("JoomlaCrawler/1.0 (Site Audit Tool)"),
  followRedirects: z.boolean().default(true),
  maxRetries: z.number().int().min(0).default(3),
  enableDynamicTesting: z.boolean().default(false),
  headless: z.boolean().default(true),
  dynamicTimeout: z.number().int().min(1).default(10),
  testFormSubmission: z.boolean().default(false),
  formTestEmail: z.string().default("test@example.com"),
  dynamicTestLimit: z.number().int().min(1).default(10),
});

function createConfig(input) {
  return CrawlerConfigSchema.parse(input);
}

module.exports = { CrawlerConfigSchema, createConfig };
