import { describe, it, expect, vi } from "vitest";
import StrokeEngine, {
  BEFORE_COMMIT_EVENT,
  STROKE_BEGIN_EVENT,
  STROKE_END_EVENT,
  clipRect,
  unionRect,
  type StrokeCommitDetail,
  type StrokeOptions,
} from "..";
import Layer from "../../../classes/Layer";
import BrushTip from "../../../rendering/BrushTip";
import { SmoothingType } from "../../types";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";

/** Set up an engine, a layer and stroke options with recording canvases */
const setup = (overrides: Partial<StrokeOptions> = {}) => {
  const { factory, created } = createRecordingCanvasFactory();
  const layer = new Layer({ name: "L" }, 100, 100, factory);
  const engine = new StrokeEngine(100, 100, factory);
  const options: StrokeOptions = {
    layer,
    mode: "paint",
    preset: {
      spacing: 5,
      sampleRate: 10,
      smoothingType: SmoothingType.Linear,
      alpha: 0.5,
    },
    size: { width: 4, height: 4 },
    colour: "#ff0000",
    tip: new BrushTip(),
    isPen: false,
    ...overrides,
  };
  // created[0] = layer, created[1] = working (preview), created[2] = buffer
  const canvases = () => ({
    layer: created[0]!,
    working: created[1]!,
    buffer: created[2]!,
  });
  return { engine, layer, options, canvases };
};

/** Count calls by name */
const count = (calls: unknown[][], name: string) =>
  calls.filter(([n]) => n === name).length;

describe("clipRect", () => {
  it("should snap outwards to whole pixels and clip to the canvas", () => {
    expect(
      clipRect({ x: -2.5, y: 1.2, width: 10, height: 3.6 }, 5, 10),
    ).toEqual({ x: 0, y: 1, width: 5, height: 4 });
    expect(
      clipRect({ x: 20, y: 0, width: 5, height: 5 }, 10, 10),
    ).toBeUndefined();
  });
});

describe("unionRect", () => {
  it("should grow a rectangle to include another", () => {
    const b = { x: 20, y: 5, width: 5, height: 5 };
    expect(unionRect(undefined, b)).toBe(b);
    expect(unionRect({ x: 0, y: 0, width: 10, height: 10 }, b)).toEqual({
      x: 0,
      y: 0,
      width: 25,
      height: 10,
    });
  });
});

describe("StrokeEngine", () => {
  it("should start a preview from the layer, stamp the first point and dispatch a change", () => {
    const { engine, options, canvases } = setup();
    const listener = vi.fn();
    engine.addEventListener("change", listener);
    expect(engine.preview).toBeUndefined();
    engine.begin(options, { x: 10, y: 10 }, 0);
    const { working, buffer, layer } = canvases();
    expect(engine.drawing).toBe(true);
    expect(engine.preview).toEqual({
      layer: options.layer,
      image: working.canvas,
    });
    expect(working.calls.slice(0, 3)).toEqual([
      ["set:globalCompositeOperation", "copy"],
      ["drawImage", layer.canvas, 0, 0],
      ["set:globalCompositeOperation", "source-over"],
    ]);
    expect(count(buffer.calls, "ellipse")).toBe(1);
    expect(buffer.calls).toContainEqual(["set:fillStyle", "#ff0000"]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should tell listeners when strokes begin and end, whether committed or cancelled", () => {
    const { engine, options } = setup();
    const events: string[] = [];
    for (const type of [STROKE_BEGIN_EVENT, STROKE_END_EVENT])
      engine.addEventListener(type, () => events.push(type));
    engine.begin(options, { x: 10, y: 10 }, 0);
    // Starting another stroke ends the one in progress
    engine.begin(options, { x: 10, y: 10 }, 0);
    engine.end({ x: 20, y: 10 }, 20);
    engine.begin(options, { x: 10, y: 10 }, 0);
    engine.cancel();
    expect(events).toEqual([
      "strokebegin",
      "strokeend",
      "strokebegin",
      "strokeend",
      "strokebegin",
      "strokeend",
    ]);
  });

  it("should give the area the preview changed since last asked: stamps placed, and strokes cancelled or written", () => {
    const { engine, options } = setup();
    expect(engine.takeChangedArea()).toBeUndefined();
    engine.begin(options, { x: 10, y: 10 }, 0);
    expect(engine.takeChangedArea()).toEqual({
      x: 5,
      y: 5,
      width: 10,
      height: 10,
    });
    expect(engine.takeChangedArea()).toBeUndefined();
    // Only the new stamps changed it
    engine.move({ x: 30, y: 10 }, 20);
    expect(engine.takeChangedArea()).toMatchObject({ x: 10, width: 25 });
    // Writing it into the layer covers the whole stroke
    engine.end({ x: 30, y: 10 }, 40);
    expect(engine.takeChangedArea()).toMatchObject({ x: 5, width: 30 });
    engine.begin(options, { x: 50, y: 50 }, 0);
    engine.takeChangedArea();
    engine.cancel();
    expect(engine.takeChangedArea()).toEqual({
      x: 45,
      y: 45,
      width: 10,
      height: 10,
    });
    // A stroke entirely off the canvas changes nothing
    engine.begin(options, { x: -50, y: -50 }, 0);
    engine.cancel();
    engine.begin(options, { x: -50, y: -50 }, 0);
    engine.end({ x: -50, y: -50 }, 10);
    expect(engine.takeChangedArea()).toBeUndefined();
  });

  it("should stamp along the line at the preset spacing as the pointer moves", () => {
    const { engine, options, canvases } = setup();
    engine.begin(options, { x: 10, y: 10 }, 0);
    engine.move({ x: 30, y: 10 }, 5); // too soon for the sample rate
    engine.move({ x: 30, y: 10 }, 20);
    expect(count(canvases().buffer.calls, "ellipse")).toBe(5);
  });

  it("should merge the buffer into the preview with the stroke opacity, at full strength per stamp", () => {
    const { engine, options, canvases } = setup();
    engine.begin(options, { x: 10, y: 10 }, 0);
    const { working, buffer } = canvases();
    // Stamps use alpha 1; the 0.5 stroke opacity is applied once when merging
    expect(buffer.calls).toContainEqual(["set:globalAlpha", 1]);
    expect(working.calls).toEqual(
      expect.arrayContaining([
        ["clearRect", 5, 5, 10, 10],
        ["set:globalAlpha", 0.5],
        ["set:globalCompositeOperation", "source-over"],
        ["drawImage", buffer.canvas, 5, 5, 10, 10, 5, 5, 10, 10],
      ]),
    );
  });

  it("should write the stroke into the layer on end and clear the buffer", () => {
    const { engine, options, canvases } = setup();
    engine.begin(options, { x: 10, y: 10 }, 0);
    engine.end({ x: 20, y: 10 }, 50);
    const { layer, buffer } = canvases();
    expect(engine.drawing).toBe(false);
    expect(engine.preview).toBeUndefined();
    expect(layer.calls).toEqual(
      expect.arrayContaining([
        ["set:globalAlpha", 0.5],
        ["set:globalCompositeOperation", "source-over"],
        ["drawImage", buffer.canvas, 5, 5, 20, 10, 5, 5, 20, 10],
      ]),
    );
    expect(buffer.calls.at(-1)).toEqual(["clearRect", 5, 5, 20, 10]);
  });

  it("should tell listeners the area a stroke will change, just before writing it", () => {
    const { engine, layer, options, canvases } = setup();
    const details: StrokeCommitDetail[] = [];
    engine.addEventListener(BEFORE_COMMIT_EVENT, (event) => {
      // The layer has not been drawn on yet
      expect(count(canvases().layer.calls, "drawImage")).toBe(0);
      details.push((event as CustomEvent<StrokeCommitDetail>).detail);
    });
    engine.begin(options, { x: 10, y: 10 }, 0);
    engine.end({ x: 20, y: 10 }, 50);
    expect(details).toEqual([
      {
        layer,
        area: { x: 5, y: 5, width: 20, height: 10 },
        stroke: {
          mode: options.mode,
          preset: options.preset,
          size: options.size,
          colour: options.colour,
          isPen: options.isPen,
          seed: expect.any(Number),
          points: [
            { x: 10, y: 10, time: 0 },
            { x: 20, y: 10, time: 50 },
          ],
        },
      },
    ]);
  });

  it("should record every input point, and use the given seed", () => {
    const { engine, options } = setup();
    const details: StrokeCommitDetail[] = [];
    engine.addEventListener(BEFORE_COMMIT_EVENT, (event) =>
      details.push((event as CustomEvent<StrokeCommitDetail>).detail),
    );
    engine.begin({ ...options, seed: 7 }, { x: 10, y: 10, pressure: 0.5 }, 0);
    engine.move({ x: 12, y: 10 }, 1);
    engine.end({ x: 14, y: 10 }, 2);
    expect(details[0]!.stroke.seed).toBe(7);
    expect(details[0]!.stroke.points).toEqual([
      { x: 10, y: 10, pressure: 0.5, time: 0 },
      { x: 12, y: 10, time: 1 },
      { x: 14, y: 10, time: 2 },
    ]);
  });

  it("should tell listeners about eraser strokes with alpha lock, which paint their colour", () => {
    const erase = setup({ mode: "erase", colour: "#ffffff" });
    erase.layer.alphaLock = true;
    const details: StrokeCommitDetail[] = [];
    erase.engine.addEventListener(BEFORE_COMMIT_EVENT, (event) =>
      details.push((event as CustomEvent<StrokeCommitDetail>).detail),
    );
    erase.engine.begin(erase.options, { x: 10, y: 10 }, 0);
    erase.engine.end({ x: 10, y: 10 }, 5);
    expect(details).toHaveLength(1);
    expect(details[0]!.stroke).toMatchObject({
      mode: "erase",
      colour: "#ffffff",
    });
  });

  it("should erase with the buffer's shape", () => {
    const { engine, options, canvases } = setup({ mode: "erase" });
    engine.begin(options, { x: 10, y: 10 }, 0);
    engine.end({ x: 10, y: 10 }, 5);
    const { layer } = canvases();
    expect(layer.calls).toContainEqual([
      "set:globalCompositeOperation",
      "destination-out",
    ]);
  });

  it("should only paint onto existing pixels with alpha lock, with the eraser painting its colour", () => {
    const paint = setup();
    paint.layer.alphaLock = true;
    paint.engine.begin(paint.options, { x: 10, y: 10 }, 0);
    paint.engine.end({ x: 10, y: 10 }, 5);
    expect(paint.canvases().layer.calls).toContainEqual([
      "set:globalCompositeOperation",
      "source-atop",
    ]);

    const erase = setup({ mode: "erase", colour: "#00ff00" });
    erase.layer.alphaLock = true;
    erase.engine.begin(erase.options, { x: 10, y: 10 }, 0);
    erase.engine.end({ x: 10, y: 10 }, 5);
    const { layer, buffer } = erase.canvases();
    expect(buffer.calls).toContainEqual(["set:fillStyle", "#00ff00"]);
    expect(layer.calls).toContainEqual([
      "set:globalCompositeOperation",
      "source-atop",
    ]);
    expect(layer.calls).not.toContainEqual([
      "set:globalCompositeOperation",
      "destination-out",
    ]);
  });

  it("should finish smoothed strokes that lag behind the pointer", () => {
    const { engine, options, canvases } = setup({
      preset: { spacing: 1, smoothingType: SmoothingType.BezierCubic },
    });
    engine.begin(options, { x: 0, y: 0 }, 0);
    engine.move({ x: 10, y: 0 }, 20);
    const before = count(canvases().buffer.calls, "ellipse");
    engine.end({ x: 10, y: 0 }, 30);
    expect(count(canvases().buffer.calls, "ellipse")).toBeGreaterThan(before);
  });

  it("should cancel without changing the layer, and ignore moves when not drawing", () => {
    const { engine, options, canvases } = setup();
    engine.move({ x: 1, y: 1 }, 0);
    engine.end({ x: 1, y: 1 }, 0);
    engine.cancel();
    engine.begin(options, { x: 10, y: 10 }, 0);
    const listener = vi.fn();
    engine.addEventListener("change", listener);
    engine.cancel();
    const { layer, buffer } = canvases();
    expect(engine.drawing).toBe(false);
    expect(count(layer.calls, "drawImage")).toBe(0);
    expect(buffer.calls.at(-1)).toEqual(["clearRect", 5, 5, 10, 10]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should cancel a stroke already in progress when a new one begins", () => {
    const { engine, options } = setup();
    engine.begin(options, { x: 10, y: 10 }, 0);
    const listener = vi.fn();
    engine.addEventListener("change", listener);
    engine.begin(options, { x: 50, y: 50 }, 100);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should ignore stamps entirely outside the canvas", () => {
    const { engine, options, canvases } = setup();
    engine.begin(options, { x: -50, y: -50 }, 0);
    expect(count(canvases().working.calls, "clearRect")).toBe(0);
    engine.end({ x: -50, y: -50 }, 10);
    expect(count(canvases().layer.calls, "drawImage")).toBe(0);
    engine.begin(options, { x: -50, y: -50 }, 20);
    engine.cancel();
    expect(count(canvases().buffer.calls, "clearRect")).toBe(0);
  });

  it("should use full opacity when the preset has no alpha, and clamp it", () => {
    const full = setup({ preset: {} });
    full.engine.begin(full.options, { x: 10, y: 10 }, 0);
    expect(full.canvases().working.calls).toContainEqual([
      "set:globalAlpha",
      1,
    ]);
    const over = setup({ preset: { alpha: 5 } });
    over.engine.begin(over.options, { x: 10, y: 10 }, 0);
    expect(
      over
        .canvases()
        .working.calls.filter(([n]) => n === "set:globalAlpha")
        .at(-1),
    ).toEqual(["set:globalAlpha", 1]);
  });

  it("should create real canvases by default", () => {
    vi.stubGlobal("OffscreenCanvas", class {});
    expect(new StrokeEngine(10, 10).drawing).toBe(false);
    vi.unstubAllGlobals();
  });

  it("should record points and stamps for the debug overlay only when enabled", () => {
    const { engine, options } = setup();
    engine.begin(options, { x: 10, y: 10 }, 0);
    engine.end({ x: 20, y: 10 }, 20);
    expect(engine.debugTrace).toEqual({ points: [], stamps: [] });

    const listener = vi.fn();
    engine.addEventListener("change", listener);
    engine.setDebug(true);
    expect(listener).toHaveBeenCalledOnce();
    engine.begin(options, { x: 10, y: 10 }, 100);
    engine.move({ x: 15, y: 10 }, 120);
    engine.end({ x: 20, y: 10 }, 140);
    expect(engine.debugTrace.points).toEqual([
      { x: 10, y: 10 },
      { x: 15, y: 10 },
      { x: 20, y: 10 },
    ]);
    expect(engine.debugTrace.stamps.map((p) => p.x)).toEqual([10, 15, 20]);

    // The trace is kept until the next stroke starts or debugging is turned off
    engine.begin(options, { x: 50, y: 50 }, 200);
    expect(engine.debugTrace.points).toEqual([{ x: 50, y: 50 }]);
    engine.setDebug(false);
    expect(engine.debugTrace).toEqual({ points: [], stamps: [] });
  });

  it("should stamp on whole pixels when the preset snaps to the pixel grid", () => {
    const { engine, options, canvases } = setup({
      preset: { spacing: 5, snapToPixelGrid: true },
      size: { width: 1.4, height: 1.4 },
    });
    engine.begin(options, { x: 10.7, y: 20.2 }, 0);
    const { buffer, working } = canvases();
    expect(buffer.calls).toContainEqual(["translate", 10.5, 20.5]);
    expect(buffer.calls).toContainEqual([
      "ellipse",
      0,
      0,
      0.5,
      0.5,
      0,
      0,
      Math.PI * 2,
    ]);
    // The changed area is around the snapped stamp
    expect(working.calls).toContainEqual(["clearRect", 7, 17, 7, 7]);
  });

  it("should stamp at the pointer when the preset does not snap", () => {
    const { engine, options, canvases } = setup();
    engine.begin(options, { x: 10.7, y: 20.2 }, 0);
    expect(canvases().buffer.calls).toContainEqual(["translate", 10.7, 20.2]);
  });

  it("should cut the buffer to the mask before merging", () => {
    const mask = { mask: true } as unknown as OffscreenCanvas;
    const { engine, options, canvases } = setup({ mask });
    engine.begin(options, { x: 10, y: 10 }, 0);
    engine.move({ x: 20, y: 10 }, 20);
    // The preview receives the masked copy of the buffer, not the buffer itself
    const working = canvases().working.calls;
    const drawn = working
      .filter(([name]) => name === "drawImage")
      .map(([, source]) => source);
    expect(drawn).not.toContain(canvases().buffer.canvas);
  });
});
