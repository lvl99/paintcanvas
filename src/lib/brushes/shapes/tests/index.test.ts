import { describe, it, expect } from "vitest";
import { BUILT_IN_SHAPES, builtInShapeId } from "..";
import { brushPresets, eraserPresets } from "../..";

/** A PNG data URL's width and height, from its header */
const pngSize = (dataUrl: string) => {
  const bytes = Buffer.from(dataUrl.split(",")[1]!, "base64");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

describe("built-in brush shapes", () => {
  it("should be square PNG images with unique ids", () => {
    expect(new Set(BUILT_IN_SHAPES.map((shape) => shape.id)).size).toBe(
      BUILT_IN_SHAPES.length,
    );
    for (const shape of BUILT_IN_SHAPES) {
      expect(shape.image.startsWith("data:image/png;base64,"), shape.id).toBe(
        true,
      );
      const [width, height] = pngSize(shape.image);
      expect(width, shape.id).toBe(height);
    }
  });

  it("should include every shape the built-in presets use", () => {
    const images = new Set(BUILT_IN_SHAPES.map((shape) => shape.image));
    for (const preset of [
      ...Object.values(brushPresets),
      ...Object.values(eraserPresets),
    ])
      if (preset.image !== undefined)
        expect(images.has(preset.image as string), preset.id).toBe(true);
  });

  it("should tell which built-in shape a brush uses", () => {
    expect(builtInShapeId(undefined)).toBe("round");
    expect(builtInShapeId(BUILT_IN_SHAPES[2]!.image)).toBe("square");
    expect(builtInShapeId("data:image/png;base64,AAAA")).toBeUndefined();
  });
});
