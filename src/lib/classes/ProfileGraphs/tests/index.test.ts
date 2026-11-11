import { describe, it, expect, vi } from "vitest";
import ProfileGraphs, { sanitisePoints, sanitiseProfiles } from "..";
import {
  Interpolation,
  MAX_PROFILE_POINTS,
  PROFILE_PRESETS,
  linearPoints,
} from "../../../profiles";
import {
  MAX_PROFILE_TEXT_LENGTH,
  MAX_SAVED_PROFILES,
} from "../../../profiles/schema";

const { Linear, BezierCubic } = Interpolation;

/** Overweight's points */
const curved = () => PROFILE_PRESETS[1]!.points.map((point) => ({ ...point }));

describe("sanitisePoints", () => {
  it("should keep points on the grid with a known interpolation, from left to right", () => {
    expect(
      sanitisePoints([
        { x: 10, y: 0, i: Linear, extra: 1 },
        { x: 0, y: -10, i: Linear },
        { x: 5, y: -5, i: BezierCubic },
        { x: 11, y: 0, i: Linear },
        { x: 5, y: 1, i: Linear },
        { x: 5, y: -11, i: Linear },
        { x: -1, y: 0, i: Linear },
        { x: 5, y: -5, i: "wavy" },
        { x: "5", y: -5, i: Linear },
        null,
      ]),
    ).toEqual([
      { x: 0, y: -10, i: Linear },
      { x: 5, y: -5, i: BezierCubic },
      { x: 10, y: 0, i: Linear },
    ]);
  });

  it("should need an array of 2 to the most points", () => {
    expect(sanitisePoints("points")).toBeUndefined();
    expect(sanitisePoints([{ x: 0, y: -10, i: Linear }])).toBeUndefined();
    expect(
      sanitisePoints(
        Array.from({ length: MAX_PROFILE_POINTS + 1 }, () => ({
          x: 5,
          y: -5,
          i: Linear,
        })),
      ),
    ).toBeUndefined();
  });
});

describe("sanitiseProfiles", () => {
  it("should keep graphs with an ID, a name and valid points, each ID once and none of the presets'", () => {
    expect(sanitiseProfiles({})).toBeUndefined();
    expect(
      sanitiseProfiles([
        { id: "a", name: " Soft ", points: curved() },
        { id: "a", name: "Again", points: curved() },
        { id: "b", name: "", points: curved() },
        { id: "", name: "No ID", points: curved() },
        {
          id: "c",
          name: "x".repeat(MAX_PROFILE_TEXT_LENGTH + 1),
          points: curved(),
        },
        { id: "d", name: "Few points", points: [] },
        { id: "overweight", name: "Mine", points: curved() },
        null,
      ]),
    ).toEqual([{ id: "a", name: "Soft", points: curved() }]);
  });

  it("should keep at most the most graphs", () => {
    const many = Array.from({ length: MAX_SAVED_PROFILES + 1 }, (_, i) => ({
      id: `g${i}`,
      name: `Graph ${i}`,
      points: linearPoints(),
    }));
    expect(sanitiseProfiles(many)).toHaveLength(MAX_SAVED_PROFILES);
  });
});

describe("ProfileGraphs", () => {
  it("should have the presets and none of the user's own at first", () => {
    const profiles = new ProfileGraphs();
    expect(profiles.graphs).toEqual([]);
    expect(profiles.all).toEqual(PROFILE_PRESETS);
    expect(profiles.get("underweight")?.name).toBe("Underweight");
    expect(profiles.get(undefined)).toBeUndefined();
    expect(profiles.isPreset("linear")).toBe(true);
    expect(profiles.isPreset("mine")).toBe(false);
  });

  it("should save a new graph with a UUID, replace one by its ID, and tell listeners", () => {
    const profiles = new ProfileGraphs();
    const change = vi.fn();
    profiles.addEventListener("change", change);
    const soft = profiles.save({ name: "Soft", points: curved() })!;
    expect(soft.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(profiles.graphs).toEqual([soft]);
    expect(profiles.all.at(-1)).toEqual(soft);
    expect(profiles.get(soft.id)).toEqual(soft);
    expect(profiles.findByName(" SOFT ")).toEqual(soft);
    expect(profiles.findByName("Hard")).toBeUndefined();
    const replaced = profiles.save({
      id: soft.id,
      name: "Softer",
      points: linearPoints(),
    })!;
    expect(replaced).toEqual({
      id: soft.id,
      name: "Softer",
      points: linearPoints(),
    });
    expect(profiles.graphs).toEqual([replaced]);
    // An unknown ID saves a new graph
    const other = profiles.save({
      id: "unknown",
      name: "Other",
      points: curved(),
    })!;
    expect(other.id).not.toBe("unknown");
    expect(change).toHaveBeenCalledTimes(3);
  });

  it("should not save a graph without a name, with invalid points, with a preset's ID, or when full", () => {
    const profiles = new ProfileGraphs();
    expect(profiles.save({ name: " ", points: curved() })).toBeUndefined();
    expect(profiles.save({ name: "Bad", points: [] })).toBeUndefined();
    expect(
      profiles.save({ id: "overweight", name: "Mine", points: curved() })?.id,
    ).not.toBe("overweight");
    profiles.set(
      Array.from({ length: MAX_SAVED_PROFILES }, (_, i) => ({
        id: `g${i}`,
        name: `Graph ${i}`,
        points: linearPoints(),
      })),
    );
    expect(
      profiles.save({ name: "One more", points: curved() }),
    ).toBeUndefined();
    // Replacing one still works
    expect(
      profiles.save({ id: "g0", name: "First", points: curved() })?.name,
    ).toBe("First");
  });

  it("should rename and delete the user's own graphs, but not presets", () => {
    const profiles = new ProfileGraphs();
    const soft = profiles.save({ name: "Soft", points: curved() })!;
    expect(profiles.rename(soft.id, "Gentle")).toBe(true);
    expect(profiles.get(soft.id)?.name).toBe("Gentle");
    expect(profiles.rename(soft.id, "")).toBe(false);
    expect(profiles.rename("overweight", "Heavy")).toBe(false);
    expect(profiles.remove("overweight")).toBe(false);
    expect(profiles.remove(soft.id)).toBe(true);
    expect(profiles.graphs).toEqual([]);
  });

  it("should replace all the user's graphs with valid ones, ignoring values that aren't lists", () => {
    const profiles = new ProfileGraphs();
    const change = vi.fn();
    profiles.addEventListener("change", change);
    profiles.set([{ id: "a", name: "A", points: curved() }, { id: "b" }]);
    expect(profiles.graphs.map(({ id }) => id)).toEqual(["a"]);
    profiles.set("nothing");
    expect(profiles.graphs).toHaveLength(1);
    expect(change).toHaveBeenCalledOnce();
  });

  it("should add graphs, replacing the user's graphs with the same IDs, up to the most graphs", () => {
    const profiles = new ProfileGraphs();
    profiles.set([
      { id: "a", name: "A", points: curved() },
      { id: "b", name: "B", points: curved() },
    ]);
    const change = vi.fn();
    profiles.addEventListener("change", change);
    profiles.merge([
      { id: "b", name: "Bee", points: curved() },
      { id: "c", name: "C", points: curved() },
      { id: "linear", name: "Mine", points: curved() },
    ]);
    expect(profiles.items.map(({ id, name }) => `${id}:${name}`)).toEqual([
      "a:A",
      "b:Bee",
      "c:C",
    ]);
    expect(profiles.items).toBe(profiles.graphs);
    profiles.merge([]);
    profiles.merge("nothing");
    expect(change).toHaveBeenCalledOnce();
    profiles.merge(
      Array.from({ length: MAX_SAVED_PROFILES }, (_, i) => ({
        id: `n${i}`,
        name: `N${i}`,
        points: curved(),
      })),
    );
    expect(profiles.graphs).toHaveLength(MAX_SAVED_PROFILES);
    expect(profiles.graphs[0]?.id).toBe("a");
  });
});
