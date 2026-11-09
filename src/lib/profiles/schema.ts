// JSON schemas for profile graphs: their points (in brush presets) and the user's own graphs (in their settings).
import { Interpolation, GRID_UNITS, MAX_PROFILE_POINTS } from "./index.ts";

/** Longest profile graph ID or name (characters) */
export const MAX_PROFILE_TEXT_LENGTH = 100;

/** Most profile graphs a user can keep */
export const MAX_SAVED_PROFILES = 100;

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
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "points"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: MAX_PROFILE_TEXT_LENGTH },
    name: { type: "string", minLength: 1, maxLength: MAX_PROFILE_TEXT_LENGTH },
    points: profilePointsSchema,
  },
} as const;
