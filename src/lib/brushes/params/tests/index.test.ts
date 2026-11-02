import { describe, it, expect } from "vitest";
import {
  lerp,
  pointInput,
  snapStamp,
  snapToPixelGrid,
  stampParams,
  tiltAmount,
  tiltDirection,
  variationFactor,
} from "..";
import type { BrushConfig } from "../../types";

const mouse = { isPen: false };
const pen = (pressure: number, tiltX = 0, tiltY = 0) => ({
  isPen: true,
  pressure,
  tiltX,
  tiltY,
});
const fixed = (value: number) => () => value;
const base: BrushConfig = { id: "b" };

describe("lerp, tiltAmount and tiltDirection", () => {
  it("should interpolate and measure tilt", () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(tiltAmount()).toBe(0);
    expect(tiltAmount(45, 0)).toBe(0.5);
    expect(tiltAmount(90, 90)).toBe(1);
    expect(tiltDirection(0, 45)).toBe(90);
    expect(tiltDirection()).toBe(0);
  });
});

describe("variationFactor", () => {
  it("should be 1 with no config or nothing enabled", () => {
    expect(variationFactor(undefined, mouse)).toBe(1);
    expect(variationFactor({}, mouse)).toBe(1);
  });

  it("should randomise between min and max", () => {
    const config = { useRandomise: true, minRandomise: 0.5, maxRandomise: 1 };
    expect(variationFactor(config, mouse, fixed(0))).toBe(0.5);
    expect(variationFactor(config, mouse, fixed(1))).toBe(1);
    expect(variationFactor({ useRandomise: true }, mouse, fixed(0.3))).toBe(1);
  });

  it("should follow pen pressure, treating other devices as full pressure", () => {
    const config = { usePressure: true, minPressure: 0.2, maxPressure: 1 };
    expect(variationFactor(config, pen(0))).toBeCloseTo(0.2);
    expect(variationFactor(config, pen(0.5))).toBeCloseTo(0.6);
    expect(variationFactor(config, mouse)).toBe(1);
    expect(variationFactor({ usePressure: true }, { isPen: true })).toBe(1);
    expect(variationFactor({ usePressure: true }, pen(0.25))).toBe(0.25);
  });

  it("should follow pen tilt, treating other devices as fully tilted", () => {
    expect(variationFactor({ useTilt: true }, pen(1, 45, 0))).toBe(0.5);
    expect(
      variationFactor({ useTilt: true, minTilt: 1, maxTilt: 0 }, pen(1, 90, 0)),
    ).toBe(0);
    expect(variationFactor({ useTilt: true }, mouse)).toBe(1);
  });

  it("should multiply enabled factors", () => {
    const config = {
      useRandomise: true,
      minRandomise: 0.5,
      maxRandomise: 0.5,
      usePressure: true,
    };
    expect(variationFactor(config, pen(0.5))).toBe(0.25);
  });
});

describe("stampParams", () => {
  it("should use the size and preset defaults with no variation", () => {
    expect(stampParams(base, { width: 20, height: 10 }, mouse)).toEqual({
      width: 20,
      height: 10,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      alpha: 1,
    });
  });

  it("should scale width, and height to match when proportions are constrained", () => {
    const preset: BrushConfig = {
      ...base,
      constrainProportions: true,
      widthConfig: { usePressure: true },
    };
    expect(
      stampParams(preset, { width: 20, height: 10 }, pen(0.5)),
    ).toMatchObject({ width: 10, height: 5 });
    const free: BrushConfig = { ...base, heightConfig: { usePressure: true } };
    expect(
      stampParams(free, { width: 20, height: 10 }, pen(0.5)),
    ).toMatchObject({ width: 20, height: 5 });
  });

  it("should add random or pressure rotation as a fraction of a full turn", () => {
    const preset: BrushConfig = {
      ...base,
      rotation: 10,
      rotationConfig: {
        useRandomise: true,
        minRandomise: 0,
        maxRandomise: 0.5,
      },
    };
    expect(
      stampParams(preset, { width: 1, height: 1 }, mouse, fixed(0.5)).rotation,
    ).toBe(100);
    const pressure: BrushConfig = {
      ...base,
      rotationConfig: { usePressure: true },
    };
    expect(
      stampParams(pressure, { width: 1, height: 1 }, pen(0.25)).rotation,
    ).toBe(90);
  });

  it("should rotate with the pen's lean direction when tilt is used", () => {
    const preset: BrushConfig = {
      ...base,
      rotation: 5,
      rotationConfig: { useTilt: true },
    };
    expect(
      stampParams(preset, { width: 1, height: 1 }, pen(1, 0, 30)).rotation,
    ).toBe(95);
    // Upright pen or mouse: rotation unchanged
    expect(
      stampParams(preset, { width: 1, height: 1 }, pen(1, 0, 0)).rotation,
    ).toBe(5);
    expect(stampParams(preset, { width: 1, height: 1 }, mouse).rotation).toBe(
      5,
    );
  });

  it("should scatter offsets up to the factor times the size in a random direction", () => {
    const preset: BrushConfig = {
      ...base,
      offsetX: 2,
      offsetXConfig: {
        useRandomise: true,
        minRandomise: 0.5,
        maxRandomise: 0.5,
      },
      offsetYConfig: { usePressure: true },
    };
    // random() < 0.5 → negative direction
    const negative = stampParams(
      preset,
      { width: 20, height: 10 },
      pen(1),
      fixed(0.2),
    );
    expect(negative.offsetX).toBe(-8);
    expect(negative.offsetY).toBe(-10);
    const positive = stampParams(
      preset,
      { width: 20, height: 10 },
      pen(1),
      fixed(0.7),
    );
    expect(positive.offsetX).toBe(12);
    expect(
      stampParams(
        { ...base, offsetYConfig: { useTilt: true } },
        { width: 1, height: 10 },
        mouse,
        fixed(0.9),
      ).offsetY,
    ).toBe(10);
  });

  it("should scale alpha and keep it within 0–1", () => {
    expect(
      stampParams(
        { ...base, alpha: 0.8, alphaConfig: { usePressure: true } },
        { width: 1, height: 1 },
        pen(0.5),
      ).alpha,
    ).toBeCloseTo(0.4);
    expect(
      stampParams({ ...base, alpha: 3 }, { width: 1, height: 1 }, mouse).alpha,
    ).toBe(1);
  });

  it("should never produce a negative size", () => {
    const preset: BrushConfig = {
      ...base,
      widthConfig: { useRandomise: true, minRandomise: -1, maxRandomise: -1 },
    };
    expect(stampParams(preset, { width: 10, height: 10 }, mouse).width).toBe(0);
  });

  it("should use Math.random by default", () => {
    const preset: BrushConfig = {
      ...base,
      widthConfig: { useRandomise: true, minRandomise: 0.5, maxRandomise: 1 },
    };
    const { width } = stampParams(preset, { width: 10, height: 10 }, mouse);
    expect(width).toBeGreaterThanOrEqual(5);
    expect(width).toBeLessThanOrEqual(10);
    expect(
      variationFactor(
        { useRandomise: true, minRandomise: 0, maxRandomise: 1 },
        mouse,
      ),
    ).toBeLessThanOrEqual(1);
  });
});

describe("snapToPixelGrid", () => {
  it("should cover the pixel under the point with a 1 pixel area", () => {
    expect(snapToPixelGrid(10.7, 4.2, 1, 1)).toEqual({
      x: 10.5,
      y: 4.5,
      width: 1,
      height: 1,
    });
    expect(snapToPixelGrid(10, 4, 1, 1)).toEqual({
      x: 10.5,
      y: 4.5,
      width: 1,
      height: 1,
    });
  });

  it("should round sizes to whole pixels and put the corner on a pixel", () => {
    expect(snapToPixelGrid(10.7, 4.2, 2, 3)).toEqual({
      x: 10,
      y: 4.5,
      width: 2,
      height: 3,
    });
    expect(snapToPixelGrid(-0.5, 0.5, 4.4, 4.6)).toEqual({
      x: -1,
      y: 0.5,
      width: 4,
      height: 5,
    });
  });

  it("should keep at least 1 pixel, and nothing when the size is 0 or less", () => {
    expect(snapToPixelGrid(1, 1, 0.2, 0.2)).toMatchObject({
      width: 1,
      height: 1,
    });
    expect(snapToPixelGrid(1, 1, 0, -1)).toMatchObject({
      width: 0,
      height: 0,
    });
  });
});

describe("snapStamp", () => {
  it("should include the offset in the snapped point and keep the rest of the params", () => {
    expect(
      snapStamp(10.7, 4.2, {
        width: 1.4,
        height: 1,
        rotation: 30,
        offsetX: 2,
        offsetY: -1.5,
        alpha: 0.5,
      }),
    ).toEqual({
      x: 12.5,
      y: 2.5,
      params: {
        width: 1,
        height: 1,
        rotation: 30,
        offsetX: 0,
        offsetY: 0,
        alpha: 0.5,
      },
    });
  });
});

describe("pointInput", () => {
  it("should copy pressure and tilt from a stroke point", () => {
    expect(
      pointInput({ x: 1, y: 2, pressure: 0.3, tiltX: 4, tiltY: 5 }, true),
    ).toEqual({
      pressure: 0.3,
      tiltX: 4,
      tiltY: 5,
      isPen: true,
    });
  });
});
