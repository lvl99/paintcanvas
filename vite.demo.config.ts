import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { keepSideEffectImports } from "./vite.config.ts";

/**
 * Resolve a path relative to this file.
 */
const fromHere = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

// Builds the demo pages (the PaintCanvas app and the UI elements page) as a static site in `.pages/app/`, for GitHub
// Pages (see scripts/build-pages.ts). Paths are relative, so the site works from any address.
export default defineConfig({
  root: fromHere("demo"),
  base: "./",
  plugins: [keepSideEffectImports()],
  build: {
    outDir: fromHere(".pages/app"),
    emptyOutDir: true,
    // The whole UI is one chunk (about 820 kB, 220 kB gzipped), which is expected for a demo of every element
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      input: {
        index: fromHere("demo/index.html"),
        elements: fromHere("demo/elements.html"),
      },
    },
  },
});
