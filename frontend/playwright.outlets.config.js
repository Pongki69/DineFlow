import { defineConfig } from "@playwright/test";
import base from "./playwright.production.config.js";

export default defineConfig({
  ...base,
  testMatch: "outlet-setup.spec.js",
  timeout: 90000,
  outputDir: "./test-results/outlet-setup",
  projects: base.projects.filter((project) => project.name !== "tablet"),
});
