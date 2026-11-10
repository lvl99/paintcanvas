// Which PaintCanvas this is: its version, the commit it was built from (put in place when it's built, see
// scripts/build-info.ts) and where its source code is.
// Only the version is imported, so the rest of package.json isn't built into the package
import { version } from "../../../package.json";

/** Replaced with the short hash of the commit being built */
declare const __PAINTCANVAS_COMMIT__: string;

/** PaintCanvas's version, from its package.json, e.g. `0.6.0` */
export const PAINTCANVAS_VERSION: string = version;

/** The short hash of the commit PaintCanvas was built from, e.g. `ac12a0d` (`unknown` outside a git checkout) */
export const PAINTCANVAS_COMMIT: string = __PAINTCANVAS_COMMIT__;

/** Where PaintCanvas's source code is */
export const PAINTCANVAS_REPOSITORY_URL =
  "https://github.com/lvl99/paintcanvas";

/**
 * PaintCanvas's name, version and commit as one line.
 *
 * @example
 * versionText(); // "PaintCanvas v0.6.0 (ac12a0d)"
 * versionText("1.0.0", "abc1234"); // "PaintCanvas v1.0.0 (abc1234)"
 */
export const versionText = (
  version: string = PAINTCANVAS_VERSION,
  commit: string = PAINTCANVAS_COMMIT,
): string => `PaintCanvas v${version} (${commit})`;
