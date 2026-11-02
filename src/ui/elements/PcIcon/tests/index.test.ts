import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcIcon } from "..";
import { DEFAULT_ICONS } from "../../../icons";
import { mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-icon", () => {
  it("should show a labelled icon to screen readers, and hide a decorative one", async () => {
    const labelled = await mount<PcIcon>("pc-icon", {
      name: "brush",
      label: "Brush",
    });
    const image = shadow<HTMLImageElement>(labelled, "img");
    expect([image.getAttribute("src"), image.alt]).toEqual([
      DEFAULT_ICONS.brush,
      "Brush",
    ]);
    const decorative = await mount<PcIcon>("pc-icon", { name: "brush" });
    expect(shadow(decorative, "img").getAttribute("aria-hidden")).toBe("true");
  });

  it("should show nothing for an unknown icon", async () => {
    const icon = await mount<PcIcon>("pc-icon", { name: "missing" });
    expect(icon.shadowRoot?.querySelector("img")).toBeNull();
  });
});
