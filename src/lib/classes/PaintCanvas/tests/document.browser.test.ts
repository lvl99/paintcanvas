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
    const source = await setup();
    source.renameDocument(" Sunset ");
    const saved = await source.exportDocument();
    expect(saved).toMatchObject({
      $schema:
        "https://lvl99.github.io/paintcanvas/schemas/document-1.1.0.json",
      "@type": "PaintCanvas/Document",
      id: source.documentInfo.id,
      updatedAt: source.documentInfo.updatedAt,
      name: "Sunset",
      author: [{ name: "Unknown" }],
      width: 20,
      height: 10,
      activeLayer: source.layers.layers[1]!.id,
      layers: [
        {
          name: "Layer 2",
          opacity: 0.5,
          blendingMode: "multiply",
          alphaLock: true,
        },
        {
          name: "Layer 1",
          opacity: 1,
          blendingMode: "source-over",
          visible: true,
        },
      ],
      external: [{ source: "ann" }],
      thumbnail: { width: 20, height: 10 },
    });

    const loaded = new PaintCanvas({
      width: 5,
      height: 5,
      presetAuthor: () => ({ name: "Ann", handle: "ann.test" }),
    });
    loaded.layers.create();
    expect(await loaded.importDocument(JSON.parse(JSON.stringify(saved)))).toBe(
      true,
    );
    expect(loaded.documentInfo).toMatchObject({
      id: saved.id,
      name: "Sunset",
      dateCreated: saved.dateCreated,
      // Opening it isn't changing it
      updatedAt: saved.updatedAt,
    });
    expect(loaded.documentInfo.dateOpened >= saved.dateOpened).toBe(true);
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
    // Whoever saves it next is added to its authors
    const again = await loaded.createDocument({ thumbnail: false });
    expect(again.author).toEqual([
      { name: "Unknown" },
      { name: "Ann", handle: "ann.test" },
    ]);
    expect(again).not.toHaveProperty("thumbnail");
  });

  it("should draw the shown drawing small in the thumbnail", async () => {
    const canvas = new PaintCanvas({ width: 400, height: 100 });
    canvas.layers.active.context.fillStyle = "#00ff00";
    canvas.layers.active.context.fillRect(0, 0, 400, 100);
    const { thumbnail } = await canvas.createDocument();
    expect([thumbnail?.width, thumbnail?.height]).toEqual([200, 50]);
    const image = await createImageBitmap(thumbnail!.content);
    const small = new OffscreenCanvas(200, 50);
    small.getContext("2d")!.drawImage(image, 0, 0);
    expect(pixel(small, 100, 25)).toEqual([0, 255, 0, 255]);
  });

  it("should change nothing for an invalid document or one that can't be opened", async () => {
    const canvas = await setup();
    const info = canvas.documentInfo;
    const saved = await canvas.exportDocument();
    expect(await canvas.importDocument({ ...saved, width: 0 })).toBe(false);
    const broken = {
      ...saved,
      layers: [{ ...saved.layers[0]!, content: "data:image/png;base64,AAAA" }],
      activeLayer: saved.layers[0]!.id,
    };
    expect(await canvas.importDocument(broken)).toBe(false);
    const document = await canvas.createDocument();
    expect(
      await canvas.openDocument({ ...document, activeLayer: "gone" }),
    ).toBe(false);
    expect(await canvas.openDocument({ ...document, layers: [] })).toBe(false);
    expect(await canvas.openDocument({ ...document, width: 20000 })).toBe(
      false,
    );
    // More layers than this canvas allows
    const oneLayer = new PaintCanvas({ width: 20, height: 10, maxLayers: 1 });
    expect(await oneLayer.importDocument(saved)).toBe(false);
    expect(canvas.layers.layers).toHaveLength(2);
    expect(canvas.width).toBe(20);
    expect(canvas.documentInfo.id).toBe(info.id);
  });

  it("should rename the drawing and start a new one", async () => {
    const canvas = await setup();
    const { id } = canvas.documentInfo;
    expect(canvas.renameDocument("  ")).toBe(false);
    expect(canvas.renameDocument("Sea")).toBe(true);
    expect(canvas.documentInfo.name).toBe("Sea");
    canvas.newDocument("Sketch");
    expect(canvas.documentInfo).toMatchObject({
      name: "Sketch",
      author: [{ name: "Unknown" }],
    });
    expect(canvas.documentInfo.id).not.toBe(id);
    expect(canvas.layers.layers.map((layer) => layer.name)).toEqual([
      "Layer 1",
    ]);
    expect(canvas.history.canUndo).toBe(false);
    canvas.newDocument();
    expect(canvas.documentInfo.name).toBe("Untitled");
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
