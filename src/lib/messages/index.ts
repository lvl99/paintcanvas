import type { BoundingBox, ImageEncoding } from "../image";
import { formatErrors } from "../presets";
import {
  validateHistoryMessage,
  validatePatchMessage,
  validateStrokeMessage,
  type Validator,
} from "../validation/validators.generated.js";
import {
  CanvasMessageType,
  PROTOCOL_VERSION,
  type CanvasMessage,
  type PatchMessage,
} from "./schema";

export * from "./schema";

/** Result of checking a received message */
export type MessageValidationResult =
  { valid: true; value: CanvasMessage } | { valid: false; errors: string[] };

/**
 * Make a patch message.
 *
 * @example
 * createPatchMessage([0, 0, 10, 10], ImageEncoding.RgbaDeflate, data);
 */
export const createPatchMessage = (
  coords: BoundingBox,
  encoding: ImageEncoding,
  data: string,
): PatchMessage => ({
  protocol: PROTOCOL_VERSION,
  type: CanvasMessageType.Patch,
  coords,
  encoding,
  data,
});

/** The validator for each kind of message */
const VALIDATORS: Record<CanvasMessageType, Validator<CanvasMessage>> = {
  [CanvasMessageType.Patch]: validatePatchMessage,
  [CanvasMessageType.Stroke]: validateStrokeMessage,
  [CanvasMessageType.Undo]: validateHistoryMessage,
  [CanvasMessageType.Redo]: validateHistoryMessage,
};

/**
 * Check a received (untrusted) drawing message: its protocol version, its kind, its schema, and that a patch's area
 * isn't empty.
 *
 * @example
 * validateCanvasMessage(JSON.parse(text)); // { valid: true, value: { protocol: 1, type: "patch", … } }
 */
export const validateCanvasMessage = (
  input: unknown,
): MessageValidationResult => {
  const record =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  if (record.protocol !== PROTOCOL_VERSION)
    return {
      valid: false,
      errors: [`/protocol must be ${PROTOCOL_VERSION}`],
    };
  const validate = Object.hasOwn(VALIDATORS, record.type as string)
    ? VALIDATORS[record.type as CanvasMessageType]
    : undefined;
  if (!validate)
    return { valid: false, errors: ["/type is not a drawing message"] };
  if (!validate(input))
    return { valid: false, errors: formatErrors(validate.errors) };
  if (input.type === CanvasMessageType.Patch) {
    const [x1, y1, x2, y2] = input.coords;
    if (x2 <= x1 || y2 <= y1)
      return { valid: false, errors: ["/coords must not be empty"] };
  }
  return { valid: true, value: input };
};
