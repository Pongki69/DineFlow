import { defineConfig } from "@playwright/test";
import base from "./playwright.production.config.js";

export default defineConfig({
  ...base,
  testMatch: [
    "map-consistency.spec.js",
    "outlet-setup.spec.js",
    "admin-map-interactions.spec.js",
    "outlet-address-search.spec.js",
    "outlet-linking.spec.js",
  ],
  timeout: 120000,
  outputDir: "./test-results/maps",
  projects: base.projects.filter((project) => project.name !== "tablet"),
});
