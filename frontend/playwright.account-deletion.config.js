import { defineConfig } from "@playwright/test";
import base from "./playwright.production.config.js";
export default defineConfig({
  ...base,
  testMatch: "account-deletion.spec.js",
  timeout: 90000,
  outputDir: "./test-results/account-deletion",
  projects: base.projects.filter((project) => project.name !== "tablet"),
});
