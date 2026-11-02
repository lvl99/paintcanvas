import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import {
  MAP_REDRAW_INTERVAL,
  MAP_SIZE,
  viewportFrame,
  type PcCanvasMap,
} from "..";
import { CANVAS_BACKGROUND } from "../../../../lib/rendering/compositing";
import {
  createRecordingContext,
  type Recorded,
} from "../../../../testing/recordingContext";
import { DRAWING_PAUSE_MS } from "../../../../lib/classes/BackgroundWork";
import { mount, query } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

/** Mount the map with a recording context and a fixed on-screen position */
const mountMap = async (app = createApp()) => {
  const element = document.createElement("pc-canvas-map") as PcCanvasMap;
  element.pixelRatio = () => 2;
  element.app = app;
  const recordings: Recorded[][] = [];
  // Give every canvas created by the map a recording context before it first draws
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function () {
    const recording = createRecordingContext();
    recordings.push(recording.calls);
    return recording.ctx;
  } as unknown as typeof original;
  document.body.append(element);
  await element.updateComplete;
  HTMLCanvasElement.prototype.getContext = original;
  const canvas = query<HTMLCanvasElement>(element, "canvas");
  canvas.getContext = (() => {
    const recording = createRecordingContext();
    recordings.push(recording.calls);
    return recording.ctx;
  }) as unknown as HTMLCanvasElement["getContext"];
  canvas.setPointerCapture = vi.fn();
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: MAP_SIZE, height: MAP_SIZE }) as DOMRect;
  return { element, app, canvas, recordings };
};

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("viewportFrame", () => {
  it("should convert the visible area to percentages", () => {
    expect(
      viewportFrame({ x: 500, y: 0, width: 1000, height: 1000 }, 2000, 2000),
    ).toEqual({
      left: 25,
      top: 0,
      width: 50,
      height: 50,
    });
  });

  it("should clamp to the canvas", () => {
    expect(
      viewportFrame(
        { x: -500, y: 1500, width: 1000, height: 1000 },
        2000,
        2000,
      ),
    ).toEqual({
      left: 0,
      top: 75,
      width: 25,
      height: 25,
    });
  });
});

describe("pc-canvas-map", () => {
  it("should render a full frame and draw nothing without an app", async () => {
    const element = await mount<PcCanvasMap>("pc-canvas-map");
    expect(query(element, ".frame").getAttribute("style")).toContain(
      "width:100%",
    );
    element.drawThumbnail();
  });

  it("should size itself to the canvas proportions and draw the whole canvas", async () => {
    const app = createApp();
    app.setCanvasSize(2000, 1000);
    const { element, canvas, recordings } = await mountMap(app);
    expect(element.style.width).toBe(`${MAP_SIZE}px`);
    expect(element.style.height).toBe(`${MAP_SIZE / 2}px`);
    expect([canvas.width, canvas.height]).toEqual([MAP_SIZE * 2, MAP_SIZE]);
    expect(recordings[0]).toContainEqual(["set:fillStyle", CANVAS_BACKGROUND]);
  });

  it("should show the visible area as a frame", async () => {
    const app = createApp();
    app.viewport.resize(1000, 1000);
    app.viewport.zoomAt({ x: 0, y: 0 }, 1);
    app.viewport.panBy(-500, 0);
    const { element } = await mountMap(app);
    const style = query(element, ".frame").getAttribute("style");
    expect(style).toContain("left:25%");
    expect(style).toContain("width:50%");
  });

  it("should redraw the thumbnail after layer changes, at most every interval", async () => {
    vi.useFakeTimers();
    const { app, recordings } = await mountMap();
    const before = recordings.length;
    app.layers.create();
    app.layers.create();
    vi.advanceTimersByTime(MAP_REDRAW_INTERVAL);
    expect(recordings.length).toBe(before + 1);
  });

  it("should wait for a pause in drawing to redraw the thumbnail", async () => {
    vi.useFakeTimers();
    const { app, recordings } = await mountMap();
    app.background.now = () => Date.now();
    const before = recordings.length;
    app.background.strokeStarted();
    app.layers.create();
    vi.advanceTimersByTime(MAP_REDRAW_INTERVAL);
    expect(recordings.length).toBe(before);
    app.background.strokeEnded();
    vi.advanceTimersByTime(DRAWING_PAUSE_MS);
    expect(recordings.length).toBe(before + 1);
  });

  it("should redraw the thumbnail when other people draw", async () => {
    vi.useFakeTimers();
    const { app, recordings } = await mountMap();
    const before = recordings.length;
    app.external.dispatchEvent(new Event("change"));
    vi.advanceTimersByTime(MAP_REDRAW_INTERVAL);
    expect(recordings.length).toBe(before + 1);
  });

  it("should not redraw the thumbnail when only the view moves", async () => {
    vi.useFakeTimers();
    const { element, app, recordings } = await mountMap();
    const before = recordings.length;
    app.viewport.panBy(10, 10);
    await element.updateComplete;
    vi.advanceTimersByTime(MAP_REDRAW_INTERVAL);
    expect(recordings.length).toBe(before);
  });

  it("should watch the new layers when the canvas size changes, and stop when removed", async () => {
    vi.useFakeTimers();
    const { element, app, recordings } = await mountMap();
    const oldLayers = app.layers;
    app.setCanvasSize(500, 500);
    await element.updateComplete;
    // Resizing also clears other people's drawings, which redraws once more
    vi.advanceTimersByTime(MAP_REDRAW_INTERVAL);
    const afterResize = recordings.length;
    oldLayers.create();
    vi.advanceTimersByTime(MAP_REDRAW_INTERVAL);
    expect(recordings.length).toBe(afterResize);
    app.layers.create();
    app.external.clear();
    element.remove();
    vi.advanceTimersByTime(MAP_REDRAW_INTERVAL);
    expect(recordings.length).toBe(afterResize);
  });

  it("should skip drawing without a 2D context", async () => {
    const { element, canvas } = await mountMap();
    canvas.getContext = (() =>
      null) as unknown as HTMLCanvasElement["getContext"];
    expect(() => element.drawThumbnail()).not.toThrow();
  });

  it("should move the view to where the map is clicked and dragged", async () => {
    const { app, canvas } = await mountMap();
    app.viewport.resize(1000, 800);
    app.viewport.zoomAt({ x: 0, y: 0 }, 1);
    const centre = () =>
      app.viewport.screenToCanvas({ x: 50 + (1000 - 50 - 375) / 2, y: 400 });
    const pointer = (type: string, x: number, y: number) =>
      Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), {
        pointerId: 1,
      });

    canvas.dispatchEvent(pointer("pointermove", 10, 10));
    canvas.dispatchEvent(pointer("pointerdown", MAP_SIZE / 2, MAP_SIZE / 2));
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
    expect(centre().x).toBeCloseTo(1000);
    canvas.dispatchEvent(pointer("pointermove", MAP_SIZE / 4, MAP_SIZE / 2));
    expect(centre().x).toBeCloseTo(500);
    canvas.dispatchEvent(pointer("pointerup", 0, 0));
    canvas.dispatchEvent(pointer("pointermove", MAP_SIZE, MAP_SIZE / 2));
    expect(centre().x).toBeCloseTo(500);
    canvas.dispatchEvent(pointer("pointerdown", MAP_SIZE / 2, MAP_SIZE / 2));
    canvas.dispatchEvent(pointer("pointercancel", 0, 0));
    canvas.dispatchEvent(pointer("pointermove", MAP_SIZE / 4, MAP_SIZE / 2));
    expect(centre().x).toBeCloseTo(1000);
  });

  it("should ignore map clicks without an app", async () => {
    const element = await mount<PcCanvasMap>("pc-canvas-map");
    const canvas = query<HTMLCanvasElement>(element, "canvas");
    canvas.setPointerCapture = vi.fn();
    expect(() =>
      canvas.dispatchEvent(
        Object.assign(new MouseEvent("pointerdown"), { pointerId: 1 }),
      ),
    ).not.toThrow();
  });

  it("should use the device pixel ratio by default", () => {
    const element = document.createElement("pc-canvas-map") as PcCanvasMap;
    vi.stubGlobal("devicePixelRatio", 2);
    expect(element.pixelRatio()).toBe(2);
    vi.stubGlobal("devicePixelRatio", 0);
    expect(element.pixelRatio()).toBe(1);
  });
});
