import { defineConfig } from "@playwright/test";
import base from "./playwright.production.config.js";

export default defineConfig({
  ...base,
  testMatch: "ui-review.spec.js",
  timeout: 360000,
  use: { ...base.use, trace: "off", video: "off" },
  outputDir: "./test-results/ui-review",
  projects: base.projects.filter((project) => project.name !== "tablet"),
  webServer: base.webServer.map((server, index) =>
    index === 0
      ? { ...server, env: { ...process.env, DINEFLOW_UI_REVIEW_FIXTURES: "1" } }
      : server,
  ),
});
