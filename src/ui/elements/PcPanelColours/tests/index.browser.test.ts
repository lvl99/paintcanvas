import { describe, it, expect } from "vitest";
import "..";
import type { PcPanelColours } from "..";
import PaintCanvas, { Panel } from "../../../../lib/classes/PaintCanvas";
import { mount, queryAll } from "../../../../testing/elements";
import { testPalette } from "../../../../testing/assets";

describe("pc-panel-colours in a real browser", () => {
  it("should move down a row of saved colours by as many as fit across the panel", async () => {
    const app = new PaintCanvas({ width: 20, height: 10 });
    const id = "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a";
    const colours = Array.from(
      { length: 30 },
      (_, i) => `#${(i * 8).toString(16).padStart(2, "0")}0000`,
    );
    app.palettes.set([testPalette(colours, { id, name: "Reds" })]);
    app.togglePanel(Panel.Palette);
    const element = await mount<PcPanelColours>("pc-panel-colours", { app });
    element.style.cssText = "display: block; width: 240px";
    await element.updateComplete;
    const swatches = queryAll<HTMLButtonElement>(
      element,
      `.swatches[data-palette="${id}"] .swatch`,
    );
    const grid = swatches[0]!.parentElement!;
    const columns = Math.floor(grid.clientWidth / swatches[0]!.offsetWidth);
    expect(columns).toBeGreaterThan(1);
    swatches[0]!.click();
    swatches[0]!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    await element.updateComplete;
    await element.updateComplete;
    expect(element.shadowRoot!.activeElement).toBe(swatches[columns]);
    element.remove();
  });
});
