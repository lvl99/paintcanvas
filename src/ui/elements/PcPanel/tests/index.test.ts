import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcPanel } from "..";
import "../../PcPanelLayers";
import "../../PcPanelBrushes";
import "../../PcPanelColours";
import { mount, shadow } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

afterEach(() => document.body.replaceChildren());

/** Where a panel's child is shown: the slot it's assigned to */
const slotOf = (panel: PcPanel, child: Element) =>
  [...panel.shadowRoot!.querySelectorAll("slot")].find((slot) =>
    slot.assignedElements({ flatten: true }).includes(child),
  );

describe("pc-panel", () => {
  it("should name its region, and keep its icon and badge for the rail", async () => {
    const panel = await mount<PcPanel>(
      "pc-panel",
      { icon: "layers", label: "Layers", badge: true },
      "<p>Content</p>",
    );
    expect(shadow(panel, "section").getAttribute("aria-label")).toBe("Layers");
    expect([panel.panelIcon, panel.panelLabel]).toEqual(["layers", "Layers"]);
    expect(panel.hasAttribute("badge")).toBe(true);
    const unnamed = await mount<PcPanel>("pc-panel");
    expect(shadow(unnamed, "section").hasAttribute("aria-label")).toBe(false);
    expect([unnamed.panelIcon, unnamed.panelLabel]).toEqual(["", ""]);
  });

  it("should show content in its header, body and footer, and content without a slot in the body", async () => {
    const panel = await mount<PcPanel>(
      "pc-panel",
      {},
      '<h2 slot="header">Title</h2><p>Body</p><p slot="body">Also body</p><p slot="footer">End</p>',
    );
    const [heading, body, alsoBody, footer] = [...panel.children];
    expect(slotOf(panel, heading!)?.name).toBe("header");
    expect(slotOf(panel, footer!)?.name).toBe("footer");
    expect(slotOf(panel, alsoBody!)?.name).toBe("body");
    expect(shadow(panel, ".body").contains(slotOf(panel, body!) as Node)).toBe(
      true,
    );
  });

  it.each([
    ["pc-panel-layers", {}, "layers", "Layers"],
    ["pc-panel-brushes", { kind: "brush" }, "brush", "Brush"],
    ["pc-panel-brushes", { kind: "eraser" }, "eraser", "Eraser"],
    ["pc-panel-colours", {}, "", "Color palette"],
  ])(
    "should name %s %j and give it an icon, unless given its own",
    async (tag, properties, icon, label) => {
      const panel = await mount<PcPanel>(tag, {
        app: createApp(),
        ...properties,
      } as Partial<PcPanel>);
      expect([panel.panelIcon, panel.panelLabel]).toEqual([icon, label]);
      expect(shadow(panel, "section").getAttribute("aria-label")).toBe(label);
      panel.label = "Mine";
      panel.icon = "star";
      expect([panel.panelIcon, panel.panelLabel]).toEqual(["star", "Mine"]);
    },
  );
});
