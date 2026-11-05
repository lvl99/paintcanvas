import { describe, it, expect } from "vitest";
import { ColourMode, SmoothingType } from "../../types";
import round from "../round";
import square from "../square";
import drawing from "../drawing";
import painting from "../painting";
import sketching from "../sketching";

const allPresets = {
  ...round,
  ...square,
  ...drawing,
  ...painting,
  ...sketching,
};
import { brushPresets, eraserPresets } from "../..";
import { MAX_BRUSH_SIZE, MIN_BRUSH_SIZE } from "../../../classes/BrushSettings";
import { MAX_SAMPLE_RATE, MIN_SAMPLE_RATE } from "../../StrokeSampler";

describe("brush enums", () => {
  it("should define colour modes and smoothing types", () => {
    expect(ColourMode.HSL).toBe(0);
    expect(ColourMode.RGB).toBe(1);
    expect(SmoothingType.None).toBe(0);
    expect(SmoothingType.BezierQuad).toBe(2);
    expect(SmoothingType.BezierCubic).toBe(3);
  });
});

describe("presets", () => {
  it.each(Object.entries(allPresets))(
    "%s should have a matching ID and a size, sample rate and spacing within the allowed ranges",
    (key, preset) => {
      expect(preset.id).toBe(key);
      expect(preset.width).toBeGreaterThanOrEqual(MIN_BRUSH_SIZE);
      expect(preset.width).toBeLessThanOrEqual(MAX_BRUSH_SIZE);
      expect(preset.height).toBeGreaterThanOrEqual(MIN_BRUSH_SIZE);
      expect(preset.height).toBeLessThanOrEqual(MAX_BRUSH_SIZE);
      expect(preset.sampleRate).toBeGreaterThanOrEqual(MIN_SAMPLE_RATE);
      expect(preset.sampleRate).toBeLessThanOrEqual(MAX_SAMPLE_RATE);
      expect(preset.spacing).toBeGreaterThanOrEqual(0);
      expect(preset.spacing).toBeLessThanOrEqual(200);
    },
  );
});

describe("pixel grid presets", () => {
  it("should be the square presets and the 1 pixel round preset", () => {
    const snapping = Object.values(allPresets)
      .filter((preset) => preset.snapToPixelGrid)
      .map((preset) => preset.id);
    expect(snapping.sort()).toEqual(
      [
        "round1",
        ...[1, 5, 10, 20, 30, 40, 50, 100, 150].map((size) => `square${size}`),
      ].sort(),
    );
  });
});

describe("brush and eraser presets", () => {
  it("should be separate copies of all presets", () => {
    expect(brushPresets).toEqual(allPresets);
    expect(eraserPresets).toEqual(allPresets);
    expect(brushPresets).not.toBe(eraserPresets);
    expect(brushPresets.round1).not.toBe(eraserPresets.round1);
  });
});
