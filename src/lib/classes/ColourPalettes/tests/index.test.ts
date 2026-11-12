import { describe, it, expect, vi } from "vitest";
import ColourPalettes, {
  MAX_SAVED_PALETTES,
  paletteName,
  sanitiseColourPalettes,
} from "..";
import {
  COLOUR_PALETTE_TYPE,
  MAX_PALETTE_COLOURS,
  UNTITLED_PALETTE_NAME,
} from "../../../palette";
import { MAX_ASSET_TEXT_LENGTH, UNKNOWN_AUTHOR } from "../../../assets";
import { testPalette } from "../../../../testing/assets";

const id = "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a";
const other = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

/** The palettes' names and colours */
const summary = (palettes: ColourPalettes) =>
  palettes.items.map(
    ({ name, content }) => `${name}: ${content.colours.join(" ")}`,
  );

describe("paletteName", () => {
  it("should trim names, and refuse empty or long ones", () => {
    expect(paletteName("  Sunset ")).toBe("Sunset");
    expect(paletteName(" ")).toBeUndefined();
    expect(paletteName("x".repeat(MAX_ASSET_TEXT_LENGTH + 1))).toBeUndefined();
    expect(paletteName(1)).toBeUndefined();
  });
});

describe("sanitiseColourPalettes", () => {
  it("should keep palettes with a UUID, a name and valid colours, each ID once, with valid authors", () => {
    const sunset = testPalette(["#FF0000", "red", "#ff0000"], {
      id,
      name: " Sunset ",
      author: "Ada",
      group: "Warm",
      version: "1.0.0",
    });
    expect(
      sanitiseColourPalettes(
        [
          sunset,
          testPalette([], { id, name: "Again" }),
          testPalette([], {
            id: other,
            name: "Sea",
            author: { handle: "no name" } as never,
            group: " ",
            version: "",
          }),
          testPalette([], { id: "sea", name: "Sea" }),
          testPalette([], { id: other, name: "" }),
          { ...testPalette([], { id: other }), content: { colours: "#000" } },
          null,
        ],
        "Bo",
      ),
    ).toEqual([
      { ...sunset, name: "Sunset", content: { colours: ["#ff0000"] } },
      {
        "@type": COLOUR_PALETTE_TYPE,
        id: other,
        name: "Sea",
        author: "Bo",
        content: { colours: [] },
      },
    ]);
    expect(sanitiseColourPalettes("nothing")).toBeUndefined();
  });

  it("should upgrade palettes of version 1, naming ones without a name", () => {
    expect(
      sanitiseColourPalettes([
        { id, name: "Sunset", colours: ["#ff0000"], author: "Ada" },
        { id: other, colours: [] },
      ]),
    ).toEqual([
      testPalette(["#ff0000"], { id, name: "Sunset", author: "Ada" }),
      testPalette([], {
        id: other,
        name: UNTITLED_PALETTE_NAME,
        author: UNKNOWN_AUTHOR,
      }),
    ]);
  });

  it("should keep at most the most palettes", () => {
    const many = Array.from({ length: MAX_SAVED_PALETTES + 1 }, () =>
      testPalette(),
    );
    expect(sanitiseColourPalettes(many)).toHaveLength(MAX_SAVED_PALETTES);
  });
});

describe("ColourPalettes", () => {
  it("should make, rename and delete palettes, telling listeners", () => {
    const palettes = new ColourPalettes();
    const change = vi.fn();
    palettes.addEventListener("change", change);
    const sunset = palettes.create(" Sunset ", ["#FF7700"], { name: "Ada" })!;
    expect(sunset).toEqual({
      "@type": COLOUR_PALETTE_TYPE,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "Sunset",
      author: { name: "Ada" },
      content: { colours: ["#ff7700"] },
    });
    expect(palettes.create("Plain")?.author).toBe(UNKNOWN_AUTHOR);
    expect(palettes.get(sunset.id)).toBe(sunset);
    expect(palettes.create("")).toBeUndefined();
    expect(palettes.rename(sunset.id, "Dusk")).toBe(true);
    expect(palettes.rename(sunset.id, " ")).toBe(false);
    expect(palettes.rename("gone", "Dusk")).toBe(false);
    expect(summary(palettes)).toEqual(["Dusk: #ff7700", "Plain: "]);
    expect(palettes.remove("gone")).toBe(false);
    expect(palettes.remove(sunset.id)).toBe(true);
    expect(summary(palettes)).toEqual(["Plain: "]);
    expect(change).toHaveBeenCalledTimes(4);
  });

  it("should add and remove colours, each once, up to the most", () => {
    const palettes = new ColourPalettes();
    const { id } = palettes.create("Sunset")!;
    expect(palettes.addColour(id, "#FF0000")).toBe(true);
    expect(palettes.addColour(id, "#ff0000")).toBe(false);
    expect(palettes.addColour(id, "red")).toBe(false);
    expect(palettes.addColour("gone", "#00ff00")).toBe(false);
    expect(palettes.addColour(id, "#00ff00")).toBe(true);
    expect(palettes.removeColour(id, 0)).toBe(true);
    expect(palettes.removeColour(id, 5)).toBe(false);
    expect(palettes.removeColour(id, -1)).toBe(false);
    expect(palettes.removeColour("gone", 0)).toBe(false);
    expect(summary(palettes)).toEqual(["Sunset: #00ff00"]);
    const full = palettes.create(
      "Full",
      Array.from(
        { length: MAX_PALETTE_COLOURS },
        (_, i) => `#${i.toString(16).padStart(6, "0")}`,
      ),
    )!;
    expect(palettes.addColour(full.id, "#ffffff")).toBe(false);
  });

  it("should not make more than the most palettes", () => {
    const palettes = new ColourPalettes();
    for (let i = 0; i < MAX_SAVED_PALETTES; i++) palettes.create(`P${i}`);
    expect(palettes.create("One more")).toBeUndefined();
  });

  it("should add palettes, replacing those with the same IDs, and replace them all", () => {
    const palettes = new ColourPalettes();
    palettes.set([
      { id, name: "Sunset", colours: [] },
      { id: other, name: "Sea", colours: [] },
    ]);
    const change = vi.fn();
    palettes.addEventListener("change", change);
    const third = crypto.randomUUID();
    expect(
      palettes.merge([
        { id: other, name: "Ocean", colours: ["#0000ff"] },
        { id: third, name: "Forest", colours: [] },
        { id: "bad", name: "Bad", colours: [] },
      ]),
    ).toBe(2);
    expect(summary(palettes)).toEqual([
      "Sunset: ",
      "Ocean: #0000ff",
      "Forest: ",
    ]);
    expect(palettes.merge([])).toBe(0);
    expect(palettes.merge("nothing")).toBe(0);
    palettes.set("nothing");
    expect(change).toHaveBeenCalledOnce();
    palettes.set([{ id, name: "Only", colours: [] }]);
    expect(summary(palettes)).toEqual(["Only: "]);
  });

  it("should count only palettes that fit when adding", () => {
    const palettes = new ColourPalettes();
    for (let i = 0; i < MAX_SAVED_PALETTES; i++) palettes.create(`P${i}`);
    expect(
      palettes.merge([{ id: crypto.randomUUID(), name: "Extra", colours: [] }]),
    ).toBe(0);
  });
});
