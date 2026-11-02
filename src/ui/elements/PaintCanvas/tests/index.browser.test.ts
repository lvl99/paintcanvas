import { describe, it, expect, vi } from "vitest";
import "..";
import type { PaintCanvasElement } from "..";
import PaintCanvas from "../../../../lib/classes/PaintCanvas";

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
