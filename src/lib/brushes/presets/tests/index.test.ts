import { describe, it, expect } from "vitest";
import { ColourMode, SmoothingType } from "../../types";
import round from "../round";
import square from "../square";
import drawing from "../drawing";
import painting from "../painting";
import sketching from "../sketching";
import { builtInPreset, sizedPresets, spacedBy } from "../sized";
import { BUILT_IN_AUTHOR } from "../../../assets/schema";
import { BRUSH_PRESET_TYPE } from "../../../presets/schema";

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
      expect(preset["@type"]).toBe(BRUSH_PRESET_TYPE);
      expect(preset.author).toBe(BUILT_IN_AUTHOR);
      expect(preset.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(preset.content.width).toBeGreaterThanOrEqual(MIN_BRUSH_SIZE);
      expect(preset.content.width).toBeLessThanOrEqual(MAX_BRUSH_SIZE);
      expect(preset.content.height).toBeGreaterThanOrEqual(MIN_BRUSH_SIZE);
      expect(preset.content.height).toBeLessThanOrEqual(MAX_BRUSH_SIZE);
      expect(preset.content.sampleRate).toBeGreaterThanOrEqual(MIN_SAMPLE_RATE);
      expect(preset.content.sampleRate).toBeLessThanOrEqual(MAX_SAMPLE_RATE);
      expect(preset.content.spacing).toBeGreaterThanOrEqual(0);
      expect(preset.content.spacing).toBeLessThanOrEqual(200);
    },
  );
});

describe("pixel grid presets", () => {
  it("should be the square presets and the 1 pixel round preset", () => {
    const snapping = Object.values(allPresets)
      .filter((preset) => preset.content.snapToPixelGrid)
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

describe("builtInPreset", () => {
  it("should make a preset by PaintCanvas from its header and settings", () => {
    expect(
      builtInPreset(
        { id: "pen", name: "Pen", group: "Pens", version: "1.0.0" },
        { width: 4 },
      ),
    ).toEqual({
      "@type": BRUSH_PRESET_TYPE,
      id: "pen",
      name: "Pen",
      group: "Pens",
      version: "1.0.0",
      author: BUILT_IN_AUTHOR,
      content: { width: 4 },
    });
  });
});

describe("sizedPresets", () => {
  it("should make one preset per size, named and grouped after the family", () => {
    const presets = sizedPresets(
      { idPrefix: "dot", name: "Dot", version: "2.0.0" },
      [1, 40],
      { alpha: 0.5 },
      spacedBy(0.25),
    );
    expect(presets).toEqual({
      dot1: builtInPreset(
        { id: "dot1", name: "Dot 1px", group: "Dot", version: "2.0.0" },
        { alpha: 0.5, width: 1, height: 1, spacing: 1 },
      ),
      dot40: builtInPreset(
        { id: "dot40", name: "Dot 40px", group: "Dot", version: "2.0.0" },
        { alpha: 0.5, width: 40, height: 40, spacing: 10 },
      ),
    });
  });

  it("should add nothing per size by default", () => {
    const { dot5 } = sizedPresets(
      { idPrefix: "dot", name: "Dot", version: "1.0.0" },
      [5],
      {},
    );
    expect(dot5?.content).toEqual({ width: 5, height: 5 });
  });
});
