import { describe, it, expect } from "vitest";
import { testPalette, testPreset, testProfile } from "../assets";
import { BRUSH_PRESET_TYPE } from "../../lib/presets/schema";
import { COLOUR_PALETTE_TYPE } from "../../lib/palette/schema";
import { PROFILE_GRAPH_TYPE } from "../../lib/profiles";

describe("test assets", () => {
  it("should fill in the header, keeping the parts given", () => {
    const preset = testPreset({ width: 4 }, { name: "Big", group: "G" });
    expect(preset).toEqual({
      "@type": BRUSH_PRESET_TYPE,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "Big",
      author: "Tester",
      group: "G",
      content: { width: 4 },
    });
    expect(testPreset().content).toEqual({});
    expect(testPalette(["#ff0000"], { id: "p" })).toMatchObject({
      "@type": COLOUR_PALETTE_TYPE,
      id: "p",
      name: "Test palette",
      content: { colours: ["#ff0000"] },
    });
    expect(testPalette().content).toEqual({ colours: [] });
    expect(testProfile([], { author: "Ada" })).toMatchObject({
      "@type": PROFILE_GRAPH_TYPE,
      name: "Test graph",
      author: "Ada",
      content: { points: [] },
    });
  });
});
