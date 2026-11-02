import { describe, it, expect } from "vitest";
import { iconControls, noTextSelection, pills, windows } from "..";

describe("shared styles", () => {
  it("should style controls with the design tokens", () => {
    expect(windows.cssText).toContain("var(--pc-accent)");
    expect(noTextSelection.cssText).toContain("user-select: none");
    expect(iconControls.cssText).toContain(".icon-toggle");
    expect(pills.cssText).toContain("button.pill");
  });
});
