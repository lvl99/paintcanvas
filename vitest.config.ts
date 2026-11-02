import { defineConfig } from "vitest/config";

// Runs both test projects: unit tests in jsdom (vite.config.ts) and pixel tests in a real browser
// (vitest.browser.config.ts). Pick one with `--project paintcanvas` or `--project paintcanvas-browser`.
export default defineConfig({
  test: {
    projects: ["vite.config.ts", "vitest.browser.config.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/tests/**", "**/*.d.ts"],
    },
  },
});
