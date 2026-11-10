import { describe, it, expect } from "vitest";
import "../../PcPanelLayers";
import type { PcPanelLayers } from "../../PcPanelLayers";
import PaintCanvas from "../../../../lib/classes/PaintCanvas";
import { BlendMode } from "../../../../lib/classes/Layer";

describe("layer rows in a real browser", () => {
  it("should stay inside the layers menu with a long name and a long blend mode", async () => {
    const app = new PaintCanvas({ width: 20, height: 10 });
    const menu = document.createElement("pc-panel-layers") as PcPanelLayers;
    menu.app = app;
    document.body.append(menu);
    // A long blend mode name, chosen, so even Chrome (which sizes dropdowns by the chosen option) makes it wide
    menu.translations.addStrings("en-US", {
      "paintCanvas.blendMode.overlay":
        "Superposition claire avec un nom très long",
    });
    const { id } = app.layers.active;
    app.layers.rename(id, "A layer with a very long name that doesn't fit");
    app.layers.update(id, { blendMode: BlendMode.Overlay });
    await menu.updateComplete;
    const row = menu.shadowRoot!.querySelector("pc-layer-item")!;
    await (row as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    const menuBox = menu.getBoundingClientRect();
    expect(menuBox.width).toBe(290);
    const rowBox = row.getBoundingClientRect();
    expect(rowBox.right).toBeLessThanOrEqual(menuBox.right);
    for (const part of row.shadowRoot!.querySelectorAll(
      ".name, .opacity, select, .visibility",
    ))
      expect(part.getBoundingClientRect().right).toBeLessThanOrEqual(
        rowBox.right,
      );
    // Still wide enough to read the chosen blend mode's start, and the opacity slider usable
    const select = row.shadowRoot!.querySelector("select")!;
    expect(select.getBoundingClientRect().width).toBeGreaterThanOrEqual(70);
    const slider = row.shadowRoot!.querySelector(".opacity")!;
    const track = slider.shadowRoot!.querySelector(".track")!;
    expect(track.getBoundingClientRect().width).toBeGreaterThanOrEqual(60);
    menu.remove();
  });
});
