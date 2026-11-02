import { describe, it, expect } from "vitest";
import StrokeSampler, {
  DEFAULT_SAMPLE_RATE,
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  clampSampleRate,
} from "..";

describe("clampSampleRate", () => {
  it("should keep sample rates within 5–400 ms with a default", () => {
    expect(clampSampleRate(undefined)).toBe(DEFAULT_SAMPLE_RATE);
    expect(clampSampleRate(1)).toBe(MIN_SAMPLE_RATE);
    expect(clampSampleRate(1000)).toBe(MAX_SAMPLE_RATE);
    expect(clampSampleRate(50)).toBe(50);
  });
});

describe("StrokeSampler", () => {
  it("should record the first point, then points at most every sample rate", () => {
    const sampler = new StrokeSampler(50);
    expect(sampler.start({ x: 0, y: 0 }, 1000)).toEqual({ x: 0, y: 0 });
    expect(sampler.move({ x: 1, y: 0 }, 1020)).toBeUndefined();
    expect(sampler.move({ x: 2, y: 0 }, 1050)).toEqual({ x: 2, y: 0 });
    expect(sampler.move({ x: 3, y: 0 }, 1099)).toBeUndefined();
    expect(sampler.move({ x: 4, y: 0 }, 1100)).toEqual({ x: 4, y: 0 });
    expect(sampler.points.map((p) => p.x)).toEqual([0, 2, 4]);
  });

  it("should not record while the pointer is still", () => {
    const sampler = new StrokeSampler(10);
    sampler.start({ x: 5, y: 5 }, 0);
    expect(sampler.move({ x: 5, y: 5 }, 500)).toBeUndefined();
    expect(sampler.points).toHaveLength(1);
  });

  it("should record the last point only if it moved", () => {
    const sampler = new StrokeSampler(400);
    sampler.start({ x: 0, y: 0 }, 0);
    expect(sampler.end({ x: 0, y: 0 }, 5)).toBeUndefined();
    expect(sampler.end({ x: 0, y: 3 }, 6)).toEqual({ x: 0, y: 3 });
    expect(sampler.last).toEqual({ x: 0, y: 3 });
  });

  it("should keep pressure and tilt and start fresh for each stroke", () => {
    const sampler = new StrokeSampler();
    expect(sampler.sampleRate).toBe(DEFAULT_SAMPLE_RATE);
    sampler.start({ x: 0, y: 0, pressure: 0.2, tiltX: 10, tiltY: -5 }, 0);
    sampler.move({ x: 1, y: 0 }, 100);
    sampler.start({ x: 9, y: 9 }, 200);
    expect(sampler.points).toEqual([{ x: 9, y: 9 }]);
    expect(new StrokeSampler().last).toBeUndefined();
  });
});
