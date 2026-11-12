import { BUILT_IN_AUTHOR } from "../../../assets/schema";
import { BRUSH_PRESET_TYPE } from "../../../presets/schema";
import type { BrushConfig, BrushesConfig, BrushPreset } from "../../types";

/** Settings that depend on a preset's size */
export type PerSize = (size: number) => Partial<BrushConfig>;

/** The header of a preset that comes with PaintCanvas (its `@type` and author are set for it) */
export type BuiltInPresetHeader = Pick<
  BrushPreset,
  "id" | "name" | "group" | "version"
>;

/**
 * A preset that comes with PaintCanvas, by `BUILT_IN_AUTHOR`.
 *
 * @example
 * builtInPreset({ id: "pencil", name: "Pencil 4px", group: "Sketching", version: "1.0.0" }, { width: 4, height: 4 });
 * // { "@type": "PaintCanvas/BrushPreset", id: "pencil", ..., author: "PaintCanvas", content: { width: 4, height: 4 } }
 */
export const builtInPreset = (
  header: BuiltInPresetHeader,
  content: BrushConfig,
): BrushPreset => ({
  "@type": BRUSH_PRESET_TYPE,
  ...header,
  author: BUILT_IN_AUTHOR,
  content,
});

/** A family of presets made by `sizedPresets` */
export interface SizedFamily {
  /** Starts each preset's ID, which ends with its size (e.g. "round" makes "round10") */
  idPrefix: string;
  /** The family's name: its group, and the start of each preset's name (e.g. "Round" makes "Round 10px") */
  name: string;
  /** The presets' version */
  version: string;
}

/**
 * Make a family of presets, one per size, from the family's default settings. IDs are the prefix and the size (e.g.
 * "round10"), names the family's name and the size (e.g. "Round 10px"), and the family's name is their group.
 *
 * @param perSize - settings that depend on the size (e.g. spacing)
 * @example
 * sizedPresets({ idPrefix: "round", name: "Round", version: "1.1.0" }, [1, 5], { image: ROUND_IMAGE },
 *   (size) => ({ spacing: size }));
 * // { round1: { id: "round1", name: "Round 1px", group: "Round", content: { width: 1, height: 1, spacing: 1, ... } }, ... }
 */
export const sizedPresets = (
  { idPrefix, name, version }: SizedFamily,
  sizes: number[],
  defaults: BrushConfig,
  perSize: PerSize = () => ({}),
): BrushesConfig =>
  Object.fromEntries(
    sizes.map((size) => {
      const id = `${idPrefix}${size}`;
      return [
        id,
        builtInPreset(
          { id, name: `${name} ${size}px`, group: name, version },
          { ...defaults, width: size, height: size, ...perSize(size) },
        ),
      ];
    }),
  );

/**
 * Space stamps by a fraction of the size, at least 1 pixel apart.
 *
 * @example
 * spacedBy(0.25)(40); // { spacing: 10 }
 */
export const spacedBy =
  (fraction: number): PerSize =>
  (size) => ({ spacing: Math.max(1, Math.round(size * fraction)) });
