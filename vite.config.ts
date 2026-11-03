/// <reference types="vitest/config" />
import { globSync, readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// Every module the package exports (see `exports` in package.json): the engine (`@lvl99dotcom/paintcanvas`), the optional UI
// (`@lvl99dotcom/paintcanvas/ui`), each engine and UI folder (`@lvl99dotcom/paintcanvas/lib/*`, `@lvl99dotcom/paintcanvas/ui/*`) and the test helpers
// (`@lvl99dotcom/paintcanvas/testing/*`)
const entries = globSync(
  ["src/index.ts", "src/{lib,ui}/**/index.ts", "src/testing/*.ts"],
  { exclude: (path) => path.includes("/tests/") || path.endsWith("/tests") },
);

// The pre-compiled validators are plain JavaScript typed by a hand-written `.d.ts`, which TypeScript doesn't copy
const validatorTypesPath = "lib/validation/validators.generated.d.ts";

/**
 * Copy the validators' type definitions into `dist/` beside their built JavaScript.
 */
const copyValidatorTypes = (): Plugin => ({
  name: "paintcanvas:copy-validator-types",
  apply: "build",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: validatorTypesPath,
      source: readFileSync(`src/${validatorTypesPath}`, "utf8"),
    });
  },
});

// Builds PaintCanvas as ES modules in `dist/`, one file per source file in the same folders as `src/`, so each exported
// path has its own file and implementers' bundlers only include what they import
export default defineConfig({
  plugins: [copyValidatorTypes()],
  build: {
    lib: { entry: entries, formats: ["es"] },
    rolldownOptions: {
      // Lit is a peer dependency, so implementers share one copy. Vitest is only used by the test helpers.
      external: [/^lit($|\/)/, /^vitest($|\/)/],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].js",
      },
    },
    outDir: "dist",
    // The type definitions are written into `dist/` after this build (see tsconfig.build.json)
    emptyOutDir: true,
    // Implementers' bundlers minify; readable output is easier to debug
    minify: false,
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
