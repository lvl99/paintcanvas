import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import "..";
import {
  ANTS_INTERVAL,
  CHAT_WIDTH_RATIO,
  PEN_LIFT_GRACE_MS,
  TOOLBAR_WIDTH,
  SAMPLER_HEIGHT,
  SAMPLER_WIDTH,
  TOUCH_SAMPLER_GAP,
  cursorFor,
  interfaceInsets,
  samplerPosition,
  type PcCanvas,
} from "..";
import { Tool } from "../../../../lib/classes/PaintCanvas";
import {
  EYEDROPPER_CURSOR,
  FREEFORM_LASSO_CURSOR,
  POLYGON_LASSO_CURSOR,
  ROTATE_CURSOR,
} from "../../../../lib/rendering/cursors";
import { createRecordingContext } from "../../../../testing/recordingContext";
import { mount } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";

/** Give an element a fixed on-screen size (jsdom has no layout) */
const setSize = (element: HTMLElement, width: number, height: number) => {
  Object.defineProperty(element, "clientWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(element, "clientHeight", {
    value: height,
    configurable: true,
  });
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height }) as DOMRect;
};

/** Create a pointer-like event (jsdom has no PointerEvent) */
const pointer = (
  type: string,
  x: number,
  y: number,
  { pointerId = 1, ...init }: MouseEventInit & { pointerId?: number } = {},
) =>
  Object.assign(
    new MouseEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
    { pointerId },
  );

/** Mount a stage with a size, a recording 2D context and run pending animation frames */
const mountStage = async (app = createApp()) => {
  const element = document.createElement("pc-canvas") as PcCanvas;
  setSize(element, 1000, 800);
  element.pixelRatio = () => 2;
  element.app = app;
  document.body.append(element);
  await element.updateComplete;
  const recording = createRecordingContext();
  element.canvas!.getContext = (() =>
    recording.ctx) as unknown as HTMLCanvasElement["getContext"];
  element.canvas!.setPointerCapture = vi.fn();
  const outlineRecording = createRecordingContext();
  element.outlines!.getContext = (() =>
    outlineRecording.ctx) as unknown as HTMLCanvasElement["getContext"];
  const overlayRecording = createRecordingContext();
  element.overlay!.getContext = (() =>
    overlayRecording.ctx) as unknown as HTMLCanvasElement["getContext"];
  const samplerRecording = createRecordingContext();
  element.sampler!.getContext = (() =>
    samplerRecording.ctx) as unknown as HTMLCanvasElement["getContext"];
  return {
    element,
    app,
    canvas: element.canvas!,
    calls: recording.calls,
    overlayCalls: overlayRecording.calls,
    samplerCalls: samplerRecording.calls,
    outlineCalls: outlineRecording.calls,
  };
};

/** Wait for queued animation frames to run */
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    setTimeout(() => fn(0), 0),
  );
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("interfaceInsets", () => {
  it("should cover the toolbar and chat only when the interface is visible", () => {
    expect(interfaceInsets(1000, true)).toEqual({
      top: 0,
      right: 1000 * CHAT_WIDTH_RATIO,
      bottom: 0,
      left: TOOLBAR_WIDTH,
    });
    expect(interfaceInsets(1000, false)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });
});

describe("samplerPosition", () => {
  it("should put the outlined pixel on a mouse pointer, and the window above a finger, on screen", () => {
    expect(samplerPosition({ x: 100, y: 200 }, false, 1000, 800)).toEqual({
      x: 72.5,
      y: 122.5,
    });
    expect(samplerPosition({ x: 100, y: 200 }, true, 1000, 800)).toEqual({
      x: 100 - SAMPLER_WIDTH / 2,
      y: 200 - TOUCH_SAMPLER_GAP - SAMPLER_HEIGHT,
    });
    expect(samplerPosition({ x: 5, y: 5 }, true, 1000, 800)).toEqual({
      x: 0,
      y: 0,
    });
    expect(samplerPosition({ x: 999, y: 799 }, false, 1000, 800)).toEqual({
      x: 1000 - SAMPLER_WIDTH,
      y: 800 - SAMPLER_HEIGHT,
    });
  });
});

describe("cursorFor", () => {
  it("should pick cursors for pan, zoom and other tools", () => {
    expect(cursorFor(Tool.Pan, { dragging: false, altKey: false })).toBe(
      "grab",
    );
    expect(cursorFor(Tool.Pan, { dragging: true, altKey: false })).toBe(
      "grabbing",
    );
    expect(cursorFor(Tool.Zoom, { dragging: false, altKey: false })).toBe(
      "zoom-in",
    );
    expect(cursorFor(Tool.Zoom, { dragging: false, altKey: true })).toBe(
      "zoom-out",
    );
    expect(
      cursorFor(Tool.ColourSample, { dragging: false, altKey: false }),
    ).toBe(EYEDROPPER_CURSOR);
    expect(cursorFor(Tool.Brush, { dragging: false, altKey: false })).toBe(
      "none",
    );
    expect(cursorFor(Tool.Eraser, { dragging: false, altKey: false })).toBe(
      "none",
    );
    expect(cursorFor(Tool.Move, { dragging: false, altKey: false })).toBe(
      "move",
    );
    expect(
      cursorFor(Tool.PolygonLasso, { dragging: false, altKey: false }),
    ).toBe(POLYGON_LASSO_CURSOR);
    expect(
      cursorFor(Tool.FreeformLasso, { dragging: false, altKey: false }),
    ).toBe(FREEFORM_LASSO_CURSOR);
    expect(
      cursorFor(Tool.RectangleLasso, { dragging: false, altKey: false }),
    ).toBe("crosshair");
  });
});

describe("pc-canvas", () => {
  it("should render nothing to draw without an app", async () => {
    const element = await mount<PcCanvas>("pc-canvas");
    element.syncSize();
    element.draw();
    expect(element.canvas).not.toBeNull();
  });

  it("should size the canvas for the pixel ratio and fit the view once", async () => {
    const { element, app, canvas } = await mountStage();
    element.syncSize();
    expect([canvas.width, canvas.height]).toEqual([2000, 1600]);
    expect([app.viewport.width, app.viewport.height]).toEqual([1000, 800]);
    const fittedZoom = app.viewport.zoom;
    expect(fittedZoom).toBeLessThan(1);

    app.viewport.zoomAt({ x: 0, y: 0 }, 2);
    element.syncSize();
    expect(app.viewport.zoom).toBe(2);
  });

  it("should not fit before the stage has a size", async () => {
    const element = document.createElement("pc-canvas") as PcCanvas;
    setSize(element, 0, 0);
    element.app = createApp();
    document.body.append(element);
    await element.updateComplete;
    expect(element.app.viewport.zoom).toBe(1);
  });

  it("should draw the scene when the app, layers or view change", async () => {
    const { element, app, calls } = await mountStage();
    calls.length = 0;
    app.viewport.panBy(5, 5);
    await element.updateComplete;
    await nextFrame();
    expect(calls.some(([name]) => name === "drawImage")).toBe(true);
    expect(calls).toContainEqual(["fillRect", 0, 0, 2000, 1600]);
  });

  it("should combine repeated draw requests into one frame", async () => {
    const { element } = await mountStage();
    await nextFrame();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
      frames.push(fn),
    );
    element.requestDraw();
    element.requestDraw();
    expect(frames).toHaveLength(1);
    frames[0]!(0);
    element.requestDraw();
    expect(frames).toHaveLength(2);
  });

  it("should skip drawing without a 2D context", async () => {
    const { element, canvas } = await mountStage();
    canvas.getContext = (() =>
      null) as unknown as HTMLCanvasElement["getContext"];
    expect(() => element.draw()).not.toThrow();
  });

  it("should pan by dragging with the pan tool and show grab cursors", async () => {
    const { element, app, canvas } = await mountStage();
    app.selectTool(Tool.Pan);
    await element.updateComplete;
    expect(element.style.cursor).toBe("grab");
    const before = app.viewport.offsetX;

    canvas.dispatchEvent(pointer("pointerdown", 100, 100));
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
    expect(element.style.cursor).toBe("grabbing");
    canvas.dispatchEvent(pointer("pointermove", 130, 110));
    canvas.dispatchEvent(pointer("pointermove", 200, 200, { pointerId: 2 }));
    expect(app.viewport.offsetX).toBeCloseTo(before + 30);
    canvas.dispatchEvent(pointer("pointerup", 130, 110, { pointerId: 2 }));
    expect(element.style.cursor).toBe("grabbing");
    canvas.dispatchEvent(pointer("pointerup", 130, 110));
    expect(element.style.cursor).toBe("grab");
    canvas.dispatchEvent(pointer("pointermove", 300, 300));
    expect(app.viewport.offsetX).toBeCloseTo(before + 30);
  });

  it("should pan while a pan tool is held, and with the middle mouse button", async () => {
    const { app, canvas } = await mountStage();
    const before = app.viewport.offsetY;
    app.holdTool(Tool.Pan);
    canvas.dispatchEvent(pointer("pointerdown", 100, 100));
    canvas.dispatchEvent(pointer("pointermove", 100, 140));
    canvas.dispatchEvent(pointer("pointercancel", 100, 140));
    app.releaseHeldTool();
    canvas.dispatchEvent(pointer("pointerdown", 100, 100, { button: 1 }));
    canvas.dispatchEvent(pointer("pointermove", 100, 120));
    expect(app.viewport.offsetY).toBeCloseTo(before + 60);
  });

  it("should zoom in on click and out on Alt+click with the zoom tool", async () => {
    const { element, app, canvas } = await mountStage();
    app.selectTool(Tool.Zoom);
    await element.updateComplete;
    const fitted = app.viewport.zoom;
    canvas.dispatchEvent(pointer("pointerdown", 500, 400));
    const zoomedIn = app.viewport.zoom;
    expect(zoomedIn).toBeGreaterThan(fitted);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", altKey: true }),
    );
    expect(element.style.cursor).toBe("zoom-out");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", altKey: true }),
    );
    canvas.dispatchEvent(pointer("pointerdown", 500, 400, { altKey: true }));
    expect(app.viewport.zoom).toBeLessThan(zoomedIn);
    window.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Alt", altKey: false }),
    );
    expect(element.style.cursor).toBe("zoom-in");

    canvas.dispatchEvent(pointer("pointerdown", 500, 400, { button: 2 }));
    expect(app.viewport.zoom).toBeLessThan(zoomedIn);
  });

  it("should not pan or zoom with drawing tools, and prevent the context menu", async () => {
    const { app, canvas } = await mountStage();
    app.selectTool(Tool.Move);
    const before = { ...app.viewport };
    canvas.dispatchEvent(pointer("pointerdown", 100, 100));
    canvas.dispatchEvent(pointer("pointermove", 200, 200));
    expect(app.viewport.offsetX).toBe(before.offsetX);
    const menu = new MouseEvent("contextmenu", { cancelable: true });
    canvas.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it("should ignore pointers and keys without an app", async () => {
    const element = await mount<PcCanvas>("pc-canvas");
    element.canvas!.dispatchEvent(pointer("pointerdown", 1, 1));
    element.canvas!.dispatchEvent(pointer("pointermove", 2, 2));
    element.canvas!.dispatchEvent(pointer("pointerup", 2, 2));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", altKey: true }),
    );
    expect(element.style.cursor).toBe("");
  });

  it("should observe its size and stop listening when removed", async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let onResize = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
        constructor(callback: () => void) {
          onResize = callback;
        }
      },
    );
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const { element } = await mountStage();
    expect(observe).toHaveBeenCalledWith(element);
    setSize(element, 500, 400);
    onResize();
    expect(element.app?.viewport.width).toBe(500);
    element.remove();
    expect(disconnect).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it("should use the device pixel ratio by default", () => {
    const element = document.createElement("pc-canvas") as PcCanvas;
    vi.stubGlobal("devicePixelRatio", 3);
    expect(element.pixelRatio()).toBe(3);
    vi.stubGlobal("devicePixelRatio", 0);
    expect(element.pixelRatio()).toBe(1);
  });

  it("should draw a brush stroke on the active layer and mark it changed", async () => {
    const { element, app, canvas } = await mountStage();
    app.viewport.zoomAt({ x: 0, y: 0 }, 1);
    app.viewport.panBy(-app.viewport.offsetX, -app.viewport.offsetY);
    const begin = vi.spyOn(app.strokes, "begin");
    const move = vi.spyOn(app.strokes, "move");
    const end = vi.spyOn(app.strokes, "end");
    const changed = vi.fn();
    app.layers.addEventListener("change", changed);

    canvas.dispatchEvent(pointer("pointerdown", 10, 20));
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
    expect(begin).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: app.layers.active,
        mode: "paint",
        preset: app.brush.preset,
        size: { width: app.brush.width, height: app.brush.height },
        colour: app.colour,
        isPen: false,
      }),
      { x: 10, y: 20 },
      expect.any(Number),
    );
    canvas.dispatchEvent(pointer("pointermove", 30, 20));
    canvas.dispatchEvent(pointer("pointermove", 40, 20, { pointerId: 2 }));
    expect(move).toHaveBeenCalledTimes(1);
    canvas.dispatchEvent(pointer("pointerup", 30, 20, { pointerId: 2 }));
    expect(end).not.toHaveBeenCalled();
    canvas.dispatchEvent(pointer("pointerup", 30, 20));
    expect(end).toHaveBeenCalledWith({ x: 30, y: 20 }, expect.any(Number));
    expect(changed).toHaveBeenCalled();
    await element.updateComplete;
  });

  it("should erase with the eraser tool", async () => {
    const { app, canvas } = await mountStage();
    app.selectTool(Tool.Eraser);
    const begin = vi.spyOn(app.strokes, "begin");
    canvas.dispatchEvent(pointer("pointerdown", 10, 20));
    expect(begin.mock.calls[0]![0]).toMatchObject({
      mode: "erase",
      preset: app.eraser.preset,
    });
  });

  it("should use every coalesced pointer event, and pen pressure and tilt", async () => {
    const { app, canvas } = await mountStage();
    app.viewport.zoomAt({ x: 0, y: 0 }, 1);
    app.viewport.panBy(-app.viewport.offsetX, -app.viewport.offsetY);
    const begin = vi.spyOn(app.strokes, "begin");
    const move = vi.spyOn(app.strokes, "move");
    const pen = { pointerType: "pen", pressure: 0.3, tiltX: 10, tiltY: -20 };
    canvas.dispatchEvent(Object.assign(pointer("pointerdown", 5, 5), pen));
    expect(begin.mock.calls[0]![0].isPen).toBe(true);
    expect(begin.mock.calls[0]![1]).toEqual({
      x: 5,
      y: 5,
      pressure: 0.3,
      tiltX: 10,
      tiltY: -20,
    });
    const coalesced = [
      Object.assign(pointer("pointermove", 6, 5), pen),
      Object.assign(pointer("pointermove", 7, 5), pen),
    ];
    canvas.dispatchEvent(
      Object.assign(pointer("pointermove", 7, 5), {
        getCoalescedEvents: () => coalesced,
      }),
    );
    expect(move).toHaveBeenCalledTimes(2);
    canvas.dispatchEvent(
      Object.assign(pointer("pointermove", 8, 5), {
        getCoalescedEvents: () => [],
      }),
    );
    expect(move).toHaveBeenCalledTimes(3);
  });

  it("should not draw on hidden layers or with other buttons", async () => {
    const { app, canvas } = await mountStage();
    const begin = vi.spyOn(app.strokes, "begin");
    canvas.dispatchEvent(pointer("pointerdown", 10, 10, { button: 2 }));
    app.layers.update(app.layers.active.id, { visible: false });
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    expect(begin).not.toHaveBeenCalled();
  });

  it("should cancel the stroke when the pointer is cancelled", async () => {
    const { app, canvas } = await mountStage();
    const cancel = vi.spyOn(app.strokes, "cancel");
    canvas.dispatchEvent(pointer("pointercancel", 10, 10));
    expect(cancel).not.toHaveBeenCalled();
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    canvas.dispatchEvent(pointer("pointercancel", 10, 10));
    expect(cancel).toHaveBeenCalled();
    expect(app.strokes.drawing).toBe(false);
  });

  it("should log strokes started, ended, cancelled and ignored, with timings", async () => {
    const { element, app, canvas } = await mountStage();
    app.showDebugLog(true);
    const log = app.strokeLog;
    const mouse = { pointerType: "mouse" };
    const pen = { pointerType: "pen" };
    canvas.dispatchEvent(Object.assign(pointer("pointerdown", 10, 10), pen));
    canvas.dispatchEvent(
      Object.assign(pointer("pointermove", 20, 10), {
        ...pen,
        getCoalescedEvents: () => [
          Object.assign(pointer("pointermove", 15, 10), pen),
          Object.assign(pointer("pointermove", 20, 10), pen),
        ],
      }),
    );
    element.draw();
    canvas.dispatchEvent(Object.assign(pointer("pointerup", 20, 10), pen));
    // Another pointer starting a stroke cancels the one in progress
    canvas.dispatchEvent(Object.assign(pointer("pointerdown", 10, 10), pen));
    canvas.dispatchEvent(
      Object.assign(pointer("pointerdown", 10, 10, { pointerId: 2 }), mouse),
    );
    canvas.dispatchEvent(
      Object.assign(pointer("pointercancel", 10, 10, { pointerId: 2 }), mouse),
    );
    canvas.dispatchEvent(
      Object.assign(pointer("pointerdown", 10, 10, { button: 2 }), mouse),
    );
    app.layers.update(app.layers.active.id, { visible: false });
    canvas.dispatchEvent(Object.assign(pointer("pointerdown", 10, 10), mouse));
    expect(log.entries.map(({ kind, detail }) => `${kind} ${detail}`)).toEqual([
      "start pen",
      "end pen",
      "start pen",
      "cancel pen: a mouse started another stroke",
      "start mouse",
      "cancel mouse: the browser cancelled the pointer",
      "ignore mouse: button 2",
      "ignore mouse: the layer is hidden",
    ]);
    expect(log.entries[1]!.measures).toMatchObject({
      moves: 1,
      frames: 1,
      layers: 1,
      zoomPct: Math.round(app.viewport.zoom * 1000) / 10,
    });
  });

  it("should log touches that are part of a gesture, strokes they cancel, and the actions gestures do", async () => {
    const { app, canvas } = await mountStage();
    app.showDebugLog(true);
    vi.spyOn(app, "undo").mockImplementation(() => undefined);
    const touch = (type: string, id: number) =>
      Object.assign(pointer(type, 100 * id, 100, { pointerId: id }), {
        pointerType: "touch",
      });
    canvas.dispatchEvent(touch("pointerdown", 1));
    canvas.dispatchEvent(touch("pointerdown", 2));
    canvas.dispatchEvent(touch("pointerup", 1));
    canvas.dispatchEvent(touch("pointerup", 2));
    // Navigating with two fingers doesn't log ignored strokes for other tools
    app.selectTool(Tool.Pan);
    canvas.dispatchEvent(touch("pointerdown", 1));
    canvas.dispatchEvent(touch("pointerdown", 2));
    expect(
      app.strokeLog.entries.map(({ kind, detail }) => `${kind} ${detail}`),
    ).toEqual([
      "start touch",
      "cancel touch: a second finger touched",
      "ignore touch: part of a 2-finger gesture",
      "gesture tap2: undo",
    ]);
  });

  it("should redraw with the stroke preview while drawing, before the pointer is released", async () => {
    const { element, app, canvas, calls } = await mountStage();
    // Let any redraw from mounting finish first
    await element.updateComplete;
    await nextFrame();
    canvas.dispatchEvent(pointer("pointerdown", 500, 400));
    calls.length = 0;
    await element.updateComplete;
    await nextFrame();
    /** The areas of the preview drawn (source x, y, width and height) */
    const previewAreas = () =>
      calls
        .filter(
          ([name, image]) =>
            name === "drawImage" && image === app.strokes.preview?.image,
        )
        .map((call) => call.slice(2, 6));
    // Only the area the stroke changed is redrawn, not the whole preview
    expect(calls).toContainEqual(["clip"]);
    expect(previewAreas()).toHaveLength(1);
    expect(previewAreas()[0]![2]).toBeLessThan(app.width);

    // Each move that places stamps redraws again (after the preset's sample rate has passed)
    await new Promise((resolve) =>
      setTimeout(resolve, app.brush.preset.sampleRate ?? 10),
    );
    calls.length = 0;
    canvas.dispatchEvent(pointer("pointermove", 560, 400));
    await element.updateComplete;
    await nextFrame();
    expect(previewAreas()).toHaveLength(1);

    // Moving the view while drawing redraws everything
    calls.length = 0;
    app.viewport.panBy(5, 0);
    canvas.dispatchEvent(pointer("pointermove", 600, 400));
    await element.updateComplete;
    await nextFrame();
    expect(calls).toContainEqual([
      "drawImage",
      app.strokes.preview!.image,
      0,
      0,
    ]);

    // Finishing the stroke redraws only its area: the screen already shows it
    calls.length = 0;
    canvas.dispatchEvent(pointer("pointerup", 600, 400));
    await element.updateComplete;
    await nextFrame();
    expect(calls).toContainEqual(["clip"]);
    expect(
      calls.filter(
        ([name, , x, y]) => name === "drawImage" && x === 0 && y === 0,
      ),
    ).toHaveLength(0);
  });

  it("should redraw everything when a stroke changes nothing it can show, or the stage resizes", async () => {
    const { element, app, canvas, calls } = await mountStage();
    await element.updateComplete;
    await nextFrame();
    calls.length = 0;
    // Toggling the stroke debug trace changes the engine without an area
    app.strokes.setDebug(true);
    await element.updateComplete;
    await nextFrame();
    expect(calls).not.toContainEqual(["clip"]);
    expect(calls).toContainEqual(["fillRect", 0, 0, 2000, 1600]);
    // A stroke started, then the stage resized: everything again
    canvas.dispatchEvent(pointer("pointerdown", 500, 400));
    Object.defineProperty(element, "clientWidth", {
      value: 900,
      configurable: true,
    });
    calls.length = 0;
    element.requestUpdate();
    await element.updateComplete;
    await nextFrame();
    expect(calls).toContainEqual(["fillRect", 0, 0, 1800, 1600]);
    expect(calls).not.toContainEqual(["clip"]);
  });

  it("should redraw when a brush shape finishes loading", async () => {
    const { element, app, calls } = await mountStage();
    await element.updateComplete;
    await nextFrame();
    calls.length = 0;
    app.tips.dispatchEvent(new Event("change"));
    await element.updateComplete;
    await nextFrame();
    expect(calls.length).toBeGreaterThan(0);
  });

  it("should draw the brush outline at the pointer, scaled by zoom, and hide it when the pointer leaves", async () => {
    const { app, canvas, overlayCalls } = await mountStage();
    app.viewport.zoomAt({ x: 0, y: 0 }, 2);
    app.brush.select("round10");
    canvas.dispatchEvent(pointer("pointermove", 100, 50));
    await nextFrame();
    expect(overlayCalls).toContainEqual(["translate", 200, 100]);
    expect(overlayCalls).toContainEqual([
      "ellipse",
      0,
      0,
      20,
      20,
      0,
      0,
      Math.PI * 2,
    ]);
    overlayCalls.length = 0;
    canvas.dispatchEvent(new MouseEvent("pointerleave"));
    expect(overlayCalls).toEqual([["clearRect", 0, 0, 2000, 1600]]);
  });

  it("should redraw the brush and eraser outlines when their size changes, without the pointer moving", async () => {
    const { element, app, canvas, overlayCalls } = await mountStage();
    /** The outline's radius in the latest overlay drawing */
    const radius = () =>
      [...overlayCalls]
        .reverse()
        .find(([name]) => name === "ellipse")?.[3] as number;
    /** Change the settings, then wait for the next drawing */
    const resize = async (change: () => void) => {
      overlayCalls.length = 0;
      change();
      await element.updateComplete;
      await nextFrame();
    };
    await resize(() => {
      app.brush.select("round10");
      app.brush.setSize(40);
      canvas.dispatchEvent(pointer("pointermove", 100, 50));
    });
    const before = radius();
    expect(before).toBeGreaterThan(0);
    await resize(() => app.brush.setSize(80));
    expect(radius()).toBeCloseTo(before * 2, 0);
    app.selectTool(Tool.Eraser);
    await resize(() => app.eraser.setSize(40));
    const eraser = radius();
    await resize(() => app.eraser.setSize(80));
    expect(radius()).toBeCloseTo(eraser * 2, 0);
  });

  it("should draw the outline over the pixels a stamp will cover for presets that snap to the pixel grid", async () => {
    const { app, canvas, overlayCalls } = await mountStage();
    app.viewport.zoomAt({ x: 0, y: 0 }, 10);
    app.viewport.panBy(-app.viewport.offsetX, -app.viewport.offsetY);
    app.brush.select("square1");
    // Canvas point (10.7, 5.3) is in the pixel at (10, 5), whose centre is (10.5, 5.5)
    canvas.dispatchEvent(pointer("pointermove", 107, 53));
    await nextFrame();
    expect(overlayCalls).toContainEqual(["translate", 210, 110]);
    overlayCalls.length = 0;
    app.brush.select("round1");
    canvas.dispatchEvent(pointer("pointermove", 107, 53));
    // Changing the brush redraws, which draws the cursor
    await nextFrame();
    await nextFrame();
    expect(overlayCalls).toContainEqual(["translate", 214, 106]);
  });

  it("should draw the brush cursor once per frame however many times the pointer moves, counting it for the stroke", async () => {
    const { element, app, canvas, overlayCalls } = await mountStage();
    await element.updateComplete;
    await nextFrame();
    app.showDebugLog(true);
    canvas.dispatchEvent(pointer("pointerdown", 100, 100));
    await element.updateComplete;
    await nextFrame();
    overlayCalls.length = 0;
    for (let x = 101; x < 110; x++)
      canvas.dispatchEvent(pointer("pointermove", x, 100));
    expect(overlayCalls).toHaveLength(0);
    await element.updateComplete;
    await nextFrame();
    // A redraw draws the cursor too, so a cursor-only frame asked for just before it doesn't draw it again
    overlayCalls.length = 0;
    element.requestOverlay();
    element.requestDraw();
    await nextFrame();
    await nextFrame();
    expect(overlayCalls.filter(([name]) => name === "clearRect")).toHaveLength(
      1,
    );
    canvas.dispatchEvent(pointer("pointerup", 110, 100));
    expect(app.strokeLog.entries.at(-1)!.measures.overlays).toBeGreaterThan(0);
    // Removing the stage forgets a cursor frame waiting to be drawn
    canvas.dispatchEvent(pointer("pointermove", 111, 100));
    element.remove();
    await nextFrame();
  });

  it("should not draw the brush outline for other tools or while panning", async () => {
    const { app, canvas, overlayCalls } = await mountStage();
    app.selectTool(Tool.Zoom);
    canvas.dispatchEvent(pointer("pointermove", 100, 50));
    expect(overlayCalls.some(([name]) => name === "ellipse")).toBe(false);
    app.selectTool(Tool.Brush);
    canvas.dispatchEvent(pointer("pointerdown", 100, 50, { button: 1 }));
    overlayCalls.length = 0;
    canvas.dispatchEvent(pointer("pointermove", 110, 50));
    expect(overlayCalls.some(([name]) => name === "ellipse")).toBe(false);
  });

  it("should skip the overlay without a 2D context", async () => {
    const { element } = await mountStage();
    element.overlay!.getContext = (() =>
      null) as unknown as HTMLCanvasElement["getContext"];
    expect(() => element.drawOverlay()).not.toThrow();
  });

  it("should draw the stroke debug trace when enabled", async () => {
    const { app, canvas, overlayCalls } = await mountStage();
    app.strokes.setDebug(true);
    canvas.dispatchEvent(pointer("pointerdown", 100, 100));
    canvas.dispatchEvent(pointer("pointerup", 100, 100));
    overlayCalls.length = 0;
    canvas.dispatchEvent(pointer("pointermove", 120, 100));
    await nextFrame();
    expect(overlayCalls.filter(([name]) => name === "fillRect")).toHaveLength(
      1,
    );
    expect(overlayCalls.filter(([name]) => name === "arc")).toHaveLength(1);
  });

  it("should build mask shapes with the lasso tools", async () => {
    const { element, app, canvas } = await mountStage();
    app.viewport.zoomAt({ x: 0, y: 0 }, 1);
    app.viewport.panBy(-app.viewport.offsetX, -app.viewport.offsetY);
    const applyLasso = vi.spyOn(app, "applyLasso");
    app.selectTool(Tool.RectangleLasso);
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    expect(canvas.setPointerCapture).toHaveBeenCalled();
    canvas.dispatchEvent(pointer("pointermove", 40, 30));
    canvas.dispatchEvent(pointer("pointerup", 40, 30));
    expect(applyLasso).toHaveBeenLastCalledWith({
      shape: { type: "rect", rect: { x: 10, y: 10, width: 30, height: 20 } },
      mode: "replace",
    });
    await element.updateComplete;
  });

  it("should add polygon nodes, close on the first node, and close on double-click", async () => {
    const { app, canvas } = await mountStage();
    app.viewport.zoomAt({ x: 0, y: 0 }, 1);
    app.viewport.panBy(-app.viewport.offsetX, -app.viewport.offsetY);
    const applyLasso = vi.spyOn(app, "applyLasso");
    app.selectTool(Tool.PolygonLasso);
    for (const [x, y] of [
      [0, 0],
      [50, 0],
      [50, 50],
    ]) {
      canvas.dispatchEvent(pointer("pointermove", x!, y!));
      canvas.dispatchEvent(pointer("pointerdown", x!, y!));
      canvas.dispatchEvent(pointer("pointerup", x!, y!));
    }
    canvas.dispatchEvent(pointer("pointermove", 3, 3));
    canvas.dispatchEvent(pointer("pointerdown", 3, 3));
    expect(applyLasso).toHaveBeenLastCalledWith({
      shape: {
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
        ],
      },
      mode: "replace",
    });
    canvas.dispatchEvent(pointer("pointerdown", 0, 0));
    canvas.dispatchEvent(new MouseEvent("dblclick"));
    expect(app.lasso.active).toBe(false);
  });

  it("should draw the mask outline, the lasso in progress, and animate the ants while a mask exists", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { element, app, canvas, outlineCalls } = await mountStage();
    app.selection.active = true;
    app.selection.outline = [[0, 0, 10, 0, 0, 0]];
    app.selection.dispatchEvent(new Event("change"));
    await element.updateComplete;
    outlineCalls.length = 0;
    vi.advanceTimersByTime(ANTS_INTERVAL);
    expect(outlineCalls.some(([name]) => name === "setLineDash")).toBe(true);
    const dashOffsets = () =>
      outlineCalls
        .filter(([name]) => name === "set:lineDashOffset")
        .map(([, value]) => value);
    vi.advanceTimersByTime(ANTS_INTERVAL);
    expect(new Set(dashOffsets()).size).toBeGreaterThanOrEqual(2);

    app.selectTool(Tool.RectangleLasso);
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    outlineCalls.length = 0;
    canvas.dispatchEvent(pointer("pointermove", 40, 30));
    await nextFrame();
    expect(outlineCalls.some(([name]) => name === "rect")).toBe(true);

    app.selection.active = false;
    app.selection.dispatchEvent(new Event("change"));
    await element.updateComplete;
    outlineCalls.length = 0;
    vi.advanceTimersByTime(ANTS_INTERVAL * 3);
    expect(outlineCalls).toEqual([]);
    vi.useRealTimers();
  });

  it("should limit strokes to the active mask", async () => {
    const { app, canvas } = await mountStage();
    const mask = {} as OffscreenCanvas;
    Object.defineProperty(app.selection, "mask", { get: () => mask });
    const begin = vi.spyOn(app.strokes, "begin");
    canvas.dispatchEvent(pointer("pointerdown", 10, 10));
    expect(begin.mock.calls[0]![0].mask).toBe(mask);
  });

  it("should stop the ants when removed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { element, app, overlayCalls } = await mountStage();
    app.selection.active = true;
    app.selection.dispatchEvent(new Event("change"));
    await element.updateComplete;
    element.remove();
    overlayCalls.length = 0;
    vi.advanceTimersByTime(ANTS_INTERVAL * 3);
    expect(overlayCalls).toEqual([]);
    vi.useRealTimers();
  });

  it("should skip outlines without a 2D context", async () => {
    const { element, app } = await mountStage();
    element.outlines!.getContext = (() =>
      null) as unknown as HTMLCanvasElement["getContext"];
    app.selection.active = true;
    expect(() => element.drawOverlay()).not.toThrow();
  });

  it("should move, scale and rotate the transform box by dragging", async () => {
    const { element, app, canvas, outlineCalls } = await mountStage();
    app.viewport.zoomAt({ x: 0, y: 0 }, 1);
    app.viewport.panBy(-app.viewport.offsetX, -app.viewport.offsetY);
    const box = { cx: 50, cy: 50, width: 40, height: 20, rotation: 0 };
    Object.assign(app.transform, {
      box,
      source: { x: 30, y: 40, width: 40, height: 20 },
    });
    const setBox = vi
      .spyOn(app.transform, "setBox")
      .mockImplementation((next) => void (app.transform.box = next));
    app.selectTool(Tool.Move);
    Object.assign(app.transform, {
      box,
      source: { x: 30, y: 40, width: 40, height: 20 },
    });
    await element.updateComplete;
    element.drawOverlay();
    expect(
      outlineCalls.filter(([name]) => name === "fillRect").length,
    ).toBeGreaterThanOrEqual(8);

    // The round rotate handle
    expect(outlineCalls.some(([name]) => name === "ellipse")).toBe(true);

    // Hover cursors: rotate handle, each scale handle, inside, outside
    canvas.dispatchEvent(pointer("pointermove", 50, 16));
    expect(element.style.cursor).toBe(ROTATE_CURSOR);
    for (const [x, y, cursor] of [
      [50, 40, "ns-resize"],
      [50, 60, "ns-resize"],
      [30, 50, "ew-resize"],
      [70, 50, "ew-resize"],
      [30, 40, "nwse-resize"],
      [70, 60, "nwse-resize"],
      [70, 40, "nesw-resize"],
      [30, 60, "nesw-resize"],
    ] as const) {
      canvas.dispatchEvent(pointer("pointermove", x, y));
      expect(element.style.cursor, `${x},${y}`).toBe(cursor);
    }
    canvas.dispatchEvent(pointer("pointermove", 50, 50));
    expect(element.style.cursor).toBe("move");
    canvas.dispatchEvent(pointer("pointermove", 200, 200));
    expect(element.style.cursor).toBe("default");

    // Move
    canvas.dispatchEvent(pointer("pointerdown", 50, 50));
    canvas.dispatchEvent(pointer("pointermove", 60, 55));
    expect(setBox).toHaveBeenLastCalledWith({ ...box, cx: 60, cy: 55 });
    canvas.dispatchEvent(pointer("pointermove", 60, 55, { pointerId: 2 }));
    canvas.dispatchEvent(pointer("pointerup", 60, 55));

    // Scale from the right edge handle: freely, as "Constrain proportions" is off by default
    app.transform.box = box;
    expect(app.constrainProportions).toBe(false);
    canvas.dispatchEvent(pointer("pointerdown", 70, 50));
    canvas.dispatchEvent(pointer("pointermove", 90, 50));
    expect(setBox).toHaveBeenLastCalledWith({ ...box, cx: 60, width: 60 });
    // Holding Shift turns it on, in proportion, straight away and while dragging
    window.dispatchEvent(new KeyboardEvent("keydown", { shiftKey: true }));
    expect(app.constrainProportions).toBe(true);
    expect(setBox.mock.lastCall![0].height).toBe(30);
    canvas.dispatchEvent(pointer("pointermove", 90, 50, { shiftKey: true }));
    expect(setBox.mock.lastCall![0].height).toBe(30);
    // Alt does nothing when it was off
    canvas.dispatchEvent(
      pointer("pointermove", 90, 50, { shiftKey: true, altKey: true }),
    );
    expect(app.constrainProportions).toBe(true);
    // Releasing Shift turns it off again
    window.dispatchEvent(new KeyboardEvent("keyup", { shiftKey: false }));
    expect(app.constrainProportions).toBe(false);
    expect(setBox).toHaveBeenLastCalledWith({ ...box, cx: 60, width: 60 });
    // Ending the drag with Shift still held puts it back as it was
    canvas.dispatchEvent(pointer("pointermove", 90, 50, { shiftKey: true }));
    expect(app.constrainProportions).toBe(true);
    canvas.dispatchEvent(pointer("pointercancel", 90, 50));
    expect(app.constrainProportions).toBe(false);

    // When on: in proportion, and holding Alt turns it off until released
    app.setConstrainProportions(true);
    app.transform.box = box;
    canvas.dispatchEvent(pointer("pointerdown", 70, 50));
    canvas.dispatchEvent(pointer("pointermove", 90, 50));
    expect(setBox.mock.lastCall![0].height).toBe(30);
    // Shift does nothing when it was on
    canvas.dispatchEvent(pointer("pointermove", 90, 50, { shiftKey: true }));
    expect(setBox.mock.lastCall![0].height).toBe(30);
    window.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
    expect(app.constrainProportions).toBe(false);
    expect(setBox).toHaveBeenLastCalledWith({ ...box, cx: 60, width: 60 });
    window.dispatchEvent(new KeyboardEvent("keyup", { altKey: false }));
    expect(app.constrainProportions).toBe(true);
    expect(setBox.mock.lastCall![0].height).toBe(30);
    canvas.dispatchEvent(pointer("pointerup", 90, 50));
    expect(app.constrainProportions).toBe(true);
    // Modifier keys after the drag change nothing
    window.dispatchEvent(new KeyboardEvent("keydown", { altKey: true }));
    expect(app.constrainProportions).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keyup", { altKey: false }));
    app.setConstrainProportions(false);

    // Rotate with the round handle (a quarter turn clockwise, snapped with Shift)
    app.transform.box = box;
    canvas.dispatchEvent(pointer("pointerdown", 50, 16));
    canvas.dispatchEvent(pointer("pointermove", 86, 52, { shiftKey: true }));
    expect(setBox.mock.lastCall![0].rotation).toBe(90);
    canvas.dispatchEvent(pointer("pointerup", 86, 52));

    // Dragging outside the box moves it
    app.transform.box = box;
    canvas.dispatchEvent(pointer("pointerdown", 200, 200));
    canvas.dispatchEvent(pointer("pointermove", 210, 200));
    expect(setBox).toHaveBeenLastCalledWith({ ...box, cx: 60 });
    canvas.dispatchEvent(pointer("pointerup", 210, 200));
  });

  it("should not drag without a transform box, and draw the transform preview", async () => {
    const { element, app, canvas, calls } = await mountStage();
    app.selectTool(Tool.Move);
    app.transform.reset();
    canvas.dispatchEvent(pointer("pointerdown", 50, 50));
    canvas.dispatchEvent(pointer("pointermove", 60, 50));
    canvas.dispatchEvent(pointer("pointerup", 60, 50));
    const image = {} as CanvasImageSource;
    Object.defineProperty(app.transform, "preview", {
      get: () => ({ layer: app.layers.active, image }),
    });
    calls.length = 0;
    element.draw();
    expect(calls).toContainEqual(["drawImage", image, 0, 0]);
  });
});

describe("pc-canvas shared pointer", () => {
  it("should report the pointer in whole canvas pixels, and nothing off the canvas or after leaving", async () => {
    const { app, canvas } = await mountStage();
    const view = app.viewport;
    const at = (x: number, y: number) => view.canvasToScreen({ x, y });
    const inside = at(10.6, 20.2);
    canvas.dispatchEvent(pointer("pointermove", inside.x, inside.y));
    expect(app.pointer).toEqual({ x: 10, y: 20 });
    const edge = at(app.width, app.height);
    canvas.dispatchEvent(pointer("pointermove", edge.x, edge.y));
    expect(app.pointer).toEqual({ x: app.width, y: app.height });
    for (const [x, y] of [
      [-1, 5],
      [5, -1],
      [app.width + 1, 5],
      [5, app.height + 1],
    ] as const) {
      canvas.dispatchEvent(pointer("pointermove", at(x, y).x, at(x, y).y));
      expect(app.pointer).toBeUndefined();
    }
    canvas.dispatchEvent(pointer("pointermove", inside.x, inside.y));
    canvas.dispatchEvent(pointer("pointerleave", 0, 0));
    expect(app.pointer).toBeUndefined();
  });
});

describe("pc-canvas wheel and touch navigation", () => {
  /** A wheel event (jsdom has WheelEvent) */
  const wheelEvent = (init: WheelEventInit) =>
    new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });

  /** A touch pointer event */
  const touch = (type: string, id: number, x: number, y: number) =>
    Object.assign(pointer(type, x, y, { pointerId: id }), {
      pointerType: "touch",
    });

  it("should pan with the wheel and never scroll the page", async () => {
    const { app, canvas } = await mountStage();
    const { offsetX, offsetY } = app.viewport;
    const event = wheelEvent({ deltaX: 5, deltaY: 10 });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(app.viewport.offsetX).toBeCloseTo(offsetX - 5);
    expect(app.viewport.offsetY).toBeCloseTo(offsetY - 10);
  });

  it("should zoom around the pointer with a pinch or Cmd + scroll", async () => {
    const { app, canvas, element } = await mountStage();
    element.modifier = "Cmd";
    const before = app.viewport.zoom;
    const anchor = app.viewport.screenToCanvas({ x: 300, y: 200 });
    canvas.dispatchEvent(
      wheelEvent({ deltaY: -20, ctrlKey: true, clientX: 300, clientY: 200 }),
    );
    expect(app.viewport.zoom).toBeGreaterThan(before);
    const after = app.viewport.screenToCanvas({ x: 300, y: 200 });
    expect(after.x).toBeCloseTo(anchor.x);
    expect(after.y).toBeCloseTo(anchor.y);
    const zoomed = app.viewport.zoom;
    canvas.dispatchEvent(
      wheelEvent({ deltaY: 20, metaKey: true, clientX: 300, clientY: 200 }),
    );
    expect(app.viewport.zoom).toBeLessThan(zoomed);
  });

  it("should do nothing when the setting is off", async () => {
    const { app, canvas } = await mountStage();
    app.input.update({
      scrollPan: false,
      pinchZoom: false,
      modifierScrollZoom: false,
    });
    const { offsetX, zoom } = app.viewport;
    canvas.dispatchEvent(wheelEvent({ deltaX: 5 }));
    canvas.dispatchEvent(wheelEvent({ deltaY: -5, ctrlKey: true }));
    expect([app.viewport.offsetX, app.viewport.zoom]).toEqual([offsetX, zoom]);
  });

  it("should ignore the wheel without an app", async () => {
    const { canvas, element } = await mountStage();
    element.app = undefined;
    const event = wheelEvent({ deltaY: 5 });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("should zoom with a Safari trackpad pinch", async () => {
    const { app, canvas } = await mountStage();
    const gesture = (type: string, scale: number) =>
      Object.assign(new Event(type, { cancelable: true }), {
        scale,
        clientX: 100,
        clientY: 100,
      });
    const start = gesture("gesturestart", 1);
    canvas.dispatchEvent(start);
    expect(start.defaultPrevented).toBe(true);
    const zoom = app.viewport.zoom;
    canvas.dispatchEvent(gesture("gesturechange", 1.5));
    expect(app.viewport.zoom).toBeCloseTo(zoom * 1.5);
    canvas.dispatchEvent(gesture("gesturechange", 2));
    expect(app.viewport.zoom).toBeCloseTo(zoom * 2);
    const end = gesture("gestureend", 2);
    canvas.dispatchEvent(end);
    expect(end.defaultPrevented).toBe(true);
    // Turned off
    app.input.update({ pinchZoom: false });
    canvas.dispatchEvent(gesture("gesturechange", 1));
    expect(app.viewport.zoom).toBeCloseTo(zoom * 2);
  });

  it("should leave Safari gestures to touch handling on touch screens, and without an app", async () => {
    const { app, canvas, element } = await mountStage();
    const zoom = app.viewport.zoom;
    canvas.dispatchEvent(touch("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(
      Object.assign(new Event("gesturechange", { cancelable: true }), {
        scale: 3,
        clientX: 0,
        clientY: 0,
      }),
    );
    expect(app.viewport.zoom).toBe(zoom);
    element.app = undefined;
    canvas.dispatchEvent(new Event("gesturestart", { cancelable: true }));
    canvas.dispatchEvent(new Event("gesturechange", { cancelable: true }));
  });

  it("should stop a stroke and pan and zoom with two fingers", async () => {
    const { app, canvas } = await mountStage();
    canvas.dispatchEvent(touch("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(touch("pointermove", 1, 110, 100));
    const cancel = vi.spyOn(app.strokes, "cancel");
    canvas.dispatchEvent(touch("pointerdown", 2, 200, 100));
    expect(cancel).toHaveBeenCalledOnce();
    const { offsetX, offsetY, zoom } = app.viewport;
    // Both fingers move right by 10: pan only
    canvas.dispatchEvent(touch("pointermove", 1, 120, 100));
    canvas.dispatchEvent(touch("pointermove", 2, 210, 100));
    expect(app.viewport.zoom).toBeCloseTo(zoom);
    expect(app.viewport.offsetX).toBeCloseTo(offsetX + 10);
    expect(app.viewport.offsetY).toBeCloseTo(offsetY);
    // Spreading the fingers to twice the distance doubles the zoom
    canvas.dispatchEvent(touch("pointermove", 1, 75, 100));
    canvas.dispatchEvent(touch("pointermove", 2, 255, 100));
    expect(app.viewport.zoom).toBeCloseTo(zoom * 2);
    // A third finger is ignored
    canvas.dispatchEvent(touch("pointerdown", 3, 300, 300));
    canvas.dispatchEvent(touch("pointerup", 3, 300, 300));
    // Lifting a finger ends the gesture; the other finger doesn't draw
    canvas.dispatchEvent(touch("pointerup", 2, 255, 100));
    const strokes = vi.spyOn(app.strokes, "move");
    canvas.dispatchEvent(touch("pointermove", 1, 80, 120));
    expect(strokes).not.toHaveBeenCalled();
    canvas.dispatchEvent(touch("pointercancel", 1, 80, 120));
  });

  it("should not pan or zoom until a finger moves further than a tap allows", async () => {
    const { app, canvas } = await mountStage();
    app.input.update({ pinchZoom: false });
    canvas.dispatchEvent(touch("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(touch("pointerdown", 2, 200, 100));
    const { offsetX, zoom } = app.viewport;
    canvas.dispatchEvent(touch("pointermove", 1, 105, 100));
    canvas.dispatchEvent(touch("pointermove", 2, 205, 100));
    expect([app.viewport.offsetX, app.viewport.zoom]).toEqual([offsetX, zoom]);
    // Past it: the whole movement so far pans
    canvas.dispatchEvent(touch("pointermove", 2, 220, 100));
    expect(app.viewport.offsetX).toBeCloseTo(offsetX + 12.5);
  });

  it("should undo, redo, copy and paste with the touch gestures in the user's settings", async () => {
    const { app, canvas } = await mountStage();
    const actions: string[] = [];
    for (const action of ["undo", "redo", "copy", "paste"] as const)
      vi.spyOn(app, action).mockImplementation(() => {
        actions.push(action);
        return undefined;
      });
    /** Put fingers down at points, move them by an offset each (spreading them by a factor), then lift them */
    const gesture = (
      points: [number, number][],
      move: { dx?: number; dy?: number; spread?: number } = {},
    ) => {
      points.forEach(([x, y], i) =>
        canvas.dispatchEvent(touch("pointerdown", i + 1, x, y)),
      );
      const centreX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
      const moved = points.map(([x, y]) => [
        centreX + (x - centreX) * (move.spread ?? 1) + (move.dx ?? 0),
        y + (move.dy ?? 0),
      ]) as [number, number][];
      if (move.dx || move.dy || move.spread)
        moved.forEach(([x, y], i) =>
          canvas.dispatchEvent(touch("pointermove", i + 1, x, y)),
        );
      moved.forEach(([x, y], i) =>
        canvas.dispatchEvent(touch("pointerup", i + 1, x, y)),
      );
    };
    const three: [number, number][] = [
      [50, 100],
      [150, 100],
      [250, 100],
    ];
    gesture(three.slice(0, 2));
    gesture(three);
    gesture(three, { spread: 0.1 });
    gesture(three, { spread: 3 });
    // Not set: nothing happens
    gesture(three, { dx: -100 });
    app.input.update({
      gestures: {
        undo: "swipeLeft3",
        redo: "swipeRight3",
        copy: "swipeUp3",
        paste: "swipeDown3",
      },
    });
    gesture(three, { dx: -100 });
    gesture(three, { dx: 100 });
    gesture(three, { dy: -100 });
    gesture(three, { dy: 100 });
    expect(actions).toEqual([
      "undo",
      "redo",
      "copy",
      "paste",
      "undo",
      "redo",
      "copy",
      "paste",
    ]);
  });

  describe("focus pen mode", () => {
    /** Give an event a time */
    const at = <T extends Event>(event: T, timeStamp: number): T =>
      Object.defineProperty(event, "timeStamp", { value: timeStamp });
    /** A pen pointer event at a time */
    const pen = (type: string, x: number, y: number, timeStamp = 0) =>
      at(
        Object.assign(pointer(type, x, y, { pointerId: 9 }), {
          pointerType: "pen",
        }),
        timeStamp,
      );
    /** A touch pointer event at a time */
    const touchAt = (type: string, id: number, x: number, timeStamp = 0) =>
      at(touch(type, id, x, 100), timeStamp);

    it("should not draw with one finger, but still pan and pinch with two", async () => {
      const { app, canvas } = await mountStage();
      app.showDebugLog(true);
      app.input.update({ focusPen: true });
      // A polygon lasso made with the pen stays open between taps
      app.selectTool(Tool.PolygonLasso);
      canvas.dispatchEvent(pen("pointerdown", 10, 10, 0));
      canvas.dispatchEvent(pen("pointerup", 10, 10, 0));
      expect(app.lasso.active).toBe(true);
      const lassoMove = vi.spyOn(app.lasso, "move");
      const lassoUp = vi.spyOn(app.lasso, "up");
      // Once the pen has lifted long enough, one finger does nothing to it
      const later = PEN_LIFT_GRACE_MS;
      canvas.dispatchEvent(touchAt("pointerdown", 1, 100, later));
      canvas.dispatchEvent(touchAt("pointermove", 1, 150, later));
      canvas.dispatchEvent(touchAt("pointerup", 1, 150, later));
      expect(lassoMove).not.toHaveBeenCalled();
      expect(lassoUp).not.toHaveBeenCalled();
      // Nor draws
      app.selectTool(Tool.Brush);
      const begin = vi.spyOn(app.strokes, "begin");
      canvas.dispatchEvent(touchAt("pointerdown", 1, 100, later));
      expect(begin).not.toHaveBeenCalled();
      expect(app.strokeLog.entries.at(-1)?.detail).toBe(
        "touch: focus pen mode: one finger",
      );
      // A second finger pinches
      const { zoom } = app.viewport;
      canvas.dispatchEvent(touchAt("pointerdown", 2, 300, later));
      canvas.dispatchEvent(touchAt("pointermove", 2, 500, later));
      expect(app.viewport.zoom).not.toBeCloseTo(zoom);
      canvas.dispatchEvent(touchAt("pointerup", 2, 500, later));
      canvas.dispatchEvent(touchAt("pointerup", 1, 100, later));
      expect(begin).not.toHaveBeenCalled();
    });

    it("should ignore touches while the pen is down or just lifted, and drop touches already down", async () => {
      const { app, canvas } = await mountStage();
      app.showDebugLog(true);
      app.input.update({ focusPen: true });
      const undo = vi.spyOn(app, "undo").mockImplementation(() => undefined);
      // A palm rests on the screen with two contacts, then the pen draws
      canvas.dispatchEvent(touchAt("pointerdown", 1, 100));
      canvas.dispatchEvent(touchAt("pointerdown", 2, 200));
      canvas.dispatchEvent(pen("pointerdown", 10, 10, 10));
      expect(app.strokes.drawing).toBe(true);
      // More of the hand lands, and the palm moves and lifts: nothing happens
      canvas.dispatchEvent(touchAt("pointerdown", 3, 300, 20));
      const { offsetX, zoom } = app.viewport;
      for (const id of [1, 2, 3])
        canvas.dispatchEvent(touchAt("pointermove", id, 400 + id * 50, 30));
      expect([app.viewport.offsetX, app.viewport.zoom]).toEqual([
        offsetX,
        zoom,
      ]);
      canvas.dispatchEvent(touchAt("pointerup", 1, 450, 40));
      canvas.dispatchEvent(touchAt("pointercancel", 2, 500, 40));
      canvas.dispatchEvent(touchAt("pointerup", 3, 550, 40));
      expect(app.strokes.drawing).toBe(true);
      canvas.dispatchEvent(pen("pointerup", 20, 10, 100));
      expect(app.strokeLog.entries.map(({ kind }) => kind)).not.toContain(
        "cancel",
      );
      expect(app.strokeLog.entries.at(-1)?.kind).toBe("end");
      expect(undo).not.toHaveBeenCalled();
      // Just after the pen lifts, a two-finger tap is ignored; later, it undoes
      const tap = (at: number) => {
        canvas.dispatchEvent(touchAt("pointerdown", 4, 100, at));
        canvas.dispatchEvent(touchAt("pointerdown", 5, 200, at));
        canvas.dispatchEvent(touchAt("pointerup", 4, 100, at + 50));
        canvas.dispatchEvent(touchAt("pointerup", 5, 200, at + 50));
      };
      tap(100 + PEN_LIFT_GRACE_MS - 1);
      expect(undo).not.toHaveBeenCalled();
      tap(100 + PEN_LIFT_GRACE_MS);
      expect(undo).toHaveBeenCalledOnce();
      expect(
        app.strokeLog.entries
          .filter(({ kind }) => kind === "ignore")
          .map(({ detail }) => detail),
      ).toContain("touch: focus pen mode: the pen is down");
      expect(app.strokeLog.entries.map(({ detail }) => detail)).toContain(
        "touch: focus pen mode: the pen just lifted",
      );
    });

    it("should count a cancelled pen as lifted", async () => {
      const { app, canvas } = await mountStage();
      app.showDebugLog(true);
      app.input.update({ focusPen: true });
      canvas.dispatchEvent(pen("pointerdown", 10, 10, 0));
      canvas.dispatchEvent(pen("pointercancel", 10, 10, 50));
      canvas.dispatchEvent(touchAt("pointerdown", 1, 100, 60));
      expect(app.strokeLog.entries.at(-1)?.detail).toBe(
        "touch: focus pen mode: the pen just lifted",
      );
    });

    it("should let touches draw when off, even after a pen", async () => {
      const { app, canvas } = await mountStage();
      canvas.dispatchEvent(pen("pointerdown", 10, 10, 0));
      canvas.dispatchEvent(pen("pointerup", 10, 10, 10));
      const begin = vi.spyOn(app.strokes, "begin");
      canvas.dispatchEvent(touchAt("pointerdown", 1, 100, 20));
      expect(begin).toHaveBeenCalledOnce();
    });
  });

  it("should keep the browser from handling touches only while the brush or eraser is in use", async () => {
    const { app, canvas } = await mountStage();
    const touchStart = () => {
      const event = new Event("touchstart", { cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(touchStart()).toBe(true);
    app.selectTool(Tool.Eraser);
    expect(touchStart()).toBe(true);
    app.selectTool(Tool.PolygonLasso);
    expect(touchStart()).toBe(false);
  });

  it("should make no gesture when the browser takes the touches", async () => {
    const { app, canvas } = await mountStage();
    const undo = vi.spyOn(app, "undo");
    canvas.dispatchEvent(touch("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(touch("pointerdown", 2, 200, 100));
    canvas.dispatchEvent(touch("pointercancel", 1, 100, 100));
    canvas.dispatchEvent(touch("pointerup", 2, 200, 100));
    expect(undo).not.toHaveBeenCalled();
  });

  it("should follow the pan and pinch settings for two fingers", async () => {
    const { app, canvas, element } = await mountStage();
    app.input.update({ scrollPan: false, pinchZoom: false });
    // Start a pan drag first: the second finger ends it
    app.selectTool(Tool.Pan);
    await element.updateComplete;
    canvas.dispatchEvent(touch("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(touch("pointerdown", 2, 100, 100));
    const { offsetX, zoom } = app.viewport;
    canvas.dispatchEvent(touch("pointermove", 1, 50, 100));
    canvas.dispatchEvent(touch("pointermove", 2, 250, 100));
    expect([app.viewport.offsetX, app.viewport.zoom]).toEqual([offsetX, zoom]);
  });
});

describe("pc-canvas colour sampling", () => {
  /** A stage with the colour sample tool, whose sampling is stubbed */
  const setup = async () => {
    const stage = await mountStage();
    const { app, element } = stage;
    app.selectTool(Tool.ColourSample);
    await element.updateComplete;
    const sampleColour = vi
      .spyOn(app, "sampleColour")
      .mockImplementation((point) => (point.x < 0 ? undefined : "#123456"));
    const sampleAreaColour = vi
      .spyOn(app, "sampleAreaColour")
      .mockReturnValue("#abcdef");
    const samplePixels = vi
      .spyOn(app, "samplePixels")
      .mockReturnValue("pixels" as unknown as OffscreenCanvas);
    return { ...stage, sampleColour, sampleAreaColour, samplePixels };
  };

  it("should sample the pixel under the pointer, showing the sampling window instead of the cursor", async () => {
    const { app, element, canvas, samplerCalls, samplePixels } = await setup();
    expect(element.style.cursor).toBe(EYEDROPPER_CURSOR);
    canvas.dispatchEvent(pointer("pointerdown", 100, 200));
    expect(element.style.cursor).toBe("none");
    canvas.dispatchEvent(pointer("pointermove", 110, 210));
    await nextFrame();
    const point = app.viewport.screenToCanvas({ x: 110, y: 210 });
    expect(samplePixels).toHaveBeenLastCalledWith(point);
    // The colour on top, the pixels enlarged below, the sampled pixel outlined
    const fills = samplerCalls.filter(([name]) => name === "set:fillStyle");
    expect(fills.at(-2)).toEqual(["set:fillStyle", "#123456"]);
    expect(samplerCalls).toContainEqual([
      "drawImage",
      "pixels",
      82.5,
      132.5 + SAMPLER_WIDTH,
      SAMPLER_WIDTH,
      SAMPLER_WIDTH,
    ]);
    canvas.dispatchEvent(pointer("pointerup", 110, 210));
    expect(app.colour).toBe("#123456");
    expect(element.style.cursor).toBe(EYEDROPPER_CURSOR);
    expect(samplerCalls.at(-1)?.[0]).toBe("clearRect");
  });

  it("should still sample without a sampling window to draw on", async () => {
    const { app, element, canvas } = await setup();
    element.sampler!.getContext = (() =>
      null) as unknown as HTMLCanvasElement["getContext"];
    canvas.dispatchEvent(pointer("pointerdown", 100, 200));
    canvas.dispatchEvent(pointer("pointerup", 100, 200));
    expect(app.colour).toBe("#123456");
  });

  it("should leave the colour outside the canvas, or when sampling is cancelled", async () => {
    const { app, canvas, samplerCalls } = await setup();
    const colour = app.colour;
    vi.spyOn(app.viewport, "screenToCanvas").mockReturnValue({ x: -5, y: 5 });
    canvas.dispatchEvent(pointer("pointerdown", 1, 1));
    // Outside the canvas, the window shows the pasteboard
    expect(samplerCalls).toContainEqual(["set:fillStyle", "#808080"]);
    canvas.dispatchEvent(pointer("pointerup", 1, 1));
    expect(app.colour).toBe(colour);
    vi.mocked(app.viewport.screenToCanvas).mockRestore();
    canvas.dispatchEvent(pointer("pointerdown", 100, 100));
    canvas.dispatchEvent(pointer("pointercancel", 100, 100));
    canvas.dispatchEvent(pointer("pointerup", 100, 100));
    expect(app.colour).toBe(colour);
  });

  it("should average a dragged area, outlining it and previewing its colour", async () => {
    const { app, canvas, samplerCalls, sampleAreaColour } = await setup();
    app.setSampleMode("area");
    canvas.dispatchEvent(pointer("pointerdown", 100, 100));
    canvas.dispatchEvent(pointer("pointermove", 150, 130));
    await nextFrame();
    const start = app.viewport.screenToCanvas({ x: 100, y: 100 });
    const end = app.viewport.screenToCanvas({ x: 150, y: 130 });
    expect(sampleAreaColour).toHaveBeenLastCalledWith(start, end, 100);
    expect(samplerCalls).toContainEqual(["strokeRect", 100, 100, 50, 30]);
    expect(samplerCalls).toContainEqual(["set:fillStyle", "#abcdef"]);
    canvas.dispatchEvent(pointer("pointerup", 150, 130));
    expect(sampleAreaColour).toHaveBeenLastCalledWith(start, end);
    expect(app.colour).toBe("#abcdef");
  });

  it("should put the window above a finger, and stop sampling when a second finger touches", async () => {
    const { app, canvas, samplerCalls } = await setup();
    const colour = app.colour;
    const touch = (type: string, id: number, x: number, y: number) =>
      Object.assign(pointer(type, x, y, { pointerId: id }), {
        pointerType: "touch",
      });
    canvas.dispatchEvent(touch("pointerdown", 1, 300, 400));
    expect(samplerCalls).toContainEqual([
      "fillRect",
      300 - SAMPLER_WIDTH / 2,
      400 - TOUCH_SAMPLER_GAP - SAMPLER_HEIGHT,
      SAMPLER_WIDTH,
      SAMPLER_WIDTH,
    ]);
    canvas.dispatchEvent(touch("pointerdown", 2, 400, 400));
    canvas.dispatchEvent(touch("pointerup", 1, 300, 400));
    canvas.dispatchEvent(touch("pointerup", 2, 400, 400));
    expect(app.colour).toBe(colour);
  });
});
