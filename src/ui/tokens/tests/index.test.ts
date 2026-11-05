import { afterEach, describe, it, expect } from "vitest";
import {
  DARK_TOKENS,
  LIGHT_TOKENS,
  PAGE_TOKENS_CSS,
  TOKENS_CSS,
  TOKENS_STYLE_ID,
  installTokens,
  tokens,
} from "..";
import { DELETE_CURSOR } from "../../../lib/rendering/cursors";

afterEach(() => document.getElementById(TOKENS_STYLE_ID)?.remove());

describe("design tokens", () => {
  it("should set light tokens on the page, and dark ones for the dark theme and for the system theme (and pages without a theme) on dark devices", () => {
    expect(PAGE_TOKENS_CSS).toContain(
      ':root, [data-pc-theme="light"] { --pc-blue: #2c6bff;',
    );
    expect(PAGE_TOKENS_CSS).toContain(
      `[data-pc-theme="dark"] { --pc-surface: ${DARK_TOKENS.surface};`,
    );
    expect(PAGE_TOKENS_CSS).toContain(
      '@media (prefers-color-scheme: dark) { :root:not([data-pc-theme="light"]), [data-pc-theme="system"] {',
    );
    expect(TOKENS_CSS).toBe(PAGE_TOKENS_CSS);
  });

  it("should set the delete cursor (an X) on the page for every element", () => {
    expect(LIGHT_TOKENS["delete-cursor"]).toBe(DELETE_CURSOR);
    expect(PAGE_TOKENS_CSS).toContain(`--pc-delete-cursor: ${DELETE_CURSOR};`);
  });

  it("should give the accent text at least 4.5:1 contrast on the accent in both themes (WCAG 2.2 AA)", () => {
    // Relative luminance of a #rrggbb colour
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light! + 0.05) / (dark! + 0.05);
    };
    for (const theme of [LIGHT_TOKENS, { ...LIGHT_TOKENS, ...DARK_TOKENS }])
      expect(
        contrast(theme.accent!, theme["accent-text"]!),
      ).toBeGreaterThanOrEqual(4.5);
  });

  it("should only override light tokens in the dark theme", () => {
    for (const name of Object.keys(DARK_TOKENS))
      expect(LIGHT_TOKENS).toHaveProperty(name);
  });

  it("should keep the canvas map's border and frame colours the same in the dark theme", () => {
    expect(LIGHT_TOKENS).toMatchObject({
      "map-border": "#999999",
      "map-frame": "#000000",
    });
    expect(DARK_TOKENS).not.toHaveProperty("map-border");
    expect(DARK_TOKENS).not.toHaveProperty("map-frame");
  });

  it("should let one element choose its theme", () => {
    expect(tokens.cssText).toContain(':host([theme="dark"]) {');
    expect(tokens.cssText).toContain(':host([theme="system"])');
    expect(tokens.cssText).toContain(".pc-visually-hidden");
    expect(tokens.cssText).toContain(
      ":host { color: var(--pc-text); color-scheme: var(--pc-color-scheme); }",
    );
  });

  it("should add the page stylesheet once, before the page's own styles", () => {
    const own = document.createElement("style");
    document.head.append(own);
    installTokens();
    installTokens();
    const added = document.querySelectorAll(`#${TOKENS_STYLE_ID}`);
    expect(added).toHaveLength(1);
    expect(document.head.firstElementChild).toBe(added[0]);
    expect(added[0]!.textContent).toBe(PAGE_TOKENS_CSS);
    own.remove();
  });
});
