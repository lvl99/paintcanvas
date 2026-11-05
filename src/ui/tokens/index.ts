import { unsafeCSS } from "lit";
import { DELETE_CURSOR } from "../../lib/rendering/cursors";

/** Design token values, by name (without the `--pc-` prefix) */
export type TokenValues = Readonly<Record<string, string>>;

/** The light theme's tokens: colours, spacing, corner radius, fonts and focus ring */
export const LIGHT_TOKENS: TokenValues = {
  blue: "#2c6bff",
  purple: "#8f3de8",
  pink: "#f40f95",
  "pink-dark": "#d10b7e",
  red: "#fb234a",
  orange: "#fe7e07",
  yellow: "#ffd52c",
  green: "#6dc905",
  mint: "#21e887",
  cyan: "#13c3f4",
  surface: "#ffffff",
  "surface-raised": "#ffffff",
  "surface-hover": "#dddddd",
  "surface-active": "#cccccc",
  bar: "#eeeeee",
  border: "#999999",
  text: "#000000",
  "text-muted": "#666666",
  // The canvas map's border and the frame of the visible area. They stay the same in the dark theme, as the map shows
  // the drawing, not the UI.
  "map-border": "#999999",
  "map-frame": "#000000",
  shadow: "0 4px 16px rgb(0 0 0 / 25%)",
  backdrop: "rgb(0 0 0 / 40%)",
  accent: "#8f3de8",
  "accent-text": "#ffffff",
  cancel: "#f40f95",
  "cancel-text": "#ffffff",
  "dismiss-text": "#d10b7e",
  disabled: "#999999",
  "icon-filter": "none",
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "16px",
  "radius-small": "4px",
  radius: "8px",
  "radius-pill": "999px",
  "control-size": "32px",
  "icon-size": "24px",
  // Buttons in the layout's sides (toolbars and rails) and their icons
  "side-button-size": "52px",
  "side-icon-size": "40px",
  font: "Arial, Helvetica, sans-serif",
  "font-size": "14px",
  "font-size-small": "12px",
  focus: "#000000",
  "focus-width": "3px",
  // Native controls (inputs, sliders, checkboxes) follow the theme
  "color-scheme": "light",
  // Over something a click deletes (e.g. a brush preset or saved colour with Alt/Option held)
  "delete-cursor": DELETE_CURSOR,
};

/** The dark theme's tokens that differ from the light theme's */
export const DARK_TOKENS: TokenValues = {
  surface: "#1e1e1e",
  "surface-raised": "#2a2a2a",
  "surface-hover": "#3a3a3a",
  "surface-active": "#4a4a4a",
  bar: "#252525",
  border: "#6b6b6b",
  text: "#f2f2f2",
  "text-muted": "#b0b0b0",
  shadow: "0 4px 16px rgb(0 0 0 / 60%)",
  backdrop: "rgb(0 0 0 / 60%)",
  // White text on it has at least 4.5:1 contrast (WCAG 2.2 AA), and it has 3:1 against the dark surfaces
  accent: "#9449ed",
  "dismiss-text": "#ff5cb8",
  disabled: "#6b6b6b",
  // Icons show as drawn (black lines, white fills), as in the light theme
  "icon-filter": "none",
  focus: "#ffffff",
  "color-scheme": "dark",
};

/**
 * Token values as CSS declarations.
 *
 * @example
 * declarations({ text: "#000" }); // "--pc-text: #000;"
 */
const declarations = (values: TokenValues): string =>
  Object.entries(values)
    .map(([name, value]) => `--pc-${name}: ${value};`)
    .join(" ");

/**
 * The page-level stylesheet: tokens on the page, so every element inherits them and the implementer can override any
 * token on `:root` or any ancestor. The page follows the device's theme (light or dark) unless its root element's
 * `data-pc-theme` is `"light"` or `"dark"`; on an ancestor, `data-pc-theme` switches what's inside it to that theme
 * (`"system"` follows the device).
 */
export const PAGE_TOKENS_CSS = `:root, [data-pc-theme="light"] { ${declarations(LIGHT_TOKENS)} }
[data-pc-theme="dark"] { ${declarations(DARK_TOKENS)} }
@media (prefers-color-scheme: dark) { :root:not([data-pc-theme="light"]), [data-pc-theme="system"] { ${declarations(DARK_TOKENS)} } }`;

/** The design tokens as text: the page-level stylesheet (kept for including in the implementer's own stylesheets) */
export const TOKENS_CSS: string = PAGE_TOKENS_CSS;

/**
 * Elements' shared styles: a `theme` attribute switches one element (and what's inside it) to the light, dark or
 * system theme, and `.pc-visually-hidden` hides text from view but not from screen readers.
 *
 * @example
 * static styles = [tokens, css`button { color: var(--pc-text); }`];
 */
export const tokens =
  unsafeCSS(`:host([theme="light"]) { ${declarations(LIGHT_TOKENS)} }
:host([theme="dark"]) { ${declarations({ ...LIGHT_TOKENS, ...DARK_TOKENS })} }
@media (prefers-color-scheme: dark) { :host([theme="system"]) { ${declarations({ ...LIGHT_TOKENS, ...DARK_TOKENS })} } }
:host { color: var(--pc-text); color-scheme: var(--pc-color-scheme); }
.pc-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }`);

/** Marks the page-level token stylesheet, so it's added once */
export const TOKENS_STYLE_ID = "pc-tokens";

/**
 * Add the page-level token stylesheet to a document (once), before its other styles so the implementer's own
 * stylesheets override it. PaintCanvas's elements do this when they're added to the page.
 */
export const installTokens = (document: Document = window.document): void => {
  if (document.getElementById(TOKENS_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TOKENS_STYLE_ID;
  style.textContent = PAGE_TOKENS_CSS;
  document.head.prepend(style);
};
