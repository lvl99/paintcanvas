// JSON schemas for profile graphs: their points (in brush presets), the user's own graphs, and the collection files they
// are exported to and imported from.
// Imported with extensions, as the validator build script runs this file in Node
import {
  Interpolation,
  GRID_UNITS,
  MAX_PROFILE_POINTS,
  PROFILE_GRAPH_TYPE,
  PROFILE_PRESETS,
} from "./index.ts";
import {
  UUID_PATTERN,
  assetSchema,
  collectionSchema,
} from "../assets/schema.ts";

/** Name given to a profile graph of an older version that has none */
export const UNTITLED_PROFILE_NAME = "Untitled graph";

/** Most profile graphs a user can keep (and in one file) */
export const MAX_SAVED_PROFILES = 100;

/** Version of the profile graph schema */
export const PROFILE_GRAPH_SCHEMA_VERSION = "2.1.0";

export { PROFILE_GRAPH_TYPE };

/** Version of the profile graph collection schema */
export const PROFILE_GRAPH_COLLECTION_SCHEMA_VERSION = "2.1.0";

/** `@type` of a profile graph collection file */
export const PROFILE_GRAPH_COLLECTION_TYPE =
  "PaintCanvas/ProfileGraphCollection";

/** Schema of a profile graph's ID: a UUID for the user's own, or a built-in graph's ID */
export const profileIdSchema = {
  anyOf: [
    { type: "string", pattern: UUID_PATTERN },
    { enum: PROFILE_PRESETS.map((preset) => preset.id) },
  ],
} as const;

/** Schema of a profile graph's points, from left to right */
export const profilePointsSchema = {
  type: "array",
  minItems: 2,
  maxItems: MAX_PROFILE_POINTS,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["x", "y", "i"],
    properties: {
      x: { type: "number", minimum: 0, maximum: GRID_UNITS },
      y: { type: "number", minimum: -GRID_UNITS, maximum: 0 },
      i: { enum: Object.values(Interpolation) },
    },
  },
} as const;

/** Schema of a profile graph's content */
export const profileGraphConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["points"],
  properties: { points: profilePointsSchema },
} as const;

/** Schema of a named profile graph */
export const profileGraphSchema = assetSchema({
  name: "profile-graph",
  version: PROFILE_GRAPH_SCHEMA_VERSION,
  type: PROFILE_GRAPH_TYPE,
  id: profileIdSchema,
  content: profileGraphConfigSchema,
});

/** Schema of a profile graph collection file */
export const profileGraphCollectionSchema = collectionSchema({
  name: "profile-graph-collection",
  version: PROFILE_GRAPH_COLLECTION_SCHEMA_VERSION,
  type: PROFILE_GRAPH_COLLECTION_TYPE,
  item: profileGraphSchema.$id,
  maxItems: MAX_SAVED_PROFILES,
});
