/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Builds PaintCanvas as an ES module library: the engine (`paintcanvas`) and the optional UI (`paintcanvas/ui`)
export default defineConfig({
  build: {
    lib: {
      entry: { index: "src/index.ts", ui: "src/ui/index.ts" },
      formats: ["es"],
    },
    // Lit is a peer dependency, so implementers share one copy
    rollupOptions: { external: [/^lit($|\/)/] },
    outDir: "dist",
    emptyOutDir: false,
  },
  test: {
    name: "paintcanvas",
    environment: "jsdom",
    // Components import their style.css as text; without this, tests get empty files
    css: { include: /.+/ },
    // Pixel tests run in a real browser (see vitest.browser.config.ts)
    exclude: ["**/node_modules/**", "src/**/*.browser.test.ts"],
    setupFiles: ["src/tests/setup.ts"],
  },
});
