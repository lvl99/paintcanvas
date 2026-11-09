import { describe, it, expect } from "vitest";
import PngEncoder, { createPngWorker } from "..";

describe("PNG encoding in a real browser", () => {
  it("should encode a canvas as a PNG in a worker", async () => {
    const worker = createPngWorker();
    expect(worker).not.toBeNull();
    worker?.terminate();
    const canvas = new OffscreenCanvas(4, 2);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 2, 2);
    let posted = 0;
    const encoder = new PngEncoder(() => {
      const made = createPngWorker() as Worker;
      made.addEventListener("message", () => posted++);
      return made;
    });
    const png = await encoder.encode(canvas);
    // The worker sent the PNG back
    expect(posted).toBe(1);
    expect(png.type).toBe("image/png");
    const image = await createImageBitmap(png);
    expect([image.width, image.height]).toEqual([4, 2]);
    const check = new OffscreenCanvas(4, 2);
    const checkCtx = check.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
    checkCtx.drawImage(image, 0, 0);
    expect([...checkCtx.getImageData(0, 0, 1, 1).data]).toEqual([
      255, 0, 0, 255,
    ]);
    expect(checkCtx.getImageData(3, 0, 1, 1).data[3]).toBe(0);
  });
});
