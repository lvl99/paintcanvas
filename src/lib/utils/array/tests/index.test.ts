import { describe, it, expect } from "vitest";
import { moveItem } from "..";

describe("moveItem", () => {
  it("should move an item down and shift the items in between up", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("should move an item up and shift the items in between down", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("should clamp indexes to the list bounds", () => {
    expect(moveItem(["a", "b", "c"], -5, 10)).toEqual(["b", "c", "a"]);
  });

  it("should not change the original list", () => {
    const items = ["a", "b"];
    moveItem(items, 0, 1);
    expect(items).toEqual(["a", "b"]);
  });

  it("should handle an empty list", () => {
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});
