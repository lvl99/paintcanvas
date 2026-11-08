import { describe, it, expect } from "vitest";
import {
  iconControls,
  noTextSelection,
  PILL_SIZE_STYLES,
  PILL_SIZES,
  pillSizeDeclarations,
  pills,
  windows,
} from "..";

describe("shared styles", () => {
  it("should style controls with the design tokens", () => {
    expect(windows.cssText).toContain("var(--pc-accent)");
    expect(noTextSelection.cssText).toContain("user-select: none");
    expect(iconControls.cssText).toContain(".icon-toggle");
    expect(pills.cssText).toContain("button.pill");
  });
});

describe("pill sizes", () => {
  it("should give each size its least height, font size and padding, on one centred line", () => {
    expect(PILL_SIZES).toEqual([
      "pill-s",
      "pill",
      "pill-l",
      "pill-xl",
      "pill-xxl",
    ]);
    expect(pillSizeDeclarations("pill-s")).toBe(
      "min-height: 24px; font-size: 14px; padding: 2px 8px; line-height: 1;",
    );
    expect(PILL_SIZE_STYLES["pill-xxl"]).toEqual({
      height: 100,
      fontSize: 28,
      padding: "36px 50px",
    });
  });

  it("should have a class for each size, and give window buttons the usual size", () => {
    for (const size of PILL_SIZES)
      expect(pills.cssText).toContain(
        `button.${size} { ${pillSizeDeclarations(size)} }`,
      );
    expect(windows.cssText).toContain(pillSizeDeclarations("pill"));
  });
});
