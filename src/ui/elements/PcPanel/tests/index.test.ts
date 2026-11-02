import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcPanel } from "..";
import { mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-panel", () => {
  it("should name its region, and keep its icon and badge for the layout", async () => {
    const panel = await mount<PcPanel>(
      "pc-panel",
      { icon: "layers", label: "Layers", badge: true },
      "<p>Content</p>",
    );
    expect(shadow(panel, "section").getAttribute("aria-label")).toBe("Layers");
    expect([panel.icon, panel.hasAttribute("badge")]).toEqual(["layers", true]);
    const unnamed = await mount<PcPanel>("pc-panel");
    expect(shadow(unnamed, "section").hasAttribute("aria-label")).toBe(false);
  });
});
