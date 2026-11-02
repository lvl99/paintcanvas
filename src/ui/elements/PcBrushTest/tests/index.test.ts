import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import {
  TEST_AREA_HEIGHT,
  TEST_AREA_WIDTH,
  TEST_COLOUR,
  type PcBrushTest,
} from "..";
import StrokeEngine from "../../../../lib/brushes/StrokeEngine";
import { createRecordingCanvasFactory } from "../../../../testing/recordingCanvas";
import { query } from "../../../../testing/elements";
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
