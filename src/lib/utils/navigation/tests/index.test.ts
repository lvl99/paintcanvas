import { describe, it, expect } from "vitest";
import {
  MAX_WHEEL_ZOOM_DELTA,
  WHEEL_ZOOM_SPEED,
  touchPair,
  wheelAction,
  wheelPixels,
  type NavigationSettings,
} from "..";

const on: NavigationSettings = {
  scrollPan: true,
  pinchZoom: true,
  modifierScrollZoom: true,
};
const off: NavigationSettings = {
  scrollPan: false,
  pinchZoom: false,
  modifierScrollZoom: false,
};

/** A wheel movement */
const wheel = (
  deltaY: number,
  changes: Partial<
    Pick<WheelEvent, "deltaX" | "deltaMode" | "ctrlKey" | "metaKey">
  > = {},
) => ({
  deltaX: 0,
  deltaY,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  ...changes,
});

describe("wheelPixels", () => {
  it("should convert pixels, lines and pages to pixels", () => {
    expect(wheelPixels(5, 0)).toBe(5);
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(1, 2)).toBe(800);
  });
});

describe("wheelAction", () => {
  it("should pan opposite to the scroll, when scroll panning is on", () => {
    expect(wheelAction(wheel(10, { deltaX: -4 }), on, "Cmd")).toEqual({
      kind: "pan",
      dx: 4,
      dy: -10,
    });
    expect(wheelAction(wheel(1, { deltaMode: 1 }), on, "Cmd")).toMatchObject({
      dy: -16,
    });
    expect(wheelAction(wheel(10), off, "Cmd")).toBeNull();
  });

  it("should zoom with a pinch (Ctrl + wheel) when pinch zoom is on", () => {
    const action = wheelAction(wheel(-10, { ctrlKey: true }), on, "Cmd");
    expect(action).toEqual({
      kind: "zoom",
      factor: Math.exp(10 * WHEEL_ZOOM_SPEED),
    });
    expect(
      wheelAction(
        wheel(-10, { ctrlKey: true }),
        { ...on, pinchZoom: false },
        "Cmd",
      ),
    ).toBeNull();
  });

  it("should zoom with Ctrl + scroll where Ctrl is the zoom key, even with pinch zoom off", () => {
    expect(
      wheelAction(
        wheel(10, { ctrlKey: true }),
        { ...off, modifierScrollZoom: true },
        "Ctrl",
      ),
    ).toMatchObject({ kind: "zoom" });
  });

  it("should zoom with Cmd + scroll on Apple devices when modifier zoom is on", () => {
    expect(wheelAction(wheel(10, { metaKey: true }), on, "Cmd")).toMatchObject({
      kind: "zoom",
    });
    expect(
      wheelAction(
        wheel(10, { metaKey: true }),
        { ...on, modifierScrollZoom: false },
        "Cmd",
      ),
    ).toBeNull();
    // Cmd isn't the zoom key elsewhere
    expect(wheelAction(wheel(10, { metaKey: true }), on, "Ctrl")).toBeNull();
  });

  it("should limit how far one wheel movement zooms", () => {
    const most = Math.exp(-MAX_WHEEL_ZOOM_DELTA * WHEEL_ZOOM_SPEED);
    expect(wheelAction(wheel(500, { ctrlKey: true }), on, "Cmd")).toEqual({
      kind: "zoom",
      factor: most,
    });
    expect(wheelAction(wheel(-500, { ctrlKey: true }), on, "Cmd")).toEqual({
      kind: "zoom",
      factor: 1 / most,
    });
  });
});

describe("touchPair", () => {
  it("should give the midpoint and distance of two touches", () => {
    expect(touchPair({ x: 0, y: 0 }, { x: 6, y: 8 })).toEqual({
      mid: { x: 3, y: 4 },
      distance: 10,
    });
  });
});
