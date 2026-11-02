// Types for the generated validators (see validators.generated.js).
import type { BrushPresetFile } from "../presets/schema";
import type { PaintCanvasDocument } from "../document/schema";
import type {
  HistoryMessage,
  PatchMessage,
  StrokeMessage,
} from "../messages/schema";

/** A validation error reported by a generated validator */
export interface ValidationError {
  instancePath: string;
  message?: string;
}

/** A generated validator: checks a value, and lists what is wrong in `errors` when it fails */
export interface Validator<T> {
  (input: unknown): input is T;
  errors?: ValidationError[] | null;
}

export declare const validateBrushPreset: Validator<Record<string, unknown>>;
export declare const validateBrushPresetFile: Validator<BrushPresetFile>;
export declare const validatePatchMessage: Validator<PatchMessage>;
export declare const validateStrokeMessage: Validator<StrokeMessage>;
export declare const validateHistoryMessage: Validator<HistoryMessage>;
export declare const validateDocument: Validator<PaintCanvasDocument>;
