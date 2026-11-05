import { describe, it, expect, vi } from "vitest";
import "..";
import type { PaintCanvasElement } from "..";
import PaintCanvas, { Panel } from "../../../../lib/classes/PaintCanvas";

describe("paint-canvas menu in a real browser", () => {
  it("should float the app menu with the same shadow as the other panels", async () => {
    const layout = document.createElement("paint-canvas") as PaintCanvasElement;
    layout.app = new PaintCanvas({ width: 20, height: 10 });
    layout.innerHTML = '<div slot="menu">Menu</div>';
    document.body.append(layout);
    await layout.updateComplete;
    layout.app.togglePanel(Panel.Menu);
    await layout.updateComplete;
    const shadow = (selector: string) =>
      getComputedStyle(layout.shadowRoot!.querySelector(selector)!).boxShadow;
    expect(shadow(".menu-panel")).not.toBe("none");
    layout.app.togglePanel(Panel.Layers);
    await layout.updateComplete;
    const layers = layout.shadowRoot!.querySelector("pc-panel-layers")!;
    expect(shadow(".menu-panel")).toBe(getComputedStyle(layers).boxShadow);
    layout.remove();
  });
});

describe("paint-canvas tool settings in a real browser", () => {
  it("should scroll the tool settings bar sideways when it's wider than the layout", async () => {
    const layout = document.createElement("paint-canvas") as PaintCanvasElement;
    layout.app = new PaintCanvas({ width: 20, height: 10 });
    layout.style.cssText = "display: grid; width: 320px; height: 400px";
    document.body.append(layout);
    await layout.updateComplete;
    const settings = layout.shadowRoot!.querySelector(".top pc-tool-settings")!;
    await (settings as PaintCanvasElement).updateComplete;
    const bar =
      settings.shadowRoot!.querySelector<HTMLElement>("[role=toolbar]")!;
    expect(settings.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    expect(bar.scrollWidth).toBeGreaterThan(bar.clientWidth);
    bar.scrollLeft = bar.scrollWidth;
    expect(bar.scrollLeft).toBeGreaterThan(0);
    layout.remove();
  });
});

describe("paint-canvas screenshots", () => {
  it("should save the drawing as a PNG named with the app's file prefix", async () => {
    const layout = document.createElement("paint-canvas") as PaintCanvasElement;
    layout.app = new PaintCanvas({
      width: 20,
      height: 10,
      names: { filePrefix: "sketch" },
    });
    const saveFile = vi.fn(async () => "download" as const);
    layout.saveFile = saveFile;
    document.body.append(layout);
    await layout.updateComplete;
    expect(await layout.saveScreenshot()).toBe("download");
    const [blob, name] = saveFile.mock.calls[0] as unknown as [Blob, string];
    expect(blob.type).toBe("image/png");
    expect(name).toMatch(/^sketch-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);
    layout.remove();
  });
});
