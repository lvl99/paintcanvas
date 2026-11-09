import { describe, it, expect } from "vitest";
import { Ajv } from "ajv";
import {
  GRID_UNITS,
  Interpolation,
  LINEAR_PROFILE_ID,
  MAX_PROFILE_POINTS,
  PROFILE_PRESETS,
  applyProfile,
  isLinear,
  linearPoints,
  profileY,
  samePoints,
  type ProfilePoint,
} from "..";
import {
  MAX_PROFILE_TEXT_LENGTH,
  profileGraphSchema,
  profilePointsSchema,
} from "../schema";

const { Linear, BezierCubic } = Interpolation;

/** A preset's points */
const preset = (id: string) =>
  (
    PROFILE_PRESETS.find((graph) => graph.id === id) as {
      points: ProfilePoint[];
    }
  ).points;

describe("profile graph presets", () => {
  it("should have Linear, Overweight and Underweight, with kebab-case IDs", () => {
    expect(PROFILE_PRESETS.map(({ id, name }) => [id, name])).toEqual([
      [LINEAR_PROFILE_ID, "Linear"],
      ["overweight", "Overweight"],
      ["underweight", "Underweight"],
    ]);
    expect(preset("overweight")).toEqual([
      { x: 0, y: -10, i: Linear },
      { x: 3, y: -3, i: BezierCubic },
      { x: 10, y: 0, i: Linear },
    ]);
    expect(preset("underweight")[1]).toEqual({ x: 7, y: -7, i: BezierCubic });
  });

  it("should give a copy of Linear's points, and tell lists of points apart", () => {
    const points = linearPoints();
    expect(points).toEqual(preset(LINEAR_PROFILE_ID));
    points[0]!.y = -5;
    expect(preset(LINEAR_PROFILE_ID)[0]!.y).toBe(-10);
    expect(samePoints(linearPoints(), linearPoints())).toBe(true);
    expect(samePoints(points, linearPoints())).toBe(false);
    expect(samePoints(preset("overweight"), linearPoints())).toBe(false);
    expect(
      samePoints(
        [{ x: 0, y: -10, i: BezierCubic }, linearPoints()[1]!],
        linearPoints(),
      ),
    ).toBe(false);
    expect(isLinear(linearPoints())).toBe(true);
    expect(isLinear(preset("underweight"))).toBe(false);
  });
});

describe("profileY", () => {
  it("should go straight between sharp corners, through every point", () => {
    const points = [
      { x: 0, y: -10, i: Linear },
      { x: 5, y: -2, i: Linear },
      { x: 10, y: 0, i: Linear },
    ];
    expect(profileY(points, 0)).toBe(-10);
    expect(profileY(points, 2.5)).toBeCloseTo(-6);
    expect(profileY(points, 5)).toBeCloseTo(-2);
    expect(profileY(points, 7.5)).toBeCloseTo(-1);
    expect(profileY(points, 10)).toBe(0);
  });

  it("should curve smoothly through a bezier cubic point, with the same slope either side", () => {
    const points = preset("overweight");
    expect(profileY(points, 3)).toBeCloseTo(-3);
    const slope = (x: number) =>
      (profileY(points, x + 0.001) - profileY(points, x - 0.001)) / 0.002;
    expect(slope(3)).toBeCloseTo(1, 2);
    // Overweight is above the straight line; Underweight below it
    expect(profileY(points, 5)).toBeGreaterThan(-5);
    expect(profileY(preset("underweight"), 5)).toBeLessThan(-5);
  });

  it("should handle points on top of each other, and x outside the graph", () => {
    const points = [
      { x: 0, y: -10, i: BezierCubic },
      { x: 5, y: -8, i: BezierCubic },
      { x: 5, y: -2, i: BezierCubic },
      { x: 10, y: 0, i: Linear },
    ];
    // The smooth point's neighbours share an x: flat there
    expect(profileY(points, 4.999)).toBeCloseTo(-8, 1);
    expect(profileY(points, 5.001)).toBeCloseTo(-2, 1);
    expect(profileY(points, -1)).toBe(-10);
    expect(profileY([{ x: 4, y: -6, i: Linear }], 2)).toBe(-6);
    expect(profileY([{ x: 4, y: -6, i: Linear }], 6)).toBe(-6);
  });
});

describe("applyProfile", () => {
  it("should use the input as it is without a graph or with a straight line", () => {
    expect(applyProfile(undefined, 0.3)).toBe(0.3);
    expect(applyProfile([], 0.3)).toBe(0.3);
    expect(applyProfile(linearPoints(), 0.3)).toBeCloseTo(0.3);
    expect(applyProfile(undefined, 2)).toBe(1);
    expect(applyProfile(undefined, -1)).toBe(0);
  });

  it("should shape the input with the graph, kept within 0–1", () => {
    expect(applyProfile(preset("overweight"), 0.3)).toBeCloseTo(0.7);
    expect(applyProfile(preset("underweight"), 0.7)).toBeCloseTo(0.3);
    // A curve that overshoots the top is kept at 1
    const overshoot = [
      { x: 0, y: -10, i: Linear },
      { x: 2, y: 0, i: BezierCubic },
      { x: 10, y: 0, i: Linear },
    ];
    expect(applyProfile(overshoot, 0.4)).toBe(1);
  });
});

describe("profile graph schemas", () => {
  const ajv = new Ajv({ strict: true });
  const validatePoints = ajv.compile(profilePointsSchema);
  const validateGraph = ajv.compile(profileGraphSchema);

  it("should compile in ajv strict mode and accept the presets", () => {
    for (const graph of PROFILE_PRESETS) {
      expect(validatePoints(graph.points)).toBe(true);
      expect(validateGraph(graph)).toBe(true);
    }
  });

  it("should reject points off the grid, unknown interpolations, too few or many points, and bad names", () => {
    const point = (changes: Partial<Record<string, unknown>>) => [
      { x: 0, y: -10, i: Linear, ...changes },
      { x: GRID_UNITS, y: 0, i: Linear },
    ];
    expect(validatePoints(point({ x: -1 }))).toBe(false);
    expect(validatePoints(point({ x: 11 }))).toBe(false);
    expect(validatePoints(point({ y: 1 }))).toBe(false);
    expect(validatePoints(point({ y: -11 }))).toBe(false);
    expect(validatePoints(point({ i: "curvy" }))).toBe(false);
    expect(validatePoints(point({ extra: true }))).toBe(false);
    expect(validatePoints([{ x: 0, y: -10, i: Linear }])).toBe(false);
    expect(
      validatePoints(
        Array.from({ length: MAX_PROFILE_POINTS + 1 }, () => ({
          x: 5,
          y: -5,
          i: Linear,
        })),
      ),
    ).toBe(false);
    const graph = PROFILE_PRESETS[0]!;
    expect(validateGraph({ ...graph, name: "" })).toBe(false);
    expect(
      validateGraph({ ...graph, id: "x".repeat(MAX_PROFILE_TEXT_LENGTH + 1) }),
    ).toBe(false);
    expect(validateGraph({ id: "a", name: "A" })).toBe(false);
  });
});
