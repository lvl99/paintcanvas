import { describe, it, expect } from "vitest";
import PaintCanvas from "..";
import { BlendMode } from "../../Layer";
import { createPatchMessage } from "../../../messages";
import { encodeRgbaDeflate, type BoundingBox } from "../../../image";

/** The pixels of a canvas at a point */
const pixel = (canvas: OffscreenCanvas, x: number, y: number) => [
  ...(
    canvas.getContext("2d") as OffscreenCanvasRenderingContext2D
  ).getImageData(x, y, 1, 1).data,
];

/** A 20×10 canvas with two layers (red pixel on the bottom one, which is selected) and a blue sheet from "ann" */
const setup = async () => {
  const canvas = new PaintCanvas({ width: 20, height: 10 });
  const bottom = canvas.layers.active;
  bottom.context.fillStyle = "#ff0000";
  bottom.context.fillRect(1, 1, 1, 1);
  const top = canvas.layers.create();
  canvas.layers.update(top.id, {
    opacity: 0.5,
    blendMode: BlendMode.Multiply,
    alphaLock: true,
  });
  canvas.layers.select(bottom.id);
  const coords: BoundingBox = [3, 3, 4, 4];
  await canvas.receive(
    "ann",
    createPatchMessage(
      coords,
      "rgba-deflate",
      await encodeRgbaDeflate(new Uint8ClampedArray([0, 0, 255, 255]), coords),
    ),
  );
  return canvas;
};

describe("PaintCanvas documents", () => {
  it("should save the drawing as a document that loads back the same", async () => {
    const saved = await (await setup()).exportDocument();
    expect(saved).toMatchObject({
      format: "paintcanvas-document",
      version: 1,
      width: 20,
      height: 10,
      activeLayer: 1,
      layers: [
        {
          name: "Layer 2",
          opacity: 0.5,
          blendMode: "multiply",
          alphaLock: true,
        },
        {
          name: "Layer 1",
          opacity: 1,
          blendMode: "source-over",
          visible: true,
        },
      ],
      external: [{ source: "ann" }],
    });

    const loaded = new PaintCanvas({ width: 5, height: 5 });
    loaded.layers.create();
    expect(await loaded.importDocument(JSON.parse(JSON.stringify(saved)))).toBe(
      true,
    );
    expect([loaded.width, loaded.height]).toEqual([20, 10]);
    expect(loaded.layers.layers.map((layer) => layer.name)).toEqual([
      "Layer 2",
      "Layer 1",
    ]);
    expect(loaded.layers.layers[0]!.toConfig()).toMatchObject({
      opacity: 0.5,
      blendMode: "multiply",
      alphaLock: true,
    });
    expect(loaded.layers.active).toBe(loaded.layers.layers[1]);
    expect(pixel(loaded.layers.layers[1]!.canvas, 1, 1)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(loaded.external.sheets.map((sheet) => sheet.source)).toEqual([
      "ann",
    ]);
    expect(pixel(loaded.external.sheets[0]!.canvas, 3, 3)).toEqual([
      0, 0, 255, 255,
    ]);
    expect(loaded.history.canUndo).toBe(false);
  });

  it("should change nothing for an invalid document or one whose images can't be decoded", async () => {
    const canvas = await setup();
    const saved = await canvas.exportDocument();
    expect(await canvas.importDocument({ ...saved, width: 0 })).toBe(false);
    const broken = {
      ...saved,
      layers: [{ ...saved.layers[0]!, image: "data:image/png;base64,AAAA" }],
      activeLayer: 0,
    };
    expect(await canvas.importDocument(broken)).toBe(false);
    // More layers than this canvas allows
    const oneLayer = new PaintCanvas({ width: 20, height: 10, maxLayers: 1 });
    expect(await oneLayer.importDocument(saved)).toBe(false);
    expect(canvas.layers.layers).toHaveLength(2);
    expect(canvas.width).toBe(20);
  });

  it("should report its size, layers, sheets, memory and undo steps", async () => {
    const canvas = await setup();
    expect(canvas.stats()).toEqual({
      width: 20,
      height: 10,
      layers: 2,
      externalSheets: 1,
      memoryBytes: 20 * 10 * 4 * 3,
      historySteps: canvas.history.size,
      historyLimit: 20,
    });
    expect(canvas.stats().historySteps).toBeGreaterThan(0);
  });
});
