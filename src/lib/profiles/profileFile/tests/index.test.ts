import { describe, it, expect } from "vitest";
import { profileGraphFile } from "..";
import { AssetFileError, UNKNOWN_AUTHOR } from "../../../assets";
import { Interpolation, PROFILE_GRAPH_TYPE } from "../..";
import { UNTITLED_PROFILE_NAME } from "../../schema";

const points = [
  { x: 0, y: -10, i: Interpolation.Linear },
  { x: 10, y: 0, i: Interpolation.Linear },
];

const graph = {
  "@type": PROFILE_GRAPH_TYPE,
  id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
  name: "Soft",
  author: "Ada",
  updatedAt: "2026-11-13T09:30:00.000Z",
  content: { points },
};

describe("profileGraphFile", () => {
  it("should write graphs to a file that reads back the same", () => {
    const json = profileGraphFile.write([graph]);
    expect(JSON.parse(json)).toEqual({
      $schema:
        "https://lvl99.github.io/paintcanvas/schemas/profile-graph-collection-2.1.0.json",
      "@type": "PaintCanvas/ProfileGraphCollection",
      items: [graph],
    });
    expect(profileGraphFile.parse(json)).toEqual([graph]);
    expect(profileGraphFile.fileName(new Date(2026, 10, 11))).toBe(
      "paintcanvas-profile-graphs-2026-11-11.json",
    );
  });

  it("should not read graphs with IDs that aren't UUIDs or a built-in graph's", () => {
    const json = profileGraphFile.write([graph]).replace(graph.id, "custom");
    expect(() => profileGraphFile.parse(json)).toThrow(
      new AssetFileError("invalid"),
    );
  });

  it("should not read files without a versioned schema", () => {
    expect(() => profileGraphFile.read({ items: [graph] })).toThrow(
      new AssetFileError("invalid"),
    );
  });

  it("should read files of version 1, giving graphs without a name or author defaults", () => {
    const file = {
      $schema:
        "https://lvl99.github.io/paintcanvas/schemas/profile-graph-collection-1.0.0.json",
      "@type": "PaintCanvas/ProfileGraphCollection",
      items: [
        { id: graph.id, name: "Soft", author: "Bo", points },
        { id: graph.id, points },
      ],
    };
    expect(profileGraphFile.read(file, { author: "Ada" })).toEqual([
      { ...graph, author: "Bo", updatedAt: undefined },
      { ...graph, name: UNTITLED_PROFILE_NAME, updatedAt: undefined },
    ]);
    expect(profileGraphFile.read(file)[1]?.author).toBe(UNKNOWN_AUTHOR);
  });
});
