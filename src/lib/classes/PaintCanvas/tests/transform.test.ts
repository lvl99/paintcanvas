import { describe, it, expect, vi } from "vitest";
import PaintCanvas, { Tool } from "..";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";

/** An app whose layers report one opaque pixel at (2, 2) */
const createApp = () => {
  const { factory, created } = createRecordingCanvasFactory();
  const app = new PaintCanvas({
    width: 10,
    height: 10,
    createCanvas: factory,
  });
  const data = new Uint8ClampedArray(10 * 10 * 4);
  data[(2 * 10 + 2) * 4 + 3] = 255;
  const content = (layer: { context: unknown }) =>
    ((layer.context as Record<string, unknown>).getImageData = () => ({
      data,
    }));
  for (const layer of app.layers.layers) content(layer);
  return { app, content, created };
};

/** Give an app a mask covering everything (fake canvases read as empty, so the mask is marked active by hand) */
const fullMask = (app: PaintCanvas) => {
  app.selection.selectAll();
  app.selection.active = true;
  const data = new Uint8ClampedArray(10 * 10 * 4).fill(255);
  (
    app.selection.mask!.getContext("2d") as unknown as Record<string, unknown>
  ).getImageData = () => ({ data });
};

describe("PaintCanvas clipboard", () => {
  it("should only copy masked image data, and not during a stroke or a pending transform", () => {
    const { app } = createApp();
    expect(app.copy()).toBeUndefined();
    app.selection.selectAll();
    // The mask is empty
    expect(app.copy()).toBeUndefined();
    fullMask(app);
    expect(app.copy()).toEqual({ x: 2, y: 2, width: 1, height: 1 });
    // Nothing to copy inside the mask on an empty layer
    const first = app.layers.active;
    app.layers.create();
    expect(app.copy()).toBeUndefined();
    app.layers.select(first.id);
    app.selectTool(Tool.Move);
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    expect(app.copy()).toBeUndefined();
    app.cancelTransform();
    vi.spyOn(app.strokes, "drawing", "get").mockReturnValue(true);
    expect(app.copy()).toBeUndefined();
  });

  it("should copy merged only with masked image data, and not during a stroke or a pending transform", () => {
    const { app } = createApp();
    expect(app.copyMerged()).toBeUndefined();
    vi.spyOn(app.strokes, "drawing", "get").mockReturnValue(true);
    fullMask(app);
    expect(app.copyMerged()).toBeUndefined();
  });

  it("should tell listeners when there's copied image data, and give it as a PNG", async () => {
    const { app } = createApp();
    expect(app.hasClipboard).toBe(false);
    expect(await app.copiedPng()).toBeUndefined();
    fullMask(app);
    const change = vi.fn();
    app.addEventListener("change", change);
    app.copy();
    expect(change).toHaveBeenCalled();
    expect(app.hasClipboard).toBe(true);
    expect((await app.copiedPng())?.type).toBe("image/png");
  });

  it("should put copied image data on the system clipboard as a PNG, ignoring failures", async () => {
    const write = vi.fn().mockRejectedValue(new Error("Not focused"));
    const { factory } = createRecordingCanvasFactory();
    const app = new PaintCanvas({
      width: 10,
      height: 10,
      createCanvas: factory,
      systemClipboard: { write },
    });
    const data = new Uint8ClampedArray(10 * 10 * 4);
    data[(2 * 10 + 2) * 4 + 3] = 255;
    (
      app.layers.active.context as unknown as Record<string, unknown>
    ).getImageData = () => ({ data });
    fullMask(app);
    // Browsers without ClipboardItem don't write
    app.copy();
    expect(write).not.toHaveBeenCalled();
    class FakeClipboardItem {
      constructor(readonly items: Record<string, Promise<Blob>>) {}
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    try {
      app.copy();
      expect(write).toHaveBeenCalledTimes(1);
      const [[item]] = write.mock.calls[0] as [[FakeClipboardItem]];
      expect((await item.items["image/png"])!.type).toBe("image/png");
      // Without a system clipboard, nothing is written
      const without = new PaintCanvas({
        createCanvas: factory,
        systemClipboard: null,
      });
      expect(() => without.copy()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("should paste an image from elsewhere in the middle of the view, shrunk to fit the canvas", () => {
    const { app, created } = createApp();
    const float = vi.spyOn(
      (
        app as unknown as {
          transformer: { float: (...args: unknown[]) => void };
        }
      ).transformer,
      "float",
    );
    vi.spyOn(app.viewport, "visibleRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const before = created.length;
    app.pasteImage({ width: 4, height: 2 } as unknown as ImageBitmap);
    expect(app.tool).toBe(Tool.Move);
    expect(float).toHaveBeenLastCalledWith(
      app.layers.active,
      created[before]!.canvas,
      { x: 3, y: 4, width: 4, height: 2 },
    );
    // Twice the canvas's width: half the size
    app.pasteImage({ width: 20, height: 5 } as unknown as ImageBitmap);
    expect(float.mock.lastCall![2]).toEqual({
      x: 0,
      y: 4,
      width: 10,
      height: 3,
    });
    const shrunk = created.find(
      ({ canvas }) => canvas === float.mock.lastCall![1],
    )!;
    expect(shrunk.calls).toContainEqual([
      "drawImage",
      { width: 20, height: 5 },
      0,
      0,
      10,
      3,
    ]);
    // Not during a stroke
    vi.spyOn(app.strokes, "drawing", "get").mockReturnValue(true);
    float.mockClear();
    app.pasteImage({ width: 4, height: 2 } as unknown as ImageBitmap);
    expect(float).not.toHaveBeenCalled();
  });

  it("should erase cut image data as one undoable action", () => {
    const { app } = createApp();
    app.cut();
    expect(app.history.canUndo).toBe(false);
    fullMask(app);
    const changeImage = vi.spyOn(app.layers, "changeImage");
    app.cut();
    expect(changeImage).toHaveBeenCalledWith(
      app.layers.active.id,
      { x: 2, y: 2, width: 1, height: 1 },
      expect.any(Function),
    );
    expect(app.history.canUndo).toBe(true);
  });

  it("should delete masked image data as one undoable action, without touching the clipboard", () => {
    const { app } = createApp();
    const changeImage = vi.spyOn(app.layers, "changeImage");
    // No mask: nothing to delete
    app.deleteMasked();
    expect(changeImage).not.toHaveBeenCalled();
    fullMask(app);
    app.deleteMasked();
    expect(changeImage).toHaveBeenCalledWith(
      app.layers.active.id,
      { x: 2, y: 2, width: 1, height: 1 },
      expect.any(Function),
    );
    expect(app.history.canUndo).toBe(true);
    app.paste();
    expect(app.transform.pending).toBe(false);
    // Not during a stroke
    changeImage.mockClear();
    vi.spyOn(app.strokes, "drawing", "get").mockReturnValue(true);
    app.deleteMasked();
    expect(changeImage).not.toHaveBeenCalled();
  });

  it("should paint the background colour inside the mask instead of erasing when the layer's alpha lock is on", () => {
    const { app, created } = createApp();
    fullMask(app);
    app.layers.update(app.layers.active.id, { alphaLock: true });
    app.setColour("#00ff00", "background");
    const changeImage = vi.spyOn(app.layers, "changeImage");
    app.deleteMasked();
    // The colour painted, on the canvas made for it
    const painted = () =>
      created.flatMap(({ calls }) =>
        calls.filter(([name]) => name === "set:fillStyle"),
      );
    expect(painted().at(-1)).toEqual(["set:fillStyle", "#00ff00"]);
    // With the background slot selected (the brush colour), the foreground slot is the background colour
    app.selectColour("background");
    app.setColour("#0000ff", "foreground");
    app.deleteMasked();
    expect(painted().at(-1)).toEqual(["set:fillStyle", "#0000ff"]);
    expect(changeImage).toHaveBeenCalledWith(
      app.layers.active.id,
      { x: 2, y: 2, width: 1, height: 1 },
      expect.any(Function),
    );
    const { calls } = created.find(
      ({ canvas }) => canvas === app.layers.active.canvas,
    )!;
    expect(calls).toContainEqual([
      "set:globalCompositeOperation",
      "source-atop",
    ]);
    expect(calls).not.toContainEqual([
      "set:globalCompositeOperation",
      "destination-out",
    ]);
    expect(app.history.canUndo).toBe(true);
  });

  it("should fill the whole layer without a mask, and the mask's bounds with one, as undoable actions", () => {
    const { app, created } = createApp();
    const changeImage = vi.spyOn(app.layers, "changeImage");
    const calls = () =>
      created.find(({ canvas }) => canvas === app.layers.active.canvas)!.calls;
    app.setColour("#ff0000");
    app.fill("foreground");
    expect(changeImage).toHaveBeenLastCalledWith(
      app.layers.active.id,
      { x: 0, y: 0, width: 10, height: 10 },
      expect.any(Function),
    );
    expect(calls()).toContainEqual([
      "set:globalCompositeOperation",
      "source-over",
    ]);
    expect(app.history.canUndo).toBe(true);
    // A mask covering one pixel
    app.selection.selectAll();
    app.selection.active = true;
    const maskData = new Uint8ClampedArray(10 * 10 * 4);
    maskData[(4 * 10 + 5) * 4 + 3] = 128;
    (
      app.selection.mask!.getContext("2d") as unknown as Record<string, unknown>
    ).getImageData = () => ({ data: maskData });
    app.fill("background");
    expect(changeImage).toHaveBeenLastCalledWith(
      app.layers.active.id,
      { x: 5, y: 4, width: 1, height: 1 },
      expect.any(Function),
    );
  });

  it("should only fill the layer's image data when its alpha lock is on", () => {
    const { app, created } = createApp();
    app.layers.update(app.layers.active.id, { alphaLock: true });
    const changeImage = vi.spyOn(app.layers, "changeImage");
    app.fill("foreground");
    expect(changeImage).toHaveBeenCalledWith(
      app.layers.active.id,
      { x: 2, y: 2, width: 1, height: 1 },
      expect.any(Function),
    );
    expect(
      created.find(({ canvas }) => canvas === app.layers.active.canvas)!.calls,
    ).toContainEqual(["set:globalCompositeOperation", "source-atop"]);
    // Nothing to fill inside the mask
    fullMask(app);
    const empty = app.layers.create();
    app.layers.update(empty.id, { alphaLock: true });
    (empty.context as unknown as Record<string, unknown>).getImageData =
      () => ({
        data: new Uint8ClampedArray(10 * 10 * 4),
      });
    changeImage.mockClear();
    app.fill("foreground");
    expect(changeImage).not.toHaveBeenCalled();
  });

  it("should not fill during a stroke or while a transform is pending", () => {
    const { app } = createApp();
    const changeImage = vi.spyOn(app.layers, "changeImage");
    const drawing = vi.spyOn(app.strokes, "drawing", "get");
    drawing.mockReturnValue(true);
    app.fill("foreground");
    drawing.mockRestore();
    app.selectTool(Tool.Move);
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    app.fill("foreground");
    expect(changeImage).not.toHaveBeenCalled();
  });

  it("should paste over the selected layer with the Move tool, keeping it until another tool is selected", () => {
    const { app } = createApp();
    app.paste();
    expect(app.transform.pending).toBe(false);
    fullMask(app);
    app.copy();
    app.paste();
    expect(app.tool).toBe(Tool.Move);
    expect(app.transform.pasting).toBe(true);
    expect(app.transform.layer).toBe(app.layers.active);
    expect(app.transform.box).toMatchObject({ cx: 2.5, cy: 2.5 });
    app.selectTool(Tool.Move);
    expect(app.transform.pasting).toBe(true);
    expect(app.history.canUndo).toBe(false);
    // Switching to another tool applies it
    app.selectTool(Tool.Brush);
    expect(app.transform.pending).toBe(false);
    expect(app.history.canUndo).toBe(true);
  });

  it("should apply a pending paste to its layer when another layer is selected or pasted again", () => {
    const { app } = createApp();
    fullMask(app);
    app.copy();
    app.paste();
    const pasted = app.layers.active;
    const recordImage = vi.spyOn(app.layers, "recordImage");
    app.paste();
    expect(recordImage).toHaveBeenCalledWith(
      pasted.id,
      expect.anything(),
      expect.anything(),
    );
    app.layers.create();
    expect(recordImage).toHaveBeenCalledTimes(2);
    expect(app.transform.pasting).toBe(false);
  });

  it("should discard a paste on Escape or undo, showing the layer's box again", () => {
    const { app } = createApp();
    fullMask(app);
    app.copy();
    app.paste();
    app.transform.setBox({ ...app.transform.box!, cx: 8 });
    app.cancelTransform();
    expect(app.transform.pending).toBe(false);
    expect(app.transform.box).toMatchObject({ cx: 2.5, cy: 2.5 });
    app.paste();
    app.undo();
    expect(app.transform.pending).toBe(false);
    expect(app.history.canUndo).toBe(false);
  });

  it("should not paste during a stroke, or after the canvas is resized", () => {
    const { app } = createApp();
    fullMask(app);
    app.copy();
    const drawing = vi.spyOn(app.strokes, "drawing", "get");
    drawing.mockReturnValue(true);
    app.paste();
    expect(app.transform.pending).toBe(false);
    drawing.mockRestore();
    app.setCanvasSize(10, 10);
    app.paste();
    expect(app.transform.pending).toBe(false);
  });
});

describe("PaintCanvas transforms", () => {
  it("should show the transform box with the Move tool only", () => {
    const { app } = createApp();
    expect(app.transform.active).toBe(false);
    app.selectTool(Tool.Move);
    expect(app.transform.box).toMatchObject({ cx: 2.5, cy: 2.5 });
    expect(app.transform.active).toBe(true);
    const listener = vi.fn();
    app.transform.addEventListener("change", listener);
    app.selectTool(Tool.Brush);
    expect(app.transform.active).toBe(false);
    expect(listener).toHaveBeenCalled();
    app.selectTool(Tool.Zoom);
  });

  it("should apply a transform when switching tools, and keep it while the Move tool is selected again", () => {
    const { app } = createApp();
    app.selectTool(Tool.Move);
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    app.selectTool(Tool.Move);
    expect(app.transform.pending).toBe(true);
    const changed = vi.fn();
    app.layers.addEventListener("change", changed);
    app.selectTool(Tool.Brush);
    expect(app.transform.pending).toBe(false);
    expect(changed).toHaveBeenCalled();
  });

  it("should apply a transform and start a new one when another layer is selected", () => {
    const { app, content } = createApp();
    app.selectTool(Tool.Move);
    const first = app.layers.active;
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    const second = app.layers.create();
    content(second);
    app.layers.select(second.id);
    expect(app.transform.layer).toBe(second);
    expect(app.transform.pending).toBe(false);
    expect(first).not.toBe(second);
  });

  it("should update the box when the mask changes, and move the mask on commit", () => {
    const { app } = createApp();
    app.selectTool(Tool.Move);
    const prepare = vi.spyOn(app.transform, "prepare");
    app.selection.dispatchEvent(new Event("change"));
    expect(prepare).toHaveBeenCalled();
    const moveArea = vi
      .spyOn(app.selection, "moveArea")
      .mockImplementation((_piece, _from, _to, draw) =>
        draw(
          createRecordingCanvasFactory()
            .factory(1, 1)
            .getContext("2d") as OffscreenCanvasRenderingContext2D,
        ),
      );
    vi.spyOn(app.transform, "commit").mockReturnValue({
      maskPiece: {} as OffscreenCanvas,
      source: { x: 0, y: 0, width: 1, height: 1 },
      box: { cx: 1, cy: 1, width: 1, height: 1, rotation: 0 },
      area: { x: 0, y: 0, width: 2, height: 2 },
      before: {} as OffscreenCanvas,
    });
    app.transform.layer = app.layers.active;
    app.commitTransform();
    expect(moveArea).toHaveBeenCalled();
    expect(app.history.canUndo).toBe(true);
  });

  it("should undo and redo actions, cancelling a pending transform instead, and not during a stroke", () => {
    const { app, content } = createApp();
    const first = app.layers.active;
    const second = app.layers.create();
    content(second);
    app.undo();
    expect(app.layers.layers).toEqual([first]);
    app.redo();
    expect(app.layers.active).toBe(second);

    app.selectTool(Tool.Move);
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    const undo = vi.spyOn(app.history, "undo");
    const redo = vi.spyOn(app.history, "redo");
    app.undo();
    expect(app.transform.pending).toBe(false);
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    app.redo();
    expect(app.transform.pending).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();

    vi.spyOn(app.strokes, "drawing", "get").mockReturnValue(true);
    app.undo();
    app.redo();
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it("should cancel a transform", () => {
    const { app } = createApp();
    app.selectTool(Tool.Move);
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    app.cancelTransform();
    expect(app.transform.pending).toBe(false);
    app.commitTransform();
  });

  it("should not apply a transform while a tool is only held (Space to pan)", () => {
    const { app } = createApp();
    app.selectTool(Tool.Move);
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    app.holdTool(Tool.Pan);
    app.releaseHeldTool();
    expect(app.transform.pending).toBe(true);
  });

  it("should keep a pending transform when the same layer's settings change", () => {
    const { app } = createApp();
    app.selectTool(Tool.Move);
    app.transform.setBox({ ...app.transform.box!, cx: 6 });
    app.layers.update(app.layers.active.id, { opacity: 0.5 });
    expect(app.transform.pending).toBe(true);
  });
});
