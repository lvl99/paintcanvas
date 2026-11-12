// JSON schemas for profile graphs: their points (in brush presets), the user's own graphs, and the collection files they
// are exported to and imported from.
// Imported with extensions, as the validator build script runs this file in Node
import {
  Interpolation,
  GRID_UNITS,
  MAX_PROFILE_POINTS,
  PROFILE_PRESETS,
} from "./index.ts";
import {
  UUID_PATTERN,
  authorSchema,
  collectionSchema,
  fileSchemaUrlSchema,
} from "../assets/schema.ts";
import { SCHEMA_DIALECT, schemaUrl } from "../schemas/index.ts";

/** Longest profile graph ID or name (characters) */
export const MAX_PROFILE_TEXT_LENGTH = 100;

/** Most profile graphs a user can keep (and in one file) */
export const MAX_SAVED_PROFILES = 100;

/** Version of the profile graph schema */
export const PROFILE_GRAPH_SCHEMA_VERSION = "1.0.0";

/** `@type` of a profile graph */
export const PROFILE_GRAPH_TYPE = "PaintCanvas/ProfileGraph";

/** Version of the profile graph collection schema */
export const PROFILE_GRAPH_COLLECTION_SCHEMA_VERSION = "1.0.0";

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

/** Schema of a named profile graph */
export const profileGraphSchema = {
  $schema: SCHEMA_DIALECT,
  $id: schemaUrl("profile-graph", PROFILE_GRAPH_SCHEMA_VERSION),
  "@type": PROFILE_GRAPH_TYPE,
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "points"],
  properties: {
    // Named when the graph is a file of its own
    $schema: fileSchemaUrlSchema,
    "@type": { const: PROFILE_GRAPH_TYPE },
    id: profileIdSchema,
    name: { type: "string", minLength: 1, maxLength: MAX_PROFILE_TEXT_LENGTH },
    author: authorSchema,
    points: profilePointsSchema,
  },
} as const;

/** Schema of a profile graph collection file */
export const profileGraphCollectionSchema = collectionSchema({
  name: "profile-graph-collection",
  version: PROFILE_GRAPH_COLLECTION_SCHEMA_VERSION,
  type: PROFILE_GRAPH_COLLECTION_TYPE,
  item: profileGraphSchema.$id,
  maxItems: MAX_SAVED_PROFILES,
});
