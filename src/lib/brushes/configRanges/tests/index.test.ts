import { describe, it, expect } from "vitest";
import { PROFILE_PRESETS } from "../../../profiles";
import type { BrushConfig } from "../../types";
import {
  differsFromPreset,
  followsLean,
  readRange,
  resetSource,
  setFollowsLean,
  setSource,
  writeRange,
  writeSourceProfile,
  writeSourceRange,
} from "..";

const overweight = PROFILE_PRESETS[1]!.content.points;
const underweight = PROFILE_PRESETS[2]!.content.points;

describe("readRange", () => {
  it("should read settings that don't vary, with defaults", () => {
    const range = readRange({}, "width");
    expect([range.value, range.min, range.max, range.varies]).toEqual([
      1,
      1,
      1,
      false,
    ]);
    expect(range.sources.pressure).toEqual({
      on: false,
      min: 0,
      max: 1,
      profile: undefined,
      profileId: undefined,
    });
    expect(range.sources.randomise).toMatchObject({ min: 1, max: 1 });
    expect(readRange({ width: 8 }, "height").value).toBe(8);
    expect(readRange({ alpha: 0.5 }, "alpha").value).toBe(50);
    expect(readRange({}, "rotation").value).toBe(0);
  });

  it("should read a scale setting's range from min × the value to the value, and each source's own", () => {
    const range = readRange(
      {
        width: 40,
        widthConfig: {
          min: 0.25,
          usePressure: true,
          minPressure: 0.1,
          useTilt: true,
          tiltProfile: overweight,
          tiltProfileId: "overweight",
        },
      },
      "width",
    );
    expect([range.min, range.max, range.varies]).toEqual([10, 40, true]);
    expect(range.sources.pressure).toMatchObject({ on: true, min: 0.1 });
    expect(range.sources.tilt).toMatchObject({
      on: true,
      profile: overweight,
      profileId: "overweight",
    });
    // Without a range: from 0, as before ranges
    expect(
      readRange({ alpha: 0.8, alphaConfig: { usePressure: true } }, "alpha")
        .min,
    ).toBe(0);
  });

  it("should give sources without their own profile graph the setting's shared one", () => {
    const range = readRange(
      {
        widthConfig: {
          useRandomise: true,
          profile: underweight,
          profileId: "underweight",
          pressureProfile: overweight,
        },
      },
      "width",
    );
    expect(range.sources.randomise.profileId).toBe("underweight");
    expect(range.sources.pressure.profile).toBe(overweight);
    expect(range.sources.pressure.profileId).toBeUndefined();
  });

  it("should read rotation from the angle plus min to plus max, and offsets as percentages of the size", () => {
    expect(
      readRange(
        {
          rotation: 30,
          rotationConfig: { min: 10, max: 90, usePressure: true },
        },
        "rotation",
      ),
    ).toMatchObject({ min: 40, max: 120 });
    // Without a range: a full turn
    expect(
      readRange({ rotationConfig: { usePressure: true } }, "rotation"),
    ).toMatchObject({ min: 0, max: 360 });
    expect(
      readRange(
        { offsetXConfig: { min: -0.5, max: 0.25, useRandomise: true } },
        "offsetX",
      ),
    ).toMatchObject({ min: -50, max: 25 });
    expect(readRange({}, "offsetY")).toMatchObject({ min: 0, max: 0 });
  });

  it("should show a rotation that follows the pen's lean with tilt (before ranges) without tilt", () => {
    const config: BrushConfig = { rotationConfig: { useTilt: true } };
    expect(readRange(config, "rotation").sources.tilt.on).toBe(false);
    expect(followsLean(config)).toBe(true);
    expect(followsLean({ rotationFollowsLean: true })).toBe(true);
    expect(followsLean({})).toBe(false);
    expect(
      followsLean({ rotationConfig: { useTilt: true, min: 0, max: 90 } }),
    ).toBe(false);
  });
});

describe("writeRange", () => {
  it("should write a value for a setting that doesn't vary, kept within its limits", () => {
    expect(writeRange({}, "width", { value: 500 })).toEqual({ width: 256 });
    expect(writeRange({}, "alpha", { value: 40 })).toEqual({ alpha: 0.4 });
    expect(writeRange({ width: 10 }, "width", {})).toEqual({ width: 10 });
    expect(writeRange({}, "offsetX", { value: 5 })).toEqual({});
  });

  it("should write a scale range as the value and a share of it, keeping the sources", () => {
    expect(
      writeRange(
        { width: 40, widthConfig: { usePressure: true, minPressure: 0.2 } },
        "width",
        { min: 15, max: 60 },
      ),
    ).toEqual({
      width: 60,
      widthConfig: { usePressure: true, minPressure: 0.2, min: 0.25, max: 1 },
    });
    // Swapped when the low end is above the high one, and an opacity of 0 has no share
    expect(
      writeRange({ alphaConfig: { useTilt: true } }, "alpha", {
        min: 0,
        max: 0,
      }),
    ).toEqual({ alpha: 1e-8, alphaConfig: { useTilt: true, min: 0, max: 1 } });
    expect(
      writeRange({ width: 40, widthConfig: { useTilt: true } }, "width", {
        min: 30,
        max: 20,
      }).widthConfig?.min,
    ).toBeCloseTo(2 / 3);
  });

  it("should keep the end that isn't given", () => {
    expect(
      writeRange(
        { width: 40, widthConfig: { useTilt: true, min: 0.5 } },
        "width",
        { max: 80 },
      ),
    ).toEqual({ width: 80, widthConfig: { useTilt: true, min: 0.25, max: 1 } });
    expect(
      writeRange(
        { width: 40, widthConfig: { useTilt: true, min: 0.5 } },
        "width",
        { min: 10 },
      ),
    ).toEqual({ width: 40, widthConfig: { useTilt: true, min: 0.25, max: 1 } });
  });

  it("should write rotation as the angle and a spread, and offsets as shares of the size", () => {
    expect(
      writeRange({ rotationConfig: { usePressure: true } }, "rotation", {
        min: 45,
        max: 135,
      }),
    ).toEqual({
      rotation: 45,
      rotationConfig: { usePressure: true, min: 0, max: 90 },
    });
    expect(
      writeRange({ offsetYConfig: { useRandomise: true } }, "offsetY", {
        min: -40,
        max: 60,
      }),
    ).toEqual({ offsetYConfig: { useRandomise: true, min: -0.4, max: 0.6 } });
  });
});

describe("setSource", () => {
  it("should give the first source a starting range, and every source its full range", () => {
    expect(setSource({ width: 40 }, "width", "pressure", true)).toEqual({
      widthConfig: {
        min: 0.5,
        max: 1,
        usePressure: true,
        minPressure: 0,
        maxPressure: 1,
      },
    });
    expect(setSource({}, "rotation", "randomise", true).rotationConfig).toEqual(
      {
        min: 0,
        max: 360,
        useRandomise: true,
        minRandomise: 0,
        maxRandomise: 1,
      },
    );
    expect(setSource({}, "offsetX", "tilt", true).offsetXConfig).toMatchObject({
      min: -0.5,
      max: 0.5,
    });
  });

  it("should let several sources be on at once, keeping the range, and turn them off", () => {
    const config: BrushConfig = {
      widthConfig: { min: 0.2, usePressure: true, minPressure: 0.3 },
    };
    const tilted = setSource(config, "width", "tilt", true).widthConfig;
    expect(tilted).toEqual({
      min: 0.2,
      usePressure: true,
      minPressure: 0.3,
      useTilt: true,
      minTilt: 0,
      maxTilt: 1,
    });
    // Already on: its range stays
    expect(
      setSource({ widthConfig: tilted }, "width", "pressure", true).widthConfig
        ?.minPressure,
    ).toBe(0.3);
    expect(
      setSource({ widthConfig: tilted }, "width", "pressure", false)
        .widthConfig,
    ).toMatchObject({ usePressure: false, useTilt: true });
  });

  it("should give a setting saved before ranges the range it worked with, and its shared graph to each source", () => {
    const changes = setSource(
      {
        widthConfig: {
          usePressure: true,
          profile: overweight,
          profileId: "overweight",
        },
      },
      "width",
      "tilt",
      true,
    );
    expect(changes.widthConfig).toEqual({
      min: 0,
      max: 1,
      usePressure: true,
      pressureProfile: overweight,
      pressureProfileId: "overweight",
      useTilt: true,
      minTilt: 0,
      maxTilt: 1,
    });
    // Offsets scattered up to the size either way
    expect(
      setSource(
        { offsetXConfig: { useRandomise: true } },
        "offsetX",
        "tilt",
        true,
      ).offsetXConfig,
    ).toMatchObject({ min: -1, max: 1 });
  });

  it("should turn a rotation that followed the pen's lean with tilt into following it with rotationFollowsLean", () => {
    expect(
      setSource(
        { rotationConfig: { useTilt: true } },
        "rotation",
        "tilt",
        true,
      ),
    ).toEqual({
      rotationFollowsLean: true,
      rotationConfig: {
        useTilt: true,
        min: 0,
        max: 360,
        minTilt: 0,
        maxTilt: 1,
      },
    });
  });
});

describe("writeSourceRange and writeSourceProfile", () => {
  it("should write a source's range, ordered and within 0–1", () => {
    expect(
      writeSourceRange(
        { widthConfig: { min: 0.5, useTilt: true } },
        "width",
        "tilt",
        { min: 1.2, max: 0.25 },
      ),
    ).toEqual({
      widthConfig: { min: 0.5, useTilt: true, minTilt: 0.25, maxTilt: 1 },
    });
  });

  it("should give a source its own profile graph, or remove it", () => {
    const config: BrushConfig = {
      alphaConfig: { min: 0, usePressure: true },
    };
    const withGraph = writeSourceProfile(
      config,
      "alpha",
      "pressure",
      overweight,
      "overweight",
    );
    expect(withGraph.alphaConfig).toEqual({
      min: 0,
      usePressure: true,
      pressureProfile: overweight,
      pressureProfileId: "overweight",
    });
    expect(
      writeSourceProfile(withGraph, "alpha", "pressure", underweight)
        .alphaConfig,
    ).toEqual({ min: 0, usePressure: true, pressureProfile: underweight });
    expect(
      writeSourceProfile(withGraph, "alpha", "pressure", undefined).alphaConfig,
    ).toEqual({ min: 0, usePressure: true });
  });
});

describe("setFollowsLean", () => {
  it("should turn following the pen's lean on or off, and tilt off when the rotation followed it before ranges", () => {
    expect(setFollowsLean({}, true)).toEqual({ rotationFollowsLean: true });
    expect(
      setFollowsLean({ rotationConfig: { useTilt: true } }, false),
    ).toEqual({
      rotationFollowsLean: false,
      rotationConfig: { useTilt: false },
    });
  });
});

describe("differsFromPreset", () => {
  const preset: BrushConfig = {
    widthConfig: { usePressure: true, minPressure: 0.5 },
    rotationConfig: { useRandomise: true },
  };

  it("should be false when the pen settings vary with a source as the preset does", () => {
    expect(differsFromPreset(structuredClone(preset), preset, "pressure")).toBe(
      false,
    );
    // Defaults count as the same, and other settings and sources don't count
    expect(
      differsFromPreset(
        {
          widthConfig: { usePressure: true, minPressure: 0.5, maxPressure: 1 },
          offsetXConfig: { usePressure: true },
          alphaConfig: { useRandomise: true },
        },
        preset,
        "pressure",
      ),
    ).toBe(false);
  });

  it("should be true when a source is turned on or off, or its range or profile graph differs", () => {
    expect(differsFromPreset({}, preset, "pressure")).toBe(true);
    expect(
      differsFromPreset(
        { widthConfig: { usePressure: true, minPressure: 0.2 } },
        preset,
        "pressure",
      ),
    ).toBe(true);
    expect(
      differsFromPreset(
        {
          widthConfig: {
            usePressure: true,
            minPressure: 0.5,
            profile: PROFILE_PRESETS[1]!.content.points,
          },
        },
        preset,
        "pressure",
      ),
    ).toBe(true);
    expect(
      differsFromPreset(
        { ...preset, heightConfig: { useTilt: true } },
        preset,
        "tilt",
      ),
    ).toBe(true);
  });
});

describe("resetSource", () => {
  it("should put back the whole variation of each pen setting that differs with the source, and nothing else", () => {
    const preset: BrushConfig = {
      rotationConfig: { useRandomise: true, minRandomise: 0.2 },
      alphaConfig: { usePressure: true },
    };
    const config: BrushConfig = {
      // Switched to pressure, turning randomise off
      rotationConfig: { usePressure: true, useRandomise: false },
      // Varies with tilt, which isn't reset with pressure
      widthConfig: { useTilt: true },
      alphaConfig: { usePressure: true },
    };
    const changes = resetSource(config, preset, "pressure");
    expect(changes).toEqual({
      rotationConfig: { useRandomise: true, minRandomise: 0.2 },
    });
    // A copy
    expect(changes.rotationConfig).not.toBe(preset.rotationConfig);
    expect(resetSource(config, preset, "tilt")).toEqual({ widthConfig: {} });
  });
});
