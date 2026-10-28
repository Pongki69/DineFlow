import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
