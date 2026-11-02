import { describe, it, expect, vi } from "vitest";
import Viewport, {
  FIT_PADDING,
  MAX_ZOOM,
  MIN_VISIBLE,
  MIN_ZOOM,
  ZOOM_LEVELS,
} from "..";

/** Create a 2000×2000 canvas viewed on a 1000×800 screen */
const createView = () => {
  const view = new Viewport(2000, 2000);
  view.resize(1000, 800);
  return view;
};

describe("Viewport", () => {
  it("should convert between screen and canvas coordinates", () => {
    const view = createView();
    view.zoomAt({ x: 0, y: 0 }, 2);
    view.panBy(100, 50);
    expect(view.canvasToScreen({ x: 10, y: 20 })).toEqual({ x: 120, y: 90 });
    expect(view.screenToCanvas({ x: 120, y: 90 })).toEqual({ x: 10, y: 20 });
  });

  it("should fit the canvas within the screen, centred, without zooming past 100%", () => {
    const view = createView();
    view.fit();
    const zoom = (800 - FIT_PADDING * 2) / 2000;
    expect(view.zoom).toBeCloseTo(zoom);
    expect(view.offsetX).toBeCloseTo((1000 - 2000 * zoom) / 2);
    expect(view.offsetY).toBeCloseTo(FIT_PADDING);

    const small = new Viewport(100, 50);
    small.resize(1000, 800);
    small.fit();
    expect(small.zoom).toBe(1);
    expect(small.offsetX).toBe(450);
  });

  it("should fit within the space left by the interface", () => {
    const view = createView();
    view.fit({ top: 0, right: 375, bottom: 0, left: 50 });
    const zoom = (1000 - 425 - FIT_PADDING * 2) / 2000;
    expect(view.zoom).toBeCloseTo(zoom);
    expect(view.offsetX).toBeCloseTo(50 + (575 - 2000 * zoom) / 2);
  });

  it("should not fit below the smallest zoom on a tiny screen", () => {
    const view = new Viewport(2000, 2000);
    view.resize(10, 10);
    view.fit();
    expect(view.zoom).toBe(MIN_ZOOM);
  });

  it("should keep the point under the cursor in place when zooming", () => {
    const view = createView();
    view.fit();
    const anchor = { x: 400, y: 300 };
    const before = view.screenToCanvas(anchor);
    view.zoomAt(anchor, 3);
    const after = view.screenToCanvas(anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("should clamp zoom to the allowed range", () => {
    const view = createView();
    view.zoomAt({ x: 0, y: 0 }, 100);
    expect(view.zoom).toBe(MAX_ZOOM);
    view.zoomAt({ x: 0, y: 0 }, 0.001);
    expect(view.zoom).toBe(MIN_ZOOM);
  });

  it("should step through zoom levels", () => {
    const view = createView();
    view.zoomAt({ x: 0, y: 0 }, 1);
    view.zoomIn({ x: 0, y: 0 });
    expect(view.zoom).toBe(1.5);
    view.zoomOut({ x: 0, y: 0 });
    view.zoomOut({ x: 0, y: 0 });
    expect(view.zoom).toBeCloseTo(2 / 3);

    view.zoomAt({ x: 0, y: 0 }, 1.2);
    view.zoomIn({ x: 0, y: 0 });
    expect(view.zoom).toBe(1.5);

    view.zoomAt({ x: 0, y: 0 }, MAX_ZOOM);
    view.zoomIn({ x: 0, y: 0 });
    expect(view.zoom).toBe(MAX_ZOOM);
    view.zoomAt({ x: 0, y: 0 }, MIN_ZOOM);
    view.zoomOut({ x: 0, y: 0 });
    expect(view.zoom).toBe(MIN_ZOOM);
    expect(ZOOM_LEVELS).toContain(1);
  });

  it("should keep part of the canvas on screen when panning", () => {
    const view = createView();
    view.zoomAt({ x: 0, y: 0 }, 1);
    view.panBy(-100000, -100000);
    expect(view.canvasToScreen({ x: 2000, y: 2000 })).toEqual({
      x: MIN_VISIBLE,
      y: MIN_VISIBLE,
    });
    view.panBy(100000, 100000);
    expect(view.canvasToScreen({ x: 0, y: 0 })).toEqual({
      x: 1000 - MIN_VISIBLE,
      y: 800 - MIN_VISIBLE,
    });
  });

  it("should keep a canvas smaller than the minimum fully reachable", () => {
    const view = new Viewport(10, 10);
    view.resize(1000, 800);
    view.zoomAt({ x: 0, y: 0 }, 1);
    view.panBy(-5000, 0);
    expect(view.offsetX).toBe(0);
  });

  it("should centre a canvas point in the space not covered by the interface", () => {
    const view = createView();
    view.zoomAt({ x: 0, y: 0 }, 1);
    view.centreOn({ x: 1000, y: 1000 });
    expect(view.canvasToScreen({ x: 1000, y: 1000 })).toEqual({
      x: 500,
      y: 400,
    });
    view.centreOn(
      { x: 1000, y: 1000 },
      { top: 0, right: 400, bottom: 0, left: 50 },
    );
    expect(view.canvasToScreen({ x: 1000, y: 1000 })).toEqual({
      x: 325,
      y: 400,
    });
  });

  it("should report the visible part of the canvas", () => {
    const view = createView();
    view.zoomAt({ x: 0, y: 0 }, 1);
    view.panBy(-500, -100);
    expect(view.visibleRect()).toEqual({
      x: 500,
      y: 100,
      width: 1000,
      height: 800,
    });
    view.panBy(10000, 10000);
    const rect = view.visibleRect();
    expect(rect.x).toBe(0);
    expect(rect.width).toBe(MIN_VISIBLE);
  });

  it("should dispatch change events", () => {
    const view = new Viewport(100, 100);
    const listener = vi.fn();
    view.addEventListener("change", listener);
    view.resize(10, 10);
    view.fit();
    view.panBy(1, 1);
    view.zoomAt({ x: 0, y: 0 }, 2);
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
