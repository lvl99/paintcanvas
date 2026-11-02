import { describe, it, expect, vi } from "vitest";
import PaintCanvas from "..";
import { bytesToBase64, decodeRgbaDeflate } from "../../../image";
import {
  createPatchMessage,
  type CanvasMessage,
  type PatchMessage,
  type StrokeMessage,
} from "../../../messages";
import type { StrokeOptions } from "../../../brushes/StrokeEngine";

const STEP = "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a";

/** Options for a stroke with the canvas's brush on its active layer */
const strokeOptions = (canvas: PaintCanvas): StrokeOptions => ({
  layer: canvas.layers.active,
  mode: "paint",
  preset: canvas.brush.preset,
  size: { width: 6, height: 6 },
  colour: canvas.colour,
  tip: canvas.tips.get(canvas.brush.preset),
  isPen: false,
});

/** Draw a line across the middle of a 40×40 canvas */
const drawLine = (canvas: PaintCanvas) => {
  canvas.strokes.begin(strokeOptions(canvas), { x: 5, y: 20 }, 0);
  canvas.strokes.move({ x: 20, y: 20 }, 10);
  canvas.strokes.end({ x: 35, y: 20 }, 20);
};

/** A 10×10 canvas whose layer has a red pixel at (2, 3) */
const setup = () => {
  const canvas = new PaintCanvas({ width: 10, height: 10 });
  const layer = canvas.layers.active;
  layer.context.fillStyle = "#ff0000";
  layer.context.fillRect(2, 3, 1, 1);
  return { canvas, layer };
};

/** The pixels of a sheet's canvas at a point */
const pixel = (canvas: OffscreenCanvas, x: number, y: number) => [
  ...(
    canvas.getContext("2d") as OffscreenCanvasRenderingContext2D
  ).getImageData(x, y, 1, 1).data,
];

describe("PaintCanvas messages", () => {
  it("should send patches of what changed to every listener while sending", async () => {
    const { canvas, layer } = setup();
    const first: CanvasMessage[] = [];
    const second = vi.fn();
    canvas.onMessage((message) => void first.push(message));
    const stop = canvas.onMessage(second);
    expect(canvas.sending).toBe(false);
    await canvas.sendNow();
    expect(first).toEqual([]);

    canvas.startSending({ delayMs: 0 });
    expect(canvas.sending).toBe(true);
    canvas.layers.markChanged(layer.id);
    await vi.waitFor(() => expect(first).toHaveLength(1));
    const patch = first[0] as PatchMessage;
    expect(patch).toMatchObject({
      protocol: 1,
      type: "patch",
      coords: [2, 3, 3, 4],
      encoding: "rgba-deflate",
    });
    expect([...(await decodeRgbaDeflate(patch.data, patch.coords))]).toEqual([
      255, 0, 0, 255,
    ]);
    expect(second).toHaveBeenCalledWith(patch);

    stop();
    layer.context.fillRect(5, 5, 1, 1);
    await canvas.sendNow();
    expect(first).toHaveLength(2);
    expect(second).toHaveBeenCalledOnce();
  });

  it("should send undelivered changes with the next patch", async () => {
    const { canvas } = setup();
    const sent: CanvasMessage[] = [];
    canvas.onMessage((message) => {
      if (sent.push(message) === 1)
        return Promise.reject(new Error("Not delivered"));
    });
    canvas.startSending();
    await canvas.sendNow().catch(() => undefined);
    await canvas.sendNow();
    expect((sent[1] as PatchMessage).coords).toEqual([2, 3, 3, 4]);
  });

  it("should not send pixels counted as already sent", async () => {
    const { canvas } = setup();
    const listener = vi.fn();
    canvas.onMessage(listener);
    canvas.markSent([2, 3, 3, 4], new Uint8ClampedArray([255, 0, 0, 255]));
    canvas.startSending();
    canvas.markSent([2, 3, 3, 4], new Uint8ClampedArray([255, 0, 0, 255]));
    await canvas.sendNow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("should stop sending when asked or when the canvas size changes", async () => {
    const { canvas, layer } = setup();
    const listener = vi.fn();
    canvas.onMessage(listener);
    canvas.startSending({ delayMs: 0 });
    canvas.stopSending();
    canvas.layers.markChanged(layer.id);
    await canvas.sendNow();
    expect(canvas.sending).toBe(false);

    canvas.startSending();
    canvas.setCanvasSize(20, 20);
    expect(canvas.sending).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("should snapshot the whole drawing, or nothing when nothing is drawn", async () => {
    const { canvas } = setup();
    const snapshot = (await canvas.snapshot()) as PatchMessage;
    expect(snapshot.coords).toEqual([0, 0, 10, 10]);
    const pixels = await decodeRgbaDeflate(snapshot.data, snapshot.coords);
    expect([...pixels.subarray((3 * 10 + 2) * 4, (3 * 10 + 3) * 4)]).toEqual([
      255, 0, 0, 255,
    ]);
    expect(await new PaintCanvas({ width: 5, height: 5 }).snapshot()).toBe(
      undefined,
    );
  });

  it("should draw received patches onto their source's sheet, under the user's layers", async () => {
    const { canvas: sender } = setup();
    const receiver = new PaintCanvas({ width: 10, height: 10 });
    const snapshot = await sender.snapshot();
    expect(await receiver.receive("ann", snapshot)).toBe(true);
    const sheet = receiver.external.sheets[0]!;
    expect(sheet.source).toBe("ann");
    expect(pixel(sheet.canvas, 2, 3)).toEqual([255, 0, 0, 255]);
    expect(receiver.drawables.at(-1)).toBe(sheet);
  });

  it("should ignore invalid messages", async () => {
    const receiver = new PaintCanvas({ width: 10, height: 10 });
    expect(await receiver.receive("ann", { protocol: 1, type: "patch" })).toBe(
      false,
    );
    expect(await receiver.applyPatch(receiver.layers.active.id, {})).toBe(
      false,
    );
    expect(receiver.external.sheets).toEqual([]);
  });

  it("should pass on received undo and redo as history events", async () => {
    const receiver = new PaintCanvas({ width: 10, height: 10 });
    const listener = vi.fn();
    receiver.addEventListener("history", listener);
    const message = { protocol: 1, type: "undo", step: STEP };
    expect(await receiver.receive("ann", message)).toBe(true);
    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      source: "ann",
      message,
    });
  });

  it("should send finished strokes and undo and redo when asked, and draw received strokes", async () => {
    const sender = new PaintCanvas({ width: 40, height: 40 });
    const sent: CanvasMessage[] = [];
    sender.onMessage((message) => void sent.push(message));
    sender.startSending({ strokes: true, patches: false });
    drawLine(sender);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const stroke = sent[0] as StrokeMessage;
    expect(stroke).toMatchObject({
      protocol: 1,
      type: "stroke",
      layer: sender.layers.active.id,
      mode: "paint",
      colour: "#000000",
      isPen: false,
      points: [
        { x: 5, y: 20, time: 0 },
        { x: 20, y: 20, time: 10 },
        { x: 35, y: 20, time: 20 },
      ],
    });
    expect(stroke.step).toBe(sender.history.latestStep);

    sender.undo();
    sender.redo();
    await vi.waitFor(() => expect(sent).toHaveLength(3));
    expect(sent.slice(1)).toEqual([
      { protocol: 1, type: "undo", step: stroke.step },
      { protocol: 1, type: "redo", step: stroke.step },
    ]);
    // Patches weren't asked for
    await sender.sendNow();
    expect(sent).toHaveLength(3);

    const receiver = new PaintCanvas({ width: 40, height: 40 });
    expect(await receiver.receive("ann", stroke)).toBe(true);
    const sheet = receiver.external.sheets[0]!;
    expect(pixel(sheet.canvas, 20, 20)).toEqual(
      pixel(sender.layers.active.canvas, 20, 20),
    );
    expect(pixel(sheet.canvas, 20, 20)[3]).toBeGreaterThan(0);
  });

  it("should send nothing about undo and redo, or strokes, unless sending", async () => {
    const canvas = new PaintCanvas({ width: 40, height: 40 });
    const listener = vi.fn();
    canvas.onMessage(listener);
    drawLine(canvas);
    canvas.undo();
    canvas.startSending();
    drawLine(canvas);
    canvas.stopSending();
    canvas.undo();
    await canvas.sendNow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("should draw a recorded stroke onto the user's layer as an undoable action, without sending it", async () => {
    const source = new PaintCanvas({ width: 40, height: 40 });
    const strokes: StrokeMessage[] = [];
    source.onMessage((message) => void strokes.push(message as StrokeMessage));
    source.startSending({ strokes: true, patches: false });
    drawLine(source);
    await vi.waitFor(() => expect(strokes).toHaveLength(1));

    const canvas = new PaintCanvas({ width: 40, height: 40 });
    const sent = vi.fn();
    canvas.onMessage(sent);
    canvas.startSending({ strokes: true, patches: false });
    const layer = canvas.layers.active;
    expect(canvas.drawStroke("missing", strokes[0]!)).toBe(false);
    expect(canvas.drawStroke(layer.id, { ...strokes[0]!, points: [] })).toBe(
      false,
    );
    expect(canvas.drawStroke(layer.id, strokes[0]!)).toBe(true);
    expect(pixel(layer.canvas, 20, 20)).toEqual(
      pixel(source.layers.active.canvas, 20, 20),
    );
    expect(canvas.history.canUndo).toBe(true);
    expect(sent).not.toHaveBeenCalled();

    // A single point is a dot
    const dot = { ...strokes[0]!, points: [{ x: 10, y: 10, time: 0 }] };
    expect(canvas.drawStroke(layer.id, dot)).toBe(true);
    expect(pixel(layer.canvas, 10, 10)[3]).toBeGreaterThan(0);

    // Not during the user's own stroke
    canvas.strokes.begin(strokeOptions(canvas), { x: 1, y: 1 }, 0);
    expect(canvas.drawStroke(layer.id, strokes[0]!)).toBe(false);
  });

  it("should put a patch's pixels onto the user's layer as an undoable action", async () => {
    const { canvas: source } = setup();
    const patch = (await source.snapshot())!;
    const canvas = new PaintCanvas({ width: 10, height: 10 });
    const layer = canvas.layers.active;
    expect(await canvas.applyPatch("missing", patch)).toBe(false);
    expect(await canvas.applyPatch(layer.id, patch)).toBe(true);
    expect(pixel(layer.canvas, 2, 3)).toEqual([255, 0, 0, 255]);
    canvas.undo();
    expect(pixel(layer.canvas, 2, 3)).toEqual([0, 0, 0, 0]);

    // PNG patches too
    const png = new OffscreenCanvas(1, 1);
    const ctx = png.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(0, 0, 1, 1);
    const bytes = new Uint8Array(
      await (await png.convertToBlob({ type: "image/png" })).arrayBuffer(),
    );
    const pngPatch = createPatchMessage(
      [4, 4, 5, 5],
      "png",
      bytesToBase64(bytes),
    );
    expect(await canvas.applyPatch(layer.id, pngPatch)).toBe(true);
    expect(pixel(layer.canvas, 4, 4)).toEqual([0, 0, 255, 255]);

    // Data that can't be decoded
    expect(
      await canvas.applyPatch(
        layer.id,
        createPatchMessage([0, 0, 1, 1], "rgba-deflate", "AAAA"),
      ),
    ).toBe(false);
  });

  it("should carry on when a listener fails to deliver a stroke or undo", async () => {
    const canvas = new PaintCanvas({ width: 40, height: 40 });
    const listener = vi.fn(() => Promise.reject(new Error("Not delivered")));
    canvas.onMessage(listener);
    canvas.startSending({ strokes: true, patches: false });
    drawLine(canvas);
    canvas.undo();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(canvas.history.canRedo).toBe(true);
  });

  it("should give a stroke drawn while history isn't recording a step of its own", async () => {
    const canvas = new PaintCanvas({ width: 40, height: 40 });
    const sent: CanvasMessage[] = [];
    canvas.onMessage((message) => void sent.push(message));
    canvas.startSending({ strokes: true, patches: false });
    canvas.history.untracked(() => drawLine(canvas));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect((sent[0] as StrokeMessage).step).toMatch(/^[0-9a-f-]{36}$/);
    expect(canvas.history.latestStep).toBeUndefined();
  });
});
