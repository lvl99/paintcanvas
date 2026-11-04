import { isHexColour } from "../../utils/colour";
import { DEFAULT_PALETTE, MAX_PALETTE_COLOURS } from "../../palette";

/**
 * Keep only valid colours from an untrusted value (e.g. stored or imported): lowercase `#rrggbb` strings, each once, up
 * to `MAX_PALETTE_COLOURS`. Undefined if the value isn't an array.
 *
 * @example
 * sanitisePalette(["#FF0000", "red", "#ff0000", "#00ff00"]); // ["#ff0000", "#00ff00"]
 * sanitisePalette("#ff0000"); // undefined
 */
export const sanitisePalette = (input: unknown): string[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  const colours = new Set<string>();
  for (const value of input) {
    if (colours.size >= MAX_PALETTE_COLOURS) break;
    if (isHexColour(value)) colours.add(value.toLowerCase());
  }
  return [...colours];
};

/**
 * The user's saved colours, shown as swatches. Each colour is kept once, as lowercase `#rrggbb`, up to
 * `MAX_PALETTE_COLOURS`. Kept in memory; the implementer saves and restores them (see `set` and the `change` event).
 *
 * Dispatches a `change` event when the colours change.
 *
 * @example
 * const palette = new Palette();
 * palette.add("#123456");
 * palette.colours.at(-1); // "#123456"
 */
export default class Palette extends EventTarget {
  private values: string[];

  /** Start with some colours (invalid ones are left out), or `DEFAULT_PALETTE` */
  constructor(colours: readonly string[] = DEFAULT_PALETTE) {
    super();
    this.values = sanitisePalette(colours) as string[];
  }

  /** The colours in order (read-only copy) */
  get colours(): readonly string[] {
    return this.values;
  }

  /**
   * Add a colour at the end. Returns whether it was added: not if it's already there, the palette is full, or it isn't a
   * `#rrggbb` colour.
   *
   * @example
   * palette.add("#FF0000"); // true, added as "#ff0000"
   */
  add(colour: string): boolean {
    const before = this.values.length;
    this.set([...this.values, colour]);
    return this.values.length > before;
  }

  /**
   * Add colours at the end, e.g. from an imported palette file, leaving out ones already there. Returns how many were
   * added.
   *
   * @example
   * palette.merge(["#ff0000", "#00ff00"]); // 1, if "#ff0000" was already there
   */
  merge(colours: readonly string[]): number {
    const before = this.values.length;
    this.set([...this.values, ...colours]);
    return this.values.length - before;
  }

  /**
   * Remove the colour at a position.
   *
   * @example
   * palette.remove(0);
   */
  remove(index: number): void {
    if (index < 0 || index >= this.values.length) return;
    this.set(this.values.filter((_, i) => i !== index));
  }

  /**
   * Replace all the colours (e.g. when restoring saved ones), keeping only valid ones, and dispatch `change` if they
   * changed.
   *
   * @example
   * palette.set(["#000000", "#ffffff"]);
   */
  set(colours: unknown): void {
    const next = sanitisePalette(colours);
    if (
      !next ||
      (next.length === this.values.length &&
        next.every((colour, i) => colour === this.values[i]))
    )
      return;
    this.values = next;
    this.dispatchEvent(new Event("change"));
  }
}
