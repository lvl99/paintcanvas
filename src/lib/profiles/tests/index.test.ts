import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { withoutType } from "../../validation/standalone";
import {
  GRID_UNITS,
  Interpolation,
  LINEAR_PROFILE_ID,
  MAX_PROFILE_POINTS,
  PROFILE_GRAPH_TYPE,
  PROFILE_PRESETS,
  applyProfile,
  isLinear,
  linearPoints,
  profileY,
  samePoints,
  type ProfilePoint,
} from "..";
import { BUILT_IN_AUTHOR, MAX_ASSET_TEXT_LENGTH } from "../../assets/schema";
import {
  MAX_SAVED_PROFILES,
  PROFILE_GRAPH_COLLECTION_TYPE,
  profileGraphCollectionSchema,
  profileGraphSchema,
  profilePointsSchema,
} from "../schema";

const { Linear, BezierQuad, BezierCubic } = Interpolation;

/** A preset's points */
const preset = (id: string): ProfilePoint[] =>
  PROFILE_PRESETS.find((graph) => graph.id === id)!.content.points;

describe("profile graph presets", () => {
  it("should have Linear, Overweight and Underweight, with kebab-case IDs", () => {
    expect(PROFILE_PRESETS.map(({ id, name }) => [id, name])).toEqual([
      [LINEAR_PROFILE_ID, "Linear"],
      ["overweight", "Overweight"],
      ["underweight", "Underweight"],
    ]);
    for (const graph of PROFILE_PRESETS) {
      expect(graph["@type"]).toBe(PROFILE_GRAPH_TYPE);
      expect(graph.author).toBe(BUILT_IN_AUTHOR);
    }
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

describe("profileY with bezier quad points", () => {
  it("should bend towards a bezier quad point between the midpoints either side, without reaching it", () => {
    const points: ProfilePoint[] = [
      { x: 0, y: -10, i: Linear },
      { x: 5, y: 0, i: BezierQuad },
      { x: 10, y: 0, i: Linear },
    ];
    // Straight to the first midpoint (2.5, -5), and from the second (7.5, 0) on
    expect(profileY(points, 1.25)).toBeCloseTo(-7.5);
    expect(profileY(points, 2.5)).toBeCloseTo(-5);
    expect(profileY(points, 8.75)).toBeCloseTo(0);
    // The quadratic curve from (2.5, -5) to (7.5, 0) bending towards (5, 0): at its middle, t = 0.5
    expect(profileY(points, 5)).toBeCloseTo(-1.25);
    expect(profileY(points, 5)).toBeLessThan(0);
    // Smooth where the curve meets the straight piece
    const slope = (x: number) =>
      (profileY(points, x + 0.001) - profileY(points, x - 0.001)) / 0.002;
    expect(slope(2.5)).toBeCloseTo(2, 2);
  });

  it("should meet at the midpoint between two bezier quad points, and run through the first and last points", () => {
    const points: ProfilePoint[] = [
      { x: 0, y: -10, i: BezierQuad },
      { x: 4, y: -2, i: BezierQuad },
      { x: 6, y: -8, i: BezierQuad },
      { x: 10, y: 0, i: BezierQuad },
    ];
    expect(profileY(points, 0)).toBeCloseTo(-10);
    expect(profileY(points, 10)).toBeCloseTo(0);
    expect(profileY(points, 5)).toBeCloseTo(-5);
    // Bends towards the points without reaching them
    expect(profileY(points, 4)).toBeLessThan(-2);
    expect(profileY(points, 6)).toBeGreaterThan(-8);
  });

  it("should handle a bezier quad point with a neighbour at the same x", () => {
    const points: ProfilePoint[] = [
      { x: 0, y: -10, i: Linear },
      { x: 0, y: -4, i: BezierQuad },
      { x: 10, y: 0, i: Linear },
    ];
    // The curve's control is at its start's x, so it's solved with a square root
    expect(profileY(points, 2.5)).toBeGreaterThan(-4);
    expect(profileY(points, 5)).toBeCloseTo(-2);
    const flat: ProfilePoint[] = [
      { x: 0, y: -10, i: Linear },
      { x: 2, y: -4, i: Linear },
      { x: 2, y: -4, i: BezierQuad },
      { x: 2, y: -4, i: Linear },
      { x: 10, y: 0, i: Linear },
    ];
    expect(profileY(flat, 6)).toBeCloseTo(-2);
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
  const ajv = new Ajv2020({ strict: true });
  const validatePoints = ajv.compile(profilePointsSchema);
  const validateGraph = ajv.compile(withoutType(profileGraphSchema));
  const validateCollection = ajv.compile(
    withoutType(profileGraphCollectionSchema),
  );
  const uuid = "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a";

  it("should be published with versioned URLs and types", () => {
    expect(profileGraphSchema.$id).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/profile-graph-2.2.0.json",
    );
    expect(profileGraphSchema["@type"]).toBe("PaintCanvas/ProfileGraph");
    expect(profileGraphCollectionSchema.$id).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/profile-graph-collection-2.2.0.json",
    );
    expect(profileGraphCollectionSchema["@type"]).toBe(
      "PaintCanvas/ProfileGraphCollection",
    );
  });

  it("should take all three interpolations", () => {
    for (const i of [Linear, BezierQuad, BezierCubic])
      expect(
        validatePoints([
          { x: 0, y: -10, i },
          { x: 10, y: 0, i },
        ]),
      ).toBe(true);
    expect(
      validatePoints([
        { x: 0, y: -10, i: "spline" },
        { x: 10, y: 0, i: Linear },
      ]),
    ).toBe(false);
  });

  it("should take a UUID or a built-in graph's ID, and an author", () => {
    const graph = PROFILE_PRESETS[1]!;
    expect(validateGraph({ ...graph, id: uuid, author: "Ada" })).toBe(true);
    expect(validateGraph({ ...graph, id: "custom" })).toBe(false);
    expect(
      validateCollection({
        $schema: profileGraphCollectionSchema.$id,
        "@type": PROFILE_GRAPH_COLLECTION_TYPE,
        items: [...PROFILE_PRESETS, { ...graph, id: uuid }],
      }),
    ).toBe(true);
    expect(
      validateCollection({
        $schema: profileGraphCollectionSchema.$id,
        "@type": PROFILE_GRAPH_COLLECTION_TYPE,
        items: Array(MAX_SAVED_PROFILES + 1).fill(graph),
      }),
    ).toBe(false);
  });

  it("should compile in ajv strict mode and accept the presets", () => {
    for (const graph of PROFILE_PRESETS) {
      expect(validatePoints(graph.content.points)).toBe(true);
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
      validateGraph({
        ...graph,
        name: "x".repeat(MAX_ASSET_TEXT_LENGTH + 1),
      }),
    ).toBe(false);
    expect(validateGraph({ id: "a", name: "A" })).toBe(false);
    expect(validateGraph({ ...graph, content: {} })).toBe(false);
    expect(validateGraph({ ...graph, author: undefined })).toBe(false);
  });
});
