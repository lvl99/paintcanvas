import { describe, it, expect, vi } from "vitest";
import Palette, { sanitisePalette } from "..";
import { DEFAULT_PALETTE, MAX_PALETTE_COLOURS } from "../../../palette";

/** `count` different colours */
const manyColours = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => `#${i.toString(16).padStart(6, "0")}`,
  );

describe("sanitisePalette", () => {
  it("should keep valid colours once each, as lowercase", () => {
    expect(
      sanitisePalette(["#FF0000", "red", "#ff0000", 5, "#00ff00"]),
    ).toEqual(["#ff0000", "#00ff00"]);
  });

  it("should keep up to the most colours a palette holds", () => {
    expect(sanitisePalette(manyColours(MAX_PALETTE_COLOURS + 5))).toHaveLength(
      MAX_PALETTE_COLOURS,
    );
  });

  it("should give nothing for a value that isn't an array", () => {
    expect(sanitisePalette("#ff0000")).toBeUndefined();
    expect(sanitisePalette(undefined)).toBeUndefined();
  });
});

describe("Palette", () => {
  it("should start with the default palette, or the colours given", () => {
    expect(new Palette().colours).toEqual(DEFAULT_PALETTE);
    expect(new Palette(["#FFFFFF", "nope"]).colours).toEqual(["#ffffff"]);
  });

  it("should add a colour once, dispatching a change", () => {
    const palette = new Palette([]);
    const listener = vi.fn();
    palette.addEventListener("change", listener);
    expect(palette.add("#ABCDEF")).toBe(true);
    expect(palette.add("#abcdef")).toBe(false);
    expect(palette.add("blue")).toBe(false);
    expect(palette.colours).toEqual(["#abcdef"]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should not add colours to a full palette", () => {
    const palette = new Palette(manyColours(MAX_PALETTE_COLOURS));
    expect(palette.add("#ffffff")).toBe(false);
    expect(palette.colours).toHaveLength(MAX_PALETTE_COLOURS);
  });

  it("should merge colours, leaving out ones already there", () => {
    const palette = new Palette(["#000000"]);
    expect(palette.merge(["#000000", "#FF0000", "#00ff00"])).toBe(2);
    expect(palette.colours).toEqual(["#000000", "#ff0000", "#00ff00"]);
  });

  it("should remove the colour at a position, ignoring positions outside it", () => {
    const palette = new Palette(["#000000", "#ff0000", "#00ff00"]);
    const listener = vi.fn();
    palette.addEventListener("change", listener);
    palette.remove(1);
    expect(palette.colours).toEqual(["#000000", "#00ff00"]);
    palette.remove(-1);
    palette.remove(2);
    expect(palette.colours).toEqual(["#000000", "#00ff00"]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should replace the colours, only dispatching a change when they change", () => {
    const palette = new Palette(["#000000"]);
    const listener = vi.fn();
    palette.addEventListener("change", listener);
    palette.set(["#000000"]);
    palette.set("not a palette");
    expect(listener).not.toHaveBeenCalled();
    palette.set(["#ffffff", "#000000"]);
    expect(palette.colours).toEqual(["#ffffff", "#000000"]);
    palette.set(["#000000", "#ffffff"]);
    expect(palette.colours).toEqual(["#000000", "#ffffff"]);
    palette.set([]);
    expect(palette.colours).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
