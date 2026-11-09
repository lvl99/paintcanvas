import { describe, it, expect, vi } from "vitest";
import LayerStack, { DEFAULT_MAX_LAYERS as MAX_LAYERS } from "..";
import { BlendMode } from "../../Layer";
import {
  createFakeCanvasFactory,
  fakeContext,
} from "../../../../testing/fakeCanvas";

const createStack = () => new LayerStack(100, 100, createFakeCanvasFactory());
const names = (stack: LayerStack) => stack.layers.map((l) => l.name);

describe("LayerStack", () => {
  it("should start with one selected layer named Layer 1", () => {
    const stack = createStack();
    expect(names(stack)).toEqual(["Layer 1"]);
    expect(stack.active.name).toBe("Layer 1");
    expect(stack.active.width).toBe(100);
  });

  it("should create layers above the active layer and select them", () => {
    const stack = createStack();
    const layer2 = stack.create();
    expect(names(stack)).toEqual(["Layer 2", "Layer 1"]);
    expect(stack.active).toBe(layer2);

    stack.select(stack.layers[1]!.id);
    stack.create();
    expect(names(stack)).toEqual(["Layer 2", "Layer 3", "Layer 1"]);
  });

  it("should replace all layers with new ones, selecting the top one", () => {
    const stack = createStack();
    stack.create();
    const onChange = vi.fn();
    stack.addEventListener("change", onChange);
    const replaced = stack.replace([
      { name: "Sketch" },
      { name: "Background", opacity: 0.5, blendMode: BlendMode.Multiply },
    ]);
    expect(names(stack)).toEqual(["Sketch", "Background"]);
    expect(stack.layers).toEqual(replaced);
    expect(stack.active).toBe(replaced[0]);
    expect(stack.layers[1]).toMatchObject({
      opacity: 0.5,
      blendMode: BlendMode.Multiply,
      width: 100,
    });
    expect(onChange).toHaveBeenCalledOnce();
    // New layers are numbered after the replaced ones
    expect(stack.create().name).toBe("Layer 3");
  });

  it("should not replace layers with none or too many", () => {
    const stack = createStack();
    expect(() => stack.replace([])).toThrow("Cannot have no layers");
    expect(() =>
      stack.replace(
        Array.from({ length: MAX_LAYERS + 1 }, () => ({ name: "L" })),
      ),
    ).toThrow(`Cannot have more than ${MAX_LAYERS} layers`);
    expect(names(stack)).toEqual(["Layer 1"]);
  });

  it("should not exceed the maximum number of layers", () => {
    const stack = createStack();
    for (let i = 1; i < MAX_LAYERS; i++) stack.create();
    expect(stack.canCreate).toBe(false);
    expect(() => stack.create()).toThrow(
      `Cannot have more than ${MAX_LAYERS} layers`,
    );
    expect(() => stack.duplicate(stack.active.id)).toThrow();
  });

  it("should duplicate a layer's settings and image data above it", () => {
    const stack = createStack();
    const original = stack.active;
    stack.update(original.id, { opacity: 0.5, blendMode: BlendMode.Screen });
    stack.create();
    const copy = stack.duplicate(original.id);
    expect(names(stack)).toEqual(["Layer 2", "Layer 1 copy", "Layer 1"]);
    expect(stack.active).toBe(copy);
    expect(copy.opacity).toBe(0.5);
    expect(copy.blendMode).toBe(BlendMode.Screen);
    expect(fakeContext(copy.canvas).drawImage).toHaveBeenCalledWith(
      original.canvas,
      0,
      0,
    );
  });

  it("should merge a layer into the one under it as it looks, as one undoable action", () => {
    const stack = createStack();
    const below = stack.active;
    const layer = stack.create();
    stack.update(layer.id, { opacity: 0.5, blendMode: BlendMode.Multiply });
    const data = new Uint8ClampedArray(100 * 100 * 4);
    data[(20 * 100 + 10) * 4 + 3] = 255;
    data[(30 * 100 + 40) * 4 + 3] = 255;
    fakeContext(layer.canvas).getImageData.mockReturnValueOnce({ data });
    const context = fakeContext(below.canvas) as ReturnType<
      typeof fakeContext
    > & { globalAlpha?: number; globalCompositeOperation?: string };
    const changed = vi.fn();
    stack.addEventListener("change", changed);
    stack.mergeDown(layer.id);
    expect(stack.layers).toEqual([below]);
    expect(stack.active).toBe(below);
    expect(changed).toHaveBeenCalled();
    // Only the area with pixels is drawn, with the layer's opacity and blend mode
    expect(context.drawImage).toHaveBeenLastCalledWith(
      layer.canvas,
      10,
      20,
      31,
      11,
      10,
      20,
      31,
      11,
    );
    expect(context.save).toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalled();
    expect(below.name).toBe("Layer 1");

    // Undo puts the lower layer's pixels and the merged layer back
    context.drawImage.mockClear();
    expect(stack.history.undo()).toBe(true);
    expect(stack.layers).toEqual([layer, below]);
    expect(stack.active).toBe(layer);
    expect(context.clearRect).toHaveBeenLastCalledWith(10, 20, 31, 11);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 10, 20);
    expect(stack.history.redo()).toBe(true);
    expect(stack.layers).toEqual([below]);
  });

  it("should merge an empty layer by deleting it, and only into a visible layer under it", () => {
    const stack = createStack();
    const below = stack.active;
    const layer = stack.create();
    expect(stack.canMergeDown(below.id)).toBe(false);
    stack.update(below.id, { visible: false });
    expect(stack.canMergeDown(layer.id)).toBe(false);
    stack.mergeDown(layer.id);
    expect(stack.layers).toHaveLength(2);
    stack.update(below.id, { visible: true });
    stack.update(layer.id, { visible: false });
    expect(stack.canMergeDown(layer.id)).toBe(false);
    stack.update(layer.id, { visible: true });
    const drawn = fakeContext(below.canvas).drawImage.mock.calls.length;
    stack.mergeDown(layer.id);
    expect(stack.layers).toEqual([below]);
    expect(fakeContext(below.canvas).drawImage.mock.calls.length).toBe(drawn);
    stack.history.undo();
    expect(stack.layers).toEqual([layer, below]);
  });

  it("should say which layer changed while announcing a change to only its pixels", () => {
    const stack = createStack();
    const seen: (string | undefined)[] = [];
    stack.addEventListener("change", () => seen.push(stack.changedLayerId));
    stack.markChanged(stack.active.id);
    stack.create();
    expect(seen).toEqual([stack.layers[1]!.id, undefined]);
    expect(stack.changedLayerId).toBeUndefined();
  });

  it("should clear a layer", () => {
    const stack = createStack();
    stack.clear(stack.active.id);
    expect(fakeContext(stack.active.canvas).clearRect).toHaveBeenCalled();
    // An empty layer has nothing to undo
    expect(stack.history.canUndo).toBe(false);
  });

  it("should undo and redo clearing a layer's pixels, selecting it", () => {
    const stack = createStack();
    const layer = stack.active;
    const context = fakeContext(layer.canvas);
    const data = new Uint8ClampedArray(100 * 100 * 4);
    data[(20 * 100 + 10) * 4 + 3] = 255;
    data[(30 * 100 + 40) * 4 + 3] = 255;
    context.getImageData.mockReturnValueOnce({ data });
    stack.history.untracked(() => stack.create());
    stack.clear(layer.id);
    context.clearRect.mockClear();
    context.drawImage.mockClear();
    expect(stack.history.undo()).toBe(true);
    expect(stack.active).toBe(layer);
    // Only the area that had pixels is swapped
    expect(context.clearRect).toHaveBeenCalledWith(10, 20, 31, 11);
    const [stored, x, y] = context.drawImage.mock.calls[0] as unknown[];
    expect([x, y]).toEqual([10, 20]);
    expect(stored).toMatchObject({ width: 31, height: 11 });
    expect(stack.history.redo()).toBe(true);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
  });

  it("should record image changes as undoable actions", () => {
    const stack = createStack();
    const layer = stack.active;
    const area = { x: 1, y: 2, width: 3, height: 4 };
    const change = vi.fn();
    const onChange = vi.fn();
    stack.addEventListener("change", onChange);
    stack.changeImage(layer.id, area, change);
    expect(change).toHaveBeenCalledWith(layer.context);
    expect(onChange).toHaveBeenCalled();
    expect(stack.history.canUndo).toBe(true);
    const before = { width: 3, height: 4 } as OffscreenCanvas;
    stack.recordImage(layer.id, area, before);
    stack.history.undo();
    expect(fakeContext(layer.canvas).drawImage).toHaveBeenLastCalledWith(
      before,
      1,
      2,
    );
    // Nothing is recorded while undoing or redoing
    stack.history.untracked(() => stack.recordImage(layer.id, area));
    stack.history.undo();
    expect(stack.history.canUndo).toBe(false);
  });

  it("should delete layers and select a neighbour", () => {
    const stack = createStack();
    stack.create();
    stack.create();
    // Order: Layer 3, Layer 2, Layer 1 — delete the active top layer
    stack.remove(stack.active.id);
    expect(names(stack)).toEqual(["Layer 2", "Layer 1"]);
    expect(stack.active.name).toBe("Layer 2");

    // Delete the active bottom layer
    stack.select(stack.layers[1]!.id);
    stack.remove(stack.active.id);
    expect(stack.active.name).toBe("Layer 2");
  });

  it("should keep the active layer when deleting another layer", () => {
    const stack = createStack();
    const top = stack.create();
    stack.remove(stack.layers[1]!.id);
    expect(stack.active).toBe(top);
  });

  it("should not delete the only layer", () => {
    const stack = createStack();
    expect(() => stack.remove(stack.active.id)).toThrow(
      "Cannot delete the only layer",
    );
  });

  it("should reorder layers", () => {
    const stack = createStack();
    stack.create();
    stack.create();
    const [l3, , l1] = stack.layers;
    stack.moveDown(l3!.id);
    expect(names(stack)).toEqual(["Layer 2", "Layer 3", "Layer 1"]);
    stack.moveUp(l1!.id);
    expect(names(stack)).toEqual(["Layer 2", "Layer 1", "Layer 3"]);
    stack.moveToTop(l3!.id);
    expect(names(stack)).toEqual(["Layer 3", "Layer 2", "Layer 1"]);
    stack.moveToBottom(l3!.id);
    expect(names(stack)).toEqual(["Layer 2", "Layer 1", "Layer 3"]);
    stack.move(l3!.id, 1);
    expect(names(stack)).toEqual(["Layer 2", "Layer 3", "Layer 1"]);
  });

  it("should rename and update layers", () => {
    const stack = createStack();
    const id = stack.active.id;
    stack.rename(id, "Ink");
    stack.update(id, { visible: false, alphaLock: true });
    expect(stack.get(id).toConfig()).toMatchObject({
      name: "Ink",
      visible: false,
      alphaLock: true,
    });
  });

  it("should undo and redo creating and duplicating layers, restoring the selection", () => {
    const stack = createStack();
    const first = stack.active;
    const created = stack.create();
    stack.select(first.id);
    const copy = stack.duplicate(first.id);
    expect(names(stack)).toEqual(["Layer 2", "Layer 1 copy", "Layer 1"]);
    stack.select(created.id);
    stack.history.undo();
    expect(names(stack)).toEqual(["Layer 2", "Layer 1"]);
    // The layer selected before duplicating
    expect(stack.active).toBe(first);
    stack.select(created.id);
    stack.history.undo();
    expect(names(stack)).toEqual(["Layer 1"]);
    expect(stack.active).toBe(first);
    stack.history.redo();
    stack.history.redo();
    expect(stack.layers).toEqual([created, copy, first]);
    expect(stack.active).toBe(copy);
  });

  it("should undo and redo deleting a layer, keeping its image data", () => {
    const stack = createStack();
    const first = stack.active;
    const second = stack.create();
    stack.remove(second.id);
    expect(stack.layers).toEqual([first]);
    stack.history.undo();
    expect(stack.layers).toEqual([second, first]);
    expect(stack.active).toBe(second);
    stack.history.redo();
    expect(stack.layers).toEqual([first]);
  });

  it("should undo and redo moving a layer, selecting it", () => {
    const stack = createStack();
    const bottom = stack.active;
    stack.create();
    const top = stack.create();
    stack.moveToBottom(top.id);
    stack.select(bottom.id);
    stack.history.undo();
    expect(stack.indexOf(top.id)).toBe(0);
    expect(stack.active).toBe(top);
    stack.history.redo();
    expect(stack.indexOf(top.id)).toBe(2);
    // Moves that change nothing are not recorded
    stack.moveToBottom(top.id);
    stack.moveUp(stack.layers[0]!.id);
    stack.history.undo();
    expect(stack.indexOf(top.id)).toBe(0);
  });

  it("should undo and redo changes to blend mode and opacity only", () => {
    const stack = createStack();
    const first = stack.active;
    stack.update(first.id, { opacity: 0.4, blendMode: BlendMode.Screen });
    stack.update(first.id, { visible: false, alphaLock: true });
    stack.update(first.id, { opacity: 0.4 });
    const second = stack.create();
    stack.history.undo();
    stack.history.undo();
    expect(stack.active).toBe(first);
    expect(first).toMatchObject({
      opacity: 1,
      blendMode: BlendMode.Normal,
      visible: false,
      alphaLock: true,
    });
    stack.history.redo();
    expect(first).toMatchObject({ opacity: 0.4, blendMode: BlendMode.Screen });
    stack.history.redo();
    expect(stack.active).toBe(second);
    expect(stack.history.canRedo).toBe(false);
  });

  it("should throw for unknown layers", () => {
    expect(() => createStack().select("missing")).toThrow(
      "Layer missing not found",
    );
  });

  it("should dispatch change events", () => {
    const stack = createStack();
    const listener = vi.fn();
    stack.addEventListener("change", listener);
    stack.create();
    stack.select(stack.layers[1]!.id);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should notify when a layer's image changes", () => {
    const stack = createStack();
    const listener = vi.fn();
    stack.addEventListener("change", listener);
    stack.markChanged(stack.active.id);
    expect(listener).toHaveBeenCalledOnce();
    expect(() => stack.markChanged("missing")).toThrow(
      "Layer missing not found",
    );
  });

  it("should allow as many layers as its limit", () => {
    const stack = new LayerStack(10, 10, createFakeCanvasFactory(), 2);
    expect(stack.maxLayers).toBe(2);
    stack.create();
    expect(stack.canCreate).toBe(false);
    expect(() => stack.create()).toThrow("Cannot have more than 2 layers");
  });
});

describe("LayerStack pixel versions", () => {
  it("should count changes to a layer's image data, including undoing and redoing them, but not other changes", () => {
    const stack = createStack();
    const id = stack.active.id;
    const version = () => stack.pixelVersion(id);
    expect(version()).toBe(0);
    stack.markChanged(id);
    expect(version()).toBe(1);
    stack.changeImage(id, { x: 0, y: 0, width: 5, height: 5 }, () => {});
    expect(version()).toBe(2);
    stack.history.undo();
    expect(version()).toBe(3);
    stack.history.redo();
    expect(version()).toBe(4);
    // Renaming or selecting doesn't change pixels
    stack.rename(id, "Sketch");
    stack.select(id);
    expect(version()).toBe(4);
    const above = stack.create();
    expect(stack.pixelVersion(above.id)).toBe(0);
    stack.clear(above.id);
    expect(stack.pixelVersion(above.id)).toBe(1);
  });
});
