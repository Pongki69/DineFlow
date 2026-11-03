import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

// LAN mode (Start-DineFlow.ps1 -Lan) serves phones over HTTPS: browsers only
// offer location on secure pages, and riders need GPS.
const httpsPfx = process.env.DINEFLOW_HTTPS_PFX;
const https =
  httpsPfx && existsSync(httpsPfx)
    ? {
        pfx: readFileSync(httpsPfx),
        passphrase: process.env.DINEFLOW_HTTPS_PASSPHRASE,
      }
    : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    https,
    proxy: process.env.DINEFLOW_API_PROXY_TARGET
      ? {
          "/api": {
            target: process.env.DINEFLOW_API_PROXY_TARGET,
            changeOrigin: true,
            // Passes the phone's own address on, for the activity log.
            xfwd: true,
          },
          "/sanctum": {
            target: process.env.DINEFLOW_API_PROXY_TARGET,
            changeOrigin: true,
            xfwd: true,
          },
          "/storage": {
            target: process.env.DINEFLOW_API_PROXY_TARGET,
            changeOrigin: true,
          },
          "/app": {
            target: process.env.DINEFLOW_REVERB_PROXY_TARGET,
            ws: true,
            changeOrigin: true,
          },
        }
      : undefined,
  },
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./index.html", import.meta.url)),
        designLab: fileURLToPath(new URL("./design-lab.html", import.meta.url)),
      },
    },
  },
  test: { include: ["src/**/*.test.{js,jsx}"] },
});
