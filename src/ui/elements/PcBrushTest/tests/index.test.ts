import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import {
  TEST_AREA_HEIGHT,
  TEST_AREA_WIDTH,
  TEST_COLOUR,
  POINT_COLOUR,
  STAMP_COLOUR,
  STROKE_POINTS_MS,
  type PcBrushTest,
} from "..";
import StrokeEngine from "../../../../lib/brushes/StrokeEngine";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";
import type { PcToggleCheckbox } from "../../PcToggleCheckbox";
import { query, shadow } from "../../../../testing/elements";
import { createRecordingContext } from "../../../../testing/recordingContext";
import { createApp } from "../../../../testing/app";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A pointer-like event (jsdom has no PointerEvent) */
const pointer = (
  type: string,
  x: number,
  y: number,
  { button = 0, ...extra }: { button?: number } & Record<string, unknown> = {},
) =>
  Object.assign(
    new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true }),
    {
      pointerId: 1,
      pointerType: "mouse",
      ...extra,
    },
  );

/** Show the testing area with a context on its canvas that records drawing */
const setup = async () => {
  const app = createApp();
  const element = document.createElement("pc-brush-test") as PcBrushTest;
  element.createCanvas = createRecordingCanvasFactory().factory;
  Object.assign(element, {
    config: { id: "round10", width: 10, height: 10 },
    tips: app.tips,
  });
  document.body.append(element);
  await element.updateComplete;
  const canvas = query<HTMLCanvasElement>(element, "canvas");
  const ctx = { clearRect: vi.fn(), drawImage: vi.fn() };
  Object.defineProperty(canvas, "getContext", {
    value: () => ctx,
    configurable: true,
  });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: TEST_AREA_WIDTH / 2 }),
    configurable: true,
  });
  return { element, canvas, ctx };
};

describe("pc-brush-test", () => {
  it("should be the testing area's size", async () => {
    const { canvas } = await setup();
    expect([canvas.width, canvas.height]).toEqual([
      TEST_AREA_WIDTH,
      TEST_AREA_HEIGHT,
    ]);
  });

  it("should draw test strokes in black at the settings' size, scaled to the area", async () => {
    const { canvas, ctx } = await setup();
    const begin = vi.spyOn(StrokeEngine.prototype, "begin");
    const move = vi.spyOn(StrokeEngine.prototype, "move");
    const end = vi.spyOn(StrokeEngine.prototype, "end");
    canvas.dispatchEvent(pointer("pointerdown", 10, 20));
    canvas.dispatchEvent(pointer("pointermove", 30, 20));
    canvas.dispatchEvent(pointer("pointermove", 30, 20, { pointerId: 2 }));
    canvas.dispatchEvent(pointer("pointerup", 40, 20, { pointerId: 2 }));
    canvas.dispatchEvent(pointer("pointerup", 40, 20));
    expect(begin).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "paint",
        colour: TEST_COLOUR,
        size: { width: 10, height: 10 },
        isPen: false,
      }),
      { x: 20, y: 40 },
      expect.any(Number),
    );
    expect(move).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it("should use pen pressure and tilt", async () => {
    const { canvas } = await setup();
    const begin = vi.spyOn(StrokeEngine.prototype, "begin");
    canvas.dispatchEvent(
      pointer("pointerdown", 0, 0, {
        pointerType: "pen",
        pressure: 0.5,
        tiltX: 10,
        tiltY: 20,
      }),
    );
    expect(begin).toHaveBeenCalledWith(
      expect.objectContaining({ isPen: true }),
      { x: 0, y: 0, pressure: 0.5, tiltX: 10, tiltY: 20 },
      expect.any(Number),
    );
  });

  it("should not draw without settings, with another button, or without a pointer down", async () => {
    const { element, canvas } = await setup();
    const begin = vi.spyOn(StrokeEngine.prototype, "begin");
    canvas.dispatchEvent(pointer("pointerdown", 0, 0, { button: 2 }));
    canvas.dispatchEvent(pointer("pointermove", 0, 0, { pointerId: 9 }));
    element.config = undefined;
    canvas.dispatchEvent(pointer("pointerdown", 0, 0));
    expect(begin).not.toHaveBeenCalled();
  });

  it("should clear, and stop listening when removed", async () => {
    const { element, canvas, ctx } = await setup();
    query(element, "button.clear").click();
    expect(ctx.clearRect).toHaveBeenCalled();
    canvas.dispatchEvent(pointer("pointerdown", 0, 0));
    query(element, "button.clear").click();
    expect(ctx.drawImage).toHaveBeenCalled();
    element.remove();
    // A removed area keeps nothing drawn on a canvas that has gone
    Object.defineProperty(canvas, "getContext", { value: () => null });
    element.clear();
  });

  it("should draw more strokes with the same engine, and default the size", async () => {
    const { element, canvas } = await setup();
    const begin = vi.spyOn(StrokeEngine.prototype, "begin");
    canvas.dispatchEvent(pointer("pointerdown", 0, 0));
    canvas.dispatchEvent(pointer("pointerup", 5, 0));
    element.config = { id: "round" };
    canvas.dispatchEvent(pointer("pointerdown", 0, 0));
    expect(begin).toHaveBeenLastCalledWith(
      expect.objectContaining({ size: { width: 1, height: 1 } }),
      expect.anything(),
      expect.any(Number),
    );
  });

  it("should measure without a size when the area isn't laid out", async () => {
    const { canvas } = await setup();
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 0 }),
    });
    const begin = vi.spyOn(StrokeEngine.prototype, "begin");
    canvas.dispatchEvent(pointer("pointerdown", 5, 6));
    expect(begin).toHaveBeenCalledWith(
      expect.anything(),
      { x: 5, y: 6 },
      expect.any(Number),
    );
  });
});

describe("pc-brush-test stroke points", () => {
  it("should draw the last stroke's sampled points and stamps while shown", async () => {
    const { element, canvas } = await setup();
    const { ctx, calls } = createRecordingContext();
    Object.defineProperty(canvas, "getContext", {
      value: () => ctx,
      configurable: true,
    });
    const toggle = query<PcToggleCheckbox>(element, ".show-points");
    expect(toggle.size).toBe("s");
    expect(toggle.checked).toBe(false);
    expect(query(element, ".show-points").textContent!.trim()).toBe(
      "Show stroke points",
    );
    const draw = () => {
      canvas.dispatchEvent(pointer("pointerdown", 10, 10));
      canvas.dispatchEvent(pointer("pointermove", 40, 20));
      canvas.dispatchEvent(pointer("pointerup", 60, 30));
    };
    draw();
    expect(calls.some(([name]) => name === "arc")).toBe(false);

    shadow<HTMLInputElement>(toggle, "input").click();
    expect(element.showPoints).toBe(true);
    calls.length = 0;
    draw();
    expect(calls).toContainEqual(["set:strokeStyle", POINT_COLOUR]);
    expect(calls).toContainEqual(["set:fillStyle", STAMP_COLOUR]);
    expect(calls.some(([name]) => name === "arc")).toBe(true);
    expect(calls.some(([name]) => name === "fillRect")).toBe(true);

    // Hidden again: nothing drawn over the strokes
    element.setShowPoints(false);
    calls.length = 0;
    draw();
    expect(calls.some(([name]) => name === "arc")).toBe(false);
  });

  it("should clear a finished stroke's points after 3 seconds, or on Clear", async () => {
    const { element, canvas } = await setup();
    const { ctx, calls } = createRecordingContext();
    Object.defineProperty(canvas, "getContext", {
      value: () => ctx,
      configurable: true,
    });
    const arcs = () => calls.filter(([name]) => name === "arc").length;
    const draw = () => {
      canvas.dispatchEvent(pointer("pointerdown", 10, 10));
      canvas.dispatchEvent(pointer("pointermove", 40, 20));
      canvas.dispatchEvent(pointer("pointerup", 60, 30));
    };
    element.setShowPoints(true);
    vi.useFakeTimers();
    try {
      draw();
      vi.advanceTimersByTime(STROKE_POINTS_MS - 1);
      calls.length = 0;
      element.setShowPoints(true);
      expect(arcs()).toBeGreaterThan(0);
      // Starting another stroke keeps them until it's finished
      canvas.dispatchEvent(pointer("pointerdown", 10, 10));
      vi.advanceTimersByTime(STROKE_POINTS_MS);
      canvas.dispatchEvent(pointer("pointerup", 60, 30));
      vi.advanceTimersByTime(STROKE_POINTS_MS);
      calls.length = 0;
      element.setShowPoints(true);
      expect(arcs()).toBe(0);
      // "Clear" clears them straight away
      draw();
      query(element, "button.clear").click();
      calls.length = 0;
      element.setShowPoints(true);
      expect(arcs()).toBe(0);
      // Removing the area stops the wait
      draw();
      element.remove();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should record points from the start when shown before the first stroke", async () => {
    const { element, canvas } = await setup();
    const { ctx } = createRecordingContext();
    Object.defineProperty(canvas, "getContext", {
      value: () => ctx,
      configurable: true,
    });
    const setDebug = vi.spyOn(StrokeEngine.prototype, "setDebug");
    element.setShowPoints(true);
    query(element, "canvas").dispatchEvent(pointer("pointerdown", 10, 10));
    expect(setDebug).toHaveBeenCalledWith(true);
  });
});
