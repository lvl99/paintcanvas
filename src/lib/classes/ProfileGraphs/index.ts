import {
  GRID_UNITS,
  Interpolation,
  MAX_PROFILE_POINTS,
  PROFILE_PRESETS,
  type ProfileGraph,
  type ProfilePoint,
} from "../../profiles";
import {
  MAX_PROFILE_TEXT_LENGTH,
  MAX_SAVED_PROFILES,
} from "../../profiles/schema";

/** The interpolations a point can have */
const INTERPOLATIONS: readonly string[] = Object.values(Interpolation);

/** Whether a value is text of a usable length for an ID or name */
const isText = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= MAX_PROFILE_TEXT_LENGTH;

/**
 * Keep only valid points from an untrusted value, in order from left to right: each on the grid, with a known
 * interpolation. Undefined if there aren't 2 to `MAX_PROFILE_POINTS` of them.
 *
 * @example
 * sanitisePoints([{ x: 10, y: 0, i: "linear" }, { x: 0, y: -10, i: "linear" }]); // sorted by x
 */
export const sanitisePoints = (input: unknown): ProfilePoint[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  const points = input
    .filter(
      (point): point is ProfilePoint =>
        typeof point?.x === "number" &&
        typeof point.y === "number" &&
        point.x >= 0 &&
        point.x <= GRID_UNITS &&
        point.y >= -GRID_UNITS &&
        point.y <= 0 &&
        INTERPOLATIONS.includes(point.i),
    )
    .map(({ x, y, i }) => ({ x, y, i }))
    .sort((a, b) => a.x - b.x);
  return points.length >= 2 && points.length <= MAX_PROFILE_POINTS
    ? points
    : undefined;
};

/**
 * Keep only valid profile graphs from an untrusted value (e.g. stored or imported): each with an ID and name and valid
 * points (see `sanitisePoints`), each ID once and none of the presets', up to `MAX_SAVED_PROFILES`. Undefined if the
 * value isn't an array.
 *
 * @example
 * sanitiseProfiles([{ id: "a", name: "Soft", points: [...] }, { id: "a", name: "Again", points: [...] }]); // the first
 */
export const sanitiseProfiles = (
  input: unknown,
): ProfileGraph[] | undefined => {
  if (!Array.isArray(input)) return undefined;
  const graphs = new Map<string, ProfileGraph>();
  for (const graph of input) {
    if (graphs.size >= MAX_SAVED_PROFILES) break;
    const points = sanitisePoints(graph?.points);
    if (
      !points ||
      !isText(graph.id) ||
      !isText(graph.name) ||
      graphs.has(graph.id) ||
      PROFILE_PRESETS.some((preset) => preset.id === graph.id)
    )
      continue;
    graphs.set(graph.id, { id: graph.id, name: graph.name.trim(), points });
  }
  return [...graphs.values()];
};

/** What a profile graph is saved from: its name and points, and its ID when replacing one */
export interface ProfileGraphDraft {
  id?: string;
  name: string;
  points: readonly ProfilePoint[];
}

/**
 * The user's own profile graphs, alongside the ones PaintCanvas comes with (`PROFILE_PRESETS`). Kept in memory; a
 * profile store keeps them (see `PaintCanvas.useAssetStores`), or save and restore them yourself (see `set`, `merge` and
 * the `change` event). Each gets a UUID when it's first saved.
 *
 * Dispatches a `change` event when the user's graphs change.
 *
 * @example
 * const profiles = new ProfileGraphs();
 * const soft = profiles.save({ name: "Soft", points: PROFILE_PRESETS[1].points });
 * profiles.get(soft.id)?.name; // "Soft"
 */
export default class ProfileGraphs extends EventTarget {
  private values: ProfileGraph[] = [];

  /** The user's own graphs, in the order they were first saved */
  get graphs(): readonly ProfileGraph[] {
    return this.values;
  }

  /** The user's own graphs (the same as `graphs`, so a store can keep them, see `AssetSync`) */
  get items(): readonly ProfileGraph[] {
    return this.values;
  }

  /** Every graph: the presets, then the user's own */
  get all(): readonly ProfileGraph[] {
    return [...PROFILE_PRESETS, ...this.values];
  }

  /**
   * A graph by its ID: a preset or one of the user's own.
   *
   * @example
   * profiles.get("overweight")?.name; // "Overweight"
   */
  get(id: string | undefined): ProfileGraph | undefined {
    return this.all.find((graph) => graph.id === id);
  }

  /** Whether a graph is one PaintCanvas comes with (so it can't be renamed, replaced or deleted) */
  isPreset(id: string | undefined): boolean {
    return PROFILE_PRESETS.some((graph) => graph.id === id);
  }

  /**
   * One of the user's own graphs with a name, ignoring case and spaces around it.
   *
   * @example
   * profiles.findByName(" soft "); // the graph called "Soft"
   */
  findByName(name: string): ProfileGraph | undefined {
    const wanted = name.trim().toLowerCase();
    return this.values.find((graph) => graph.name.toLowerCase() === wanted);
  }

  /**
   * Save a graph as one of the user's own: as a new one (with a new UUID), or in place of the one with its ID. Returns
   * the saved graph, or undefined if it can't be saved (no name, invalid points, a preset's ID, or no room).
   *
   * @example
   * profiles.save({ name: "Soft", points }); // { id: "1b9d…", name: "Soft", points }
   */
  save(draft: ProfileGraphDraft): ProfileGraph | undefined {
    const index = this.values.findIndex((graph) => graph.id === draft.id);
    // A list always gives a list back: empty if the graph isn't valid
    const [graph] = sanitiseProfiles([
      { ...draft, id: index >= 0 ? draft.id : crypto.randomUUID() },
    ]) as ProfileGraph[];
    if (!graph || (index < 0 && this.values.length >= MAX_SAVED_PROFILES))
      return undefined;
    this.values =
      index >= 0
        ? this.values.map((saved, i) => (i === index ? graph : saved))
        : [...this.values, graph];
    this.dispatchEvent(new Event("change"));
    return graph;
  }

  /**
   * Rename one of the user's own graphs. Returns whether it was renamed.
   *
   * @example
   * profiles.rename(id, "Softer");
   */
  rename(id: string, name: string): boolean {
    const graph = this.values.find((saved) => saved.id === id);
    return graph !== undefined && this.save({ ...graph, name }) !== undefined;
  }

  /**
   * Delete one of the user's own graphs. Returns whether it was deleted.
   *
   * @example
   * profiles.remove(id);
   */
  remove(id: string): boolean {
    const next = this.values.filter((graph) => graph.id !== id);
    if (next.length === this.values.length) return false;
    this.values = next;
    this.dispatchEvent(new Event("change"));
    return true;
  }

  /**
   * Replace all the user's graphs (e.g. when restoring saved ones), keeping only valid ones (see `sanitiseProfiles`).
   *
   * @example
   * profiles.set(settings.profiles);
   */
  set(graphs: unknown): void {
    const next = sanitiseProfiles(graphs);
    if (!next) return;
    this.values = next;
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Add graphs (e.g. loaded from a store or imported), replacing the user's graphs with the same IDs and keeping the
   * others, up to `MAX_SAVED_PROFILES`. Invalid graphs are left out (see `sanitiseProfiles`).
   *
   * @example
   * profiles.merge(await store.list());
   */
  merge(graphs: unknown): void {
    const added = sanitiseProfiles(graphs);
    if (!added?.length) return;
    const byId = new Map(this.values.map((graph) => [graph.id, graph]));
    for (const graph of added) byId.set(graph.id, graph);
    this.values = [...byId.values()].slice(0, MAX_SAVED_PROFILES);
    this.dispatchEvent(new Event("change"));
  }
}
