import { describe, it, expect } from "vitest";
import { renderScreenshot } from "..";
import LayerStack from "../../../classes/LayerStack";

describe("screenshots in a real browser", () => {
  it("should produce a full-size PNG of the layers on white", async () => {
    const stack = new LayerStack(40, 30);
    stack.active.context.fillStyle = "#ff0000";
    stack.active.context.fillRect(0, 0, 10, 10);
    const blob = await renderScreenshot(stack.layers, 40, 30);
    expect(blob.type).toBe("image/png");
    const bitmap = await createImageBitmap(blob);
    expect([bitmap.width, bitmap.height]).toEqual([40, 30]);
    const canvas = new OffscreenCanvas(40, 30);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    expect([...ctx.getImageData(5, 5, 1, 1).data]).toEqual([255, 0, 0, 255]);
    expect([...ctx.getImageData(30, 20, 1, 1).data]).toEqual([
      255, 255, 255, 255,
    ]);
  });
});
