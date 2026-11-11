import { sanitisePalette } from "../Palette";
import {
  MAX_PALETTE_COLOURS,
  MAX_PALETTE_NAME_LENGTH,
  MAX_PALETTES_PER_FILE,
  type ColourPalette,
} from "../../palette";
import { UUID_PATTERN, type AssetAuthor } from "../../assets";
import { validateColourPalette } from "../../validation/validators.generated.js";

/** ID of the palette PaintCanvas comes with (the canvas's `palette`), which can't be renamed or deleted */
export const DEFAULT_PALETTE_ID = "paintcanvas";

/** Most palettes a user can keep */
export const MAX_SAVED_PALETTES = MAX_PALETTES_PER_FILE;

const UUID = new RegExp(UUID_PATTERN);

/**
 * A palette name, trimmed, or undefined if it's empty or too long.
 *
 * @example
 * paletteName("  Sunset "); // "Sunset"
 */
export const paletteName = (name: unknown): string | undefined => {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_PALETTE_NAME_LENGTH
    ? trimmed
    : undefined;
};

/**
 * Keep only valid palettes from an untrusted value (e.g. stored or imported): each with a UUID, a name and valid colours
 * (see `sanitisePalette`), each ID once, up to `MAX_SAVED_PALETTES`. An invalid author is left out. Undefined if the
 * value isn't an array.
 *
 * @example
 * sanitiseColourPalettes([{ id: crypto.randomUUID(), name: "Sunset", colours: ["#FF0000", "red"] }]); // colours ["#ff0000"]
 */
export const sanitiseColourPalettes = (
  input: unknown,
): ColourPalette[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  const palettes = new Map<string, ColourPalette>();
  for (const palette of input) {
    if (palettes.size >= MAX_SAVED_PALETTES) break;
    const name = paletteName(palette?.name);
    const colours = sanitisePalette(palette?.colours);
    if (
      typeof palette?.id !== "string" ||
      !UUID.test(palette.id) ||
      palettes.has(palette.id) ||
      !name ||
      !colours
    )
      continue;
    const valid: ColourPalette = { id: palette.id, name, colours };
    const withAuthor = { ...valid, author: palette.author };
    palettes.set(
      palette.id,
      palette.author !== undefined && validateColourPalette(withAuthor)
        ? withAuthor
        : valid,
    );
  }
  return [...palettes.values()];
};

/**
 * The user's own colour palettes, each named and with its own colours (as lowercase `#rrggbb`, each once, up to
 * `MAX_PALETTE_COLOURS`), alongside the palette PaintCanvas comes with (the canvas's `palette`). Kept in memory; a
 * palette store keeps them (see `PaintCanvas.useAssetStores`).
 *
 * Dispatches a `change` event when the palettes change.
 *
 * @example
 * const palettes = new ColourPalettes();
 * const sunset = palettes.create("Sunset");
 * palettes.addColour(sunset.id, "#ff7700");
 */
export default class ColourPalettes extends EventTarget {
  private values: ColourPalette[] = [];

  /** The palettes, in the order they were made */
  get items(): readonly ColourPalette[] {
    return this.values;
  }

  /** A palette by ID */
  get(id: string): ColourPalette | undefined {
    return this.values.find((palette) => palette.id === id);
  }

  /**
   * Make a palette with a name (trimmed) and colours. Returns it, or undefined if the name isn't valid or there's no
   * room.
   *
   * @example
   * palettes.create("Sunset", ["#ff7700"], { name: "Ada" });
   */
  create(
    name: string,
    colours: readonly string[] = [],
    author?: AssetAuthor,
  ): ColourPalette | undefined {
    const [palette] = sanitiseColourPalettes([
      { id: crypto.randomUUID(), name, colours, author },
    ]) as ColourPalette[];
    if (!palette || this.values.length >= MAX_SAVED_PALETTES) return undefined;
    this.update([...this.values, palette]);
    return palette;
  }

  /**
   * Rename a palette. Returns whether it was renamed.
   */
  rename(id: string, name: string): boolean {
    const valid = paletteName(name);
    return valid !== undefined && this.change(id, { name: valid });
  }

  /**
   * Delete a palette. Returns whether it was deleted.
   */
  remove(id: string): boolean {
    const next = this.values.filter((palette) => palette.id !== id);
    if (next.length === this.values.length) return false;
    this.update(next);
    return true;
  }

  /**
   * Add a colour at the end of a palette. Returns whether it was added: not if it's already there, the palette is full,
   * or it isn't a `#rrggbb` colour.
   */
  addColour(id: string, colour: string): boolean {
    const palette = this.get(id);
    if (!palette || palette.colours.length >= MAX_PALETTE_COLOURS) return false;
    const colours = sanitisePalette([...palette.colours, colour]) as string[];
    return (
      colours.length > palette.colours.length && this.change(id, { colours })
    );
  }

  /**
   * Remove the colour at a position in a palette. Returns whether it was removed.
   */
  removeColour(id: string, index: number): boolean {
    const palette = this.get(id);
    if (!palette || index < 0 || index >= palette.colours.length) return false;
    return this.change(id, {
      colours: palette.colours.filter((_, i) => i !== index),
    });
  }

  /**
   * Add palettes (e.g. loaded from a store or imported), replacing the ones with the same IDs and keeping the others,
   * up to `MAX_SAVED_PALETTES`. Invalid palettes are left out (see `sanitiseColourPalettes`). Returns how many were
   * added or replaced.
   *
   * @example
   * palettes.merge(colourPaletteFile.parse(text));
   */
  merge(palettes: unknown): number {
    const added = sanitiseColourPalettes(palettes);
    if (!added?.length) return 0;
    const byId = new Map(this.values.map((palette) => [palette.id, palette]));
    for (const palette of added) byId.set(palette.id, palette);
    const next = [...byId.values()].slice(0, MAX_SAVED_PALETTES);
    this.update(next);
    return added.filter((palette) => next.some(({ id }) => id === palette.id))
      .length;
  }

  /**
   * Replace all the palettes (e.g. when restoring saved ones), keeping only valid ones.
   */
  set(palettes: unknown): void {
    const next = sanitiseColourPalettes(palettes);
    if (next) this.update(next);
  }

  /** Change a palette's name or colours. Returns whether it exists. */
  private change(
    id: string,
    changes: Partial<Pick<ColourPalette, "name" | "colours">>,
  ): boolean {
    if (!this.get(id)) return false;
    this.update(
      this.values.map((palette) =>
        palette.id === id ? { ...palette, ...changes } : palette,
      ),
    );
    return true;
  }

  /** Use the palettes and dispatch `change` */
  private update(palettes: ColourPalette[]): void {
    this.values = palettes;
    this.dispatchEvent(new Event("change"));
  }
}
