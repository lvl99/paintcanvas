import type { BrushPresetFile } from "./schema";
import {
  validateBrushPreset,
  validateBrushPresetFile,
  type ValidationError,
  type Validator,
} from "../validation/validators.generated.js";

export * from "./schema";

/** Result of validating a brush preset or preset file */
export type PresetValidationResult<T> =
  { valid: true; value: T } | { valid: false; errors: string[] };

/**
 * Turn validation errors into readable messages.
 *
 * @example
 * formatErrors([{ instancePath: "/id", message: "must match pattern" }]); // ["/id must match pattern"]
 */
export const formatErrors = (
  errors: ValidationError[] | null | undefined,
): string[] =>
  (errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`,
  );

/**
 * Validate a value with a pre-compiled validator.
 */
const check = <T>(
  validate: Validator<T>,
  input: unknown,
): PresetValidationResult<T> =>
  validate(input)
    ? { valid: true, value: input }
    : { valid: false, errors: formatErrors(validate.errors) };

/**
 * Check a brush preset a user made or imported against `brushPresetSchema`.
 *
 * @example
 * isValidBrushPreset({ id: crypto.randomUUID(), name: "My brush" }).valid; // true
 */
export const isValidBrushPreset = (
  input: unknown,
): PresetValidationResult<Record<string, unknown>> =>
  check(validateBrushPreset, input);

/**
 * Check a brush preset file against `brushPresetFileSchema`.
 *
 * @example
 * isValidBrushPresetFile({ format: "paintcanvas-brush-presets", version: 1, presets: [] }).valid; // true
 */
export const isValidBrushPresetFile = (
  input: unknown,
): PresetValidationResult<BrushPresetFile> =>
  check(validateBrushPresetFile, input);
