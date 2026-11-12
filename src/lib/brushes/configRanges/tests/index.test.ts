import { describe, it, expect } from "vitest";
import { PROFILE_PRESETS } from "../../../profiles";
import type { BrushConfig } from "../../types";
import { readRange, selectSource, toggleSource, writeRange } from "..";

const none = { pressure: false, tilt: false, randomise: false };

describe("readRange", () => {
  it("should read settings that don't vary, with defaults", () => {
    expect(readRange({}, "width")).toEqual({
      value: 1,
      min: 1,
      max: 1,
      sources: none,
      varies: false,
    });
    expect(readRange({ width: 30 }, "height").value).toBe(30);
    expect(readRange({ height: 10 }, "height").value).toBe(10);
    expect(readRange({}, "alpha").value).toBe(100);
    expect(readRange({ alpha: 0.5 }, "alpha").value).toBe(50);
    expect(readRange({}, "rotation").value).toBe(0);
  });

  it("should read scale settings from the first source turned on", () => {
    expect(
      readRange(
        {
          width: 40,
          widthConfig: {
            usePressure: true,
            minPressure: 0.25,
            useRandomise: true,
            minRandomise: 0.9,
          },
        },
        "width",
      ),
    ).toEqual({
      value: 40,
      min: 10,
      max: 40,
      sources: { pressure: true, tilt: false, randomise: true },
      varies: true,
    });
    // Randomise alone: its default range is 1 to 1
    expect(
      readRange({ width: 40, widthConfig: { useRandomise: true } }, "width"),
    ).toMatchObject({ min: 40, max: 40 });
  });

  it("should read rotation as the angle plus up to 360° and offsets as scatter in pixels", () => {
    expect(
      readRange(
        {
          rotation: 10,
          rotationConfig: { useTilt: true, minTilt: 0, maxTilt: 0.5 },
        },
        "rotation",
      ),
    ).toMatchObject({ min: 10, max: 190 });
    expect(
      readRange(
        {
          width: 20,
          offsetXConfig: {
            useRandomise: true,
            minRandomise: 0,
            maxRandomise: 0.5,
          },
        },
        "offsetX",
      ),
    ).toMatchObject({ min: 0, max: 10, varies: true });
    expect(readRange({ offsetY: 3 }, "offsetY").value).toBe(3);
  });
});

describe("writeRange", () => {
  it("should set a setting that doesn't vary, within its limits", () => {
    expect(writeRange({}, "width", { value: 500 })).toEqual({
      width: 256,
    });
    expect(writeRange({}, "alpha", { value: 40 })).toEqual({
      alpha: 0.4,
    });
    expect(writeRange({ width: 5 }, "width", {})).toEqual({
      width: 5,
    });
    // Offsets only change while they vary
    expect(writeRange({}, "offsetX", { value: 5 })).toEqual({});
  });

  it("should write scale ranges to every source turned on", () => {
    const config: BrushConfig = {
      width: 40,
      widthConfig: { usePressure: true, useTilt: true, useRandomise: false },
    };
    expect(writeRange(config, "width", { min: 10, max: 50 })).toEqual({
      width: 50,
      widthConfig: {
        usePressure: true,
        minPressure: 0.2,
        maxPressure: 1,
        useTilt: true,
        minTilt: 0.2,
        maxTilt: 1,
        useRandomise: false,
      },
    });
  });

  it("should swap a min above the max, and handle an opacity of 0", () => {
    const config: BrushConfig = {
      alpha: 1,
      alphaConfig: { useRandomise: true, minRandomise: 0.5, maxRandomise: 1 },
    };
    const swapped = writeRange(config, "alpha", { min: 90, max: 20 });
    expect(swapped.alpha).toBe(0.9);
    expect(swapped.alphaConfig?.minRandomise).toBeCloseTo(20 / 90);
    expect(writeRange(config, "alpha", { min: 0, max: 0 })).toMatchObject({
      alphaConfig: { minRandomise: 0, maxRandomise: 1 },
    });
  });

  it("should keep the end that isn't given", () => {
    const config: BrushConfig = {
      alpha: 0.8,
      alphaConfig: { usePressure: true, minPressure: 0.5, maxPressure: 1 },
    };
    // From 40% to 80%: only the max changes, then only the min
    expect(writeRange(config, "alpha", { max: 100 })).toMatchObject({
      alpha: 1,
      alphaConfig: { minPressure: 0.4 },
    });
    expect(writeRange(config, "alpha", { min: 20 })).toMatchObject({
      alpha: 0.8,
      alphaConfig: { minPressure: 0.25 },
    });
  });

  it("should write rotation and offset ranges", () => {
    expect(
      writeRange({ rotationConfig: { useRandomise: true } }, "rotation", {
        min: 90,
        max: 180,
      }),
    ).toEqual({
      rotation: 90,
      rotationConfig: {
        useRandomise: true,
        minRandomise: 0,
        maxRandomise: 0.25,
      },
    });
    expect(
      writeRange(
        { width: 20, offsetYConfig: { usePressure: true } },
        "offsetY",
        { min: 5, max: 40 },
      ),
    ).toEqual({
      offsetYConfig: { usePressure: true, minPressure: 0.25, maxPressure: 1 },
    });
  });
});

describe("toggleSource", () => {
  it("should give the first source a starting range", () => {
    expect(toggleSource({}, "width", "pressure", true)).toEqual({
      widthConfig: { usePressure: true, minPressure: 0.5, maxPressure: 1 },
    });
    expect(toggleSource({}, "rotation", "tilt", true)).toEqual({
      rotationConfig: { useTilt: true, minTilt: 0, maxTilt: 0 },
    });
    expect(toggleSource({}, "offsetX", "randomise", true)).toEqual({
      offsetXConfig: { useRandomise: true, minRandomise: 0, maxRandomise: 0.5 },
    });
  });

  it("should give later sources the current range, and turn sources off", () => {
    const config: BrushConfig = {
      width: 40,
      widthConfig: { usePressure: true, minPressure: 0.25, maxPressure: 1 },
    };
    expect(toggleSource(config, "width", "randomise", true)).toEqual({
      width: 40,
      widthConfig: {
        usePressure: true,
        minPressure: 0.25,
        maxPressure: 1,
        useRandomise: true,
        minRandomise: 0.25,
        maxRandomise: 1,
      },
    });
    expect(toggleSource(config, "width", "pressure", false)).toEqual({
      widthConfig: { usePressure: false, minPressure: 0.25, maxPressure: 1 },
    });
  });
});

describe("selectSource", () => {
  it("should give the first source a starting range, with only that source on", () => {
    expect(selectSource({ width: 40 }, "width", "pressure")).toEqual({
      widthConfig: { usePressure: true, minPressure: 0.5, maxPressure: 1 },
    });
  });

  it("should switch to another source keeping the range and the profile graph, or turn variation off", () => {
    const profile = PROFILE_PRESETS[1]!.content.points;
    const config: BrushConfig = {
      width: 40,
      widthConfig: {
        usePressure: true,
        minPressure: 0.25,
        useTilt: true,
        profile,
        profileId: "overweight",
      },
    };
    const tilt = selectSource(config, "width", "tilt");
    expect(tilt.widthConfig).toEqual({
      usePressure: false,
      minPressure: 0.25,
      useTilt: true,
      minTilt: 0.25,
      maxTilt: 1,
      useRandomise: false,
      profile,
      profileId: "overweight",
    });
    expect(readRange({ ...config, ...tilt }, "width")).toMatchObject({
      min: 10,
      max: 40,
    });
    // Choosing the source it already varies with turns the others off
    expect(selectSource(config, "width", "pressure").widthConfig).toMatchObject(
      {
        usePressure: true,
        useTilt: false,
        useRandomise: false,
      },
    );
    expect(selectSource(config, "width", undefined).widthConfig).toMatchObject({
      usePressure: false,
      useTilt: false,
      useRandomise: false,
      profile,
    });
    expect(
      selectSource(
        { rotationConfig: { useRandomise: true } },
        "rotation",
        "tilt",
      ).rotationConfig,
    ).toMatchObject({ useTilt: true, minTilt: 1, maxTilt: 1 });
  });
});
