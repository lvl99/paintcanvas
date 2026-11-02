import { describe, it, expect, vi, afterEach } from "vitest";
import Layer, {
  BlendMode,
  MAX_LAYER_NAME_LENGTH,
  clampOpacity,
  createOffscreenCanvas,
} from "..";
import {
  createFakeCanvasFactory,
  fakeContext,
} from "../../../../testing/fakeCanvas";

const createCanvas = createFakeCanvasFactory();

describe("clampOpacity", () => {
  it("should clamp to 0–1 and treat NaN as 1", () => {
    expect(clampOpacity(-1)).toBe(0);
    expect(clampOpacity(0.5)).toBe(0.5);
    expect(clampOpacity(2)).toBe(1);
    expect(clampOpacity(Number.NaN)).toBe(1);
  });
});

describe("createOffscreenCanvas", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("should create an OffscreenCanvas of the given size", () => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number,
        ) {}
      },
    );
    expect(createOffscreenCanvas(3, 4)).toMatchObject({ width: 3, height: 4 });
  });
});

describe("Layer", () => {
  it("should use defaults", () => {
    const layer = new Layer({ name: "Layer 1" }, 10, 20, createCanvas);
    expect(layer.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(layer.toConfig()).toEqual({
      id: layer.id,
      name: "Layer 1",
      blendMode: BlendMode.Normal,
      opacity: 1,
      visible: true,
      alphaLock: false,
    });
    expect(layer.canvas).toMatchObject({ width: 10, height: 20 });
  });

  it("should use given settings", () => {
    const layer = new Layer(
      {
        id: "x",
        name: "Ink",
        blendMode: BlendMode.Multiply,
        opacity: 0.5,
        visible: false,
        alphaLock: true,
      },
      10,
      10,
      createCanvas,
    );
    expect(layer.toConfig()).toEqual({
      id: "x",
      name: "Ink",
      blendMode: BlendMode.Multiply,
      opacity: 0.5,
      visible: false,
      alphaLock: true,
    });
  });

  it("should clean names and reject empty names", () => {
    const layer = new Layer({ name: "  Sketch  " }, 1, 1, createCanvas);
    expect(layer.name).toBe("Sketch");
    layer.name = "a".repeat(MAX_LAYER_NAME_LENGTH + 10);
    expect(layer.name).toHaveLength(MAX_LAYER_NAME_LENGTH);
    expect(() => (layer.name = "   ")).toThrow("Layer name cannot be empty");
  });

  it("should clamp opacity", () => {
    const layer = new Layer({ name: "L", opacity: 5 }, 1, 1, createCanvas);
    expect(layer.opacity).toBe(1);
  });

  it("should clear its canvas", () => {
    const layer = new Layer({ name: "L" }, 10, 20, createCanvas);
    layer.clear();
    expect(fakeContext(layer.canvas).clearRect).toHaveBeenCalledWith(
      0,
      0,
      10,
      20,
    );
  });

  it("should copy image data from another layer", () => {
    const source = new Layer({ name: "A" }, 10, 10, createCanvas);
    const target = new Layer({ name: "B" }, 10, 10, createCanvas);
    target.copyImageFrom(source);
    expect(fakeContext(target.canvas).clearRect).toHaveBeenCalled();
    expect(fakeContext(target.canvas).drawImage).toHaveBeenCalledWith(
      source.canvas,
      0,
      0,
    );
  });

  it("should throw if the canvas has no 2D context", () => {
    const layer = new Layer(
      { name: "L" },
      1,
      1,
      createFakeCanvasFactory(false),
    );
    expect(() => layer.clear()).toThrow("Layer canvas has no 2D context");
  });
});
