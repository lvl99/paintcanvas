// Facts about the build that PaintCanvas shows (see src/lib/version): the commit it was built from. Vite puts it in
// place of `__PAINTCANVAS_COMMIT__` when building and testing.
import { execFileSync } from "node:child_process";
import type { Plugin } from "vite";

/** What a commit is called when it can't be found (e.g. building outside a git checkout) */
export const UNKNOWN_COMMIT = "unknown";

/**
 * The short hash of the commit being built, or `UNKNOWN_COMMIT` when git can't tell.
 *
 * @example
 * commitHash(); // "ac12a0d"
 */
export const commitHash = (
  readHash: () => string = () =>
    execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
): string => {
  try {
    return readHash().trim() || UNKNOWN_COMMIT;
  } catch {
    return UNKNOWN_COMMIT;
  }
};

/**
 * A Vite plugin that puts the commit's short hash in place of `__PAINTCANVAS_COMMIT__`.
 *
 * @example
 * export default defineConfig({ plugins: [buildInfo()] });
 */
export const buildInfo = (): Plugin => ({
  name: "paintcanvas:build-info",
  config: () => ({
    define: { __PAINTCANVAS_COMMIT__: JSON.stringify(commitHash()) },
  }),
});
