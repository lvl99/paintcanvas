import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcButtonGroup } from "..";
import { mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-button-group", () => {
  it("should group its buttons horizontally by default, or vertically", async () => {
    const group = await mount<PcButtonGroup>("pc-button-group", {
      label: "Tools",
    });
    const inner = shadow(group, "[role=group]");
    expect([
      inner.getAttribute("aria-label"),
      inner.getAttribute("aria-orientation"),
    ]).toEqual(["Tools", "horizontal"]);
    group.orientation = "vertical";
    await group.updateComplete;
    expect(group.getAttribute("orientation")).toBe("vertical");
    expect(inner.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("should join its buttons into one pill when asked", async () => {
    const group = await mount<PcButtonGroup>("pc-button-group");
    expect(group.joined).toBe(false);
    group.joined = true;
    await group.updateComplete;
    expect(group.hasAttribute("joined")).toBe(true);
  });
});
