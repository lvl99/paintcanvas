import type { BrushConfig, BrushesConfig } from "../../types";

/** Settings that depend on a preset's size */
export type PerSize = (size: number) => Partial<BrushConfig>;

/**
 * Make a family of presets, one per size, from the family's default config. IDs are the prefix and the size (e.g.
 * "round10"), names the family's name and the size (e.g. "Round 10px"), and the family's name is their group.
 *
 * @param perSize - settings that depend on the size (e.g. spacing)
 * @example
 * sizedPresets("round", "Round", [1, 5], { image: ROUND_IMAGE }, (size) => ({ spacing: size }));
 * // { round1: { id: "round1", name: "Round 1px", group: "Round", width: 1, height: 1, spacing: 1, ... }, round5: ... }
 */
export const sizedPresets = (
  idPrefix: string,
  name: string,
  sizes: number[],
  defaults: Partial<BrushConfig>,
  perSize: PerSize = () => ({}),
): BrushesConfig =>
  Object.fromEntries(
    sizes.map((size) => {
      const id = `${idPrefix}${size}`;
      return [
        id,
        {
          ...defaults,
          id,
          name: `${name} ${size}px`,
          group: name,
          width: size,
          height: size,
          ...perSize(size),
        },
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
