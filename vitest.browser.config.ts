import { defineProject } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import viteConfig from "./vite.config";

// Pixel tests that need a real canvas run in headless Chromium (jsdom cannot draw).
// Files are named *.browser.test.ts. Uses the library's Vite settings, with its own test settings.
export default defineProject({
  ...viteConfig,
  test: {
    name: "paintcanvas-browser",
    include: ["src/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
