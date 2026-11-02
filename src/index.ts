// PaintCanvas engine: drawing input, layers, brushes, history and rendering, without any UI.
// Only the version is imported, so the rest of package.json isn't built into the package
import { version } from "../package.json";

/** PaintCanvas's version, from its package.json */
export const VERSION: string = version;
