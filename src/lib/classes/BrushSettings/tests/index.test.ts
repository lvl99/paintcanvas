import { describe, it, expect, vi } from "vitest";
import BrushSettings, {
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  clamp,
  stepOpacity,
} from "..";
import { round } from "../../../brushes/presets/round";
import type { BrushesConfig } from "../../../brushes/types";

describe("clamp", () => {
  it("should clamp between min and max", () => {
    expect(clamp(0, 1, 10)).toBe(1);
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(11, 1, 10)).toBe(10);
  });
});

describe("stepOpacity", () => {
  it.each([
    [45, 1, 50],
    [50, 1, 60],
    [95, 1, 100],
    [100, 1, 100],
    [1, 1, 10],
    [45, -1, 40],
    [50, -1, 40],
    [10, -1, 1],
    [1, -1, 1],
  ] as const)("should step %d%% by %d to %d%%", (percent, direction, next) => {
    expect(stepOpacity(percent, direction)).toBe(next);
  });
});

describe("BrushSettings", () => {
  it("should require at least one preset", () => {
    expect(() => new BrushSettings({})).toThrow(
      "At least one brush preset is required",
    );
  });

  it("should select the first preset and its size", () => {
    const brush = new BrushSettings(round);
    expect(brush.preset.id).toBe("round1");
    expect([brush.width, brush.height]).toEqual([1, 1]);
  });

  it("should select presets by ID", () => {
    const brush = new BrushSettings(round);
    const listener = vi.fn();
    brush.addEventListener("change", listener);
    brush.select("round20");
    expect([brush.width, brush.height]).toEqual([20, 20]);
    expect(listener).toHaveBeenCalledOnce();
    expect(() => brush.select("missing")).toThrow(
      "Brush preset missing not found",
    );
  });

  it("should keep proportions and clamp to 1–256 pixels", () => {
    const brush = new BrushSettings(round);
    brush.setSize(500, 1);
    expect([brush.width, brush.height]).toEqual([256, 256]);
    brush.setSize(0);
    expect([brush.width, brush.height]).toEqual([1, 1]);
  });

  it("should grow and shrink by at least one pixel", () => {
    const brush = new BrushSettings(round);
    brush.select("round50");
    brush.grow();
    expect(brush.width).toBe(55);
    brush.shrink();
    expect(brush.width).toBe(49);
    brush.select("round1");
    brush.grow();
    expect(brush.width).toBe(2);
  });

  it("should make the current settings more or less opaque by a step", () => {
    const brush = new BrushSettings(round);
    const listener = vi.fn();
    brush.addEventListener("change", listener);
    brush.lessOpaque();
    expect(brush.preset.alpha).toBe(0.9);
    brush.update({ alpha: 0.33 });
    brush.moreOpaque();
    expect(brush.preset.alpha).toBe(0.4);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("should resize by a pixel delta", () => {
    const brush = new BrushSettings(round);
    brush.select("round10");
    brush.resize(-4);
    expect([brush.width, brush.height]).toEqual([6, 6]);
  });

  it("should use defaults for presets without size settings", () => {
    const presets: BrushesConfig = { plain: { id: "plain" } };
    const brush = new BrushSettings(presets);
    expect([brush.width, brush.height]).toEqual([
      MIN_BRUSH_SIZE,
      MIN_BRUSH_SIZE,
    ]);
    brush.setSize(1000, 3);
    expect([brush.width, brush.height]).toEqual([MAX_BRUSH_SIZE, 3]);
  });

  it("should change the current settings without changing the preset, until another preset is selected", () => {
    const brush = new BrushSettings(round);
    const listener = vi.fn();
    brush.addEventListener("change", listener);
    brush.update({ alpha: 0.5, id: "ignored" });
    expect(brush.preset).toMatchObject({ id: "round1", alpha: 0.5 });
    expect(brush.selectedPreset?.alpha).toBeUndefined();
    expect(listener).toHaveBeenCalledOnce();
    brush.select("round10");
    expect(brush.preset.alpha).toBeUndefined();
  });

  it("should apply a whole configuration, with its size", () => {
    const brush = new BrushSettings(round);
    brush.apply({ id: "other", width: 30, height: 12, spacing: 9 });
    expect(brush.preset).toMatchObject({ id: "round1", spacing: 9 });
    expect([brush.width, brush.height]).toEqual([30, 12]);
  });

  it("should replace the presets, keeping the current settings if the selected one is gone", () => {
    const brush = new BrushSettings(round);
    brush.select("round20");
    brush.setPresets({ only: { id: "only", width: 3 } });
    expect(brush.selectedPreset).toBeUndefined();
    expect(brush.preset.id).toBe("round20");
    expect(() => brush.setPresets({})).toThrow(
      "At least one brush preset is required",
    );
  });

  it("should set the height, with the width following when proportions are constrained", () => {
    const brush = new BrushSettings(round);
    brush.select("round20");
    brush.setHeight(40);
    expect([brush.width, brush.height]).toEqual([40, 40]);
    brush.update({ constrainProportions: false });
    brush.setHeight(10);
    expect([brush.width, brush.height]).toEqual([40, 10]);
  });
});
