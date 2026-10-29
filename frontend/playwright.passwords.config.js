import { defineConfig } from "@playwright/test";
import base from "./playwright.production.config.js";
export default defineConfig({
  ...base,
  testMatch: "password-feedback.spec.js",
  timeout: 90000,
  outputDir: "./test-results/password-feedback",
  projects: base.projects.filter((project) => project.name !== "tablet"),
});
