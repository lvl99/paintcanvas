// PaintCanvas engine: drawing input, layers, brushes, history and rendering, without any UI.
import packageJson from "../package.json" with { type: "json" };

/** PaintCanvas's version, from its package.json */
export const VERSION: string = packageJson.version;
