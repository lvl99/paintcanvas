import { BUILT_IN_AUTHOR, UNKNOWN_AUTHOR } from "../../assets/schema";
import type { AssetAuthor, BrushPreset } from "../types";

// The author of the presets that come with PaintCanvas is also their heading, unless the implementer names it
export { BUILT_IN_AUTHOR, UNKNOWN_AUTHOR };

/** The heading of the user's own presets */
export const MY_PRESETS = "My presets";

/** Names used when grouping presets, instead of PaintCanvas's own */
export interface AuthorNames {
  /** Heading of the presets that come with the app (default `BUILT_IN_AUTHOR`) */
  builtIn?: string;
  /** Author name of presets made by a user without a handle (default `UNKNOWN_AUTHOR`) */
  unknown?: string;
}

/** Presets listed under one heading */
export interface PresetGroup {
  label: string;
  presets: BrushPreset[];
}

/**
 * An author's name.
 *
 * @example
 * authorName({ name: "Ada", handle: "ada.example" }); // "Ada"
 * authorName(undefined); // "Unknown"
 */
export const authorName = (author: AssetAuthor | undefined): string =>
  (typeof author === "string" ? author : author?.name) || UNKNOWN_AUTHOR;

/**
 * An author's handle, if known.
 */
export const authorHandle = (
  author: AssetAuthor | undefined,
): string | undefined =>
  typeof author === "object" ? author.handle : undefined;

/**
 * Whether a preset's author is the user: their handle matches, or for a user without a handle, the author has the
 * unknown author's name (`unknownName`) and no handle.
 *
 * @example
 * isOwnAuthor({ name: "Ada", handle: "ada.example" }, "ada.example"); // true
 * isOwnAuthor({ name: "Unknown" }, ""); // true
 */
export const isOwnAuthor = (
  author: AssetAuthor | undefined,
  userHandle: string,
  unknownName = UNKNOWN_AUTHOR,
): boolean =>
  userHandle
    ? authorHandle(author) === userHandle
    : typeof author === "object" &&
      !author.handle &&
      author.name === unknownName;

/**
 * The heading a preset is listed under: the built-in heading (the app's name) for the presets that come with the app,
 * "My presets" for the user's own (see `isOwnAuthor`), otherwise the author's name.
 *
 * @example
 * authorGroup(preset, false, "ada.example"); // "My presets"
 */
export const authorGroup = (
  preset: BrushPreset,
  builtIn: boolean,
  userHandle: string,
  names: AuthorNames = {},
): string => {
  if (builtIn) return names.builtIn ?? BUILT_IN_AUTHOR;
  if (isOwnAuthor(preset.author, userHandle, names.unknown)) return MY_PRESETS;
  return authorName(preset.author);
};

/**
 * Group presets by author, in their order within each group: the user's own first, then the presets that come with
 * the app (under the built-in heading), then other authors alphabetically.
 *
 * @param isBuiltIn - whether a preset comes with the app
 */
export const groupPresetsByAuthor = (
  presets: BrushPreset[],
  isBuiltIn: (id: string) => boolean,
  userHandle: string,
  names: AuthorNames = {},
): PresetGroup[] => {
  const builtInLabel = names.builtIn ?? BUILT_IN_AUTHOR;
  const groups = new Map<string, BrushPreset[]>();
  for (const preset of presets) {
    const label = authorGroup(preset, isBuiltIn(preset.id), userHandle, names);
    groups.set(label, [...(groups.get(label) ?? []), preset]);
  }
  const rank = (label: string) =>
    label === MY_PRESETS ? 0 : label === builtInLabel ? 1 : 2;
  return [...groups]
    .map(([label, list]) => ({ label, presets: list }))
    .sort(
      (a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label),
    );
};
