import { formatErrors } from "../presets";
import { validateDocument } from "../validation/validators.generated.js";
import type { PaintCanvasDocument } from "./schema";

export * from "./schema";

/** Result of checking a document */
export type DocumentValidationResult =
  | { valid: true; value: PaintCanvasDocument }
  | { valid: false; errors: string[] };

/**
 * Check a document (e.g. read from a file) against `documentSchema`, and that its selected layer exists.
 *
 * @example
 * isValidDocument(JSON.parse(text)).valid; // true
 */
export const isValidDocument = (input: unknown): DocumentValidationResult => {
  if (!validateDocument(input))
    return { valid: false, errors: formatErrors(validateDocument.errors) };
  if (input.activeLayer >= input.layers.length)
    return { valid: false, errors: ["/activeLayer must be one of the layers"] };
  return { valid: true, value: input };
};
