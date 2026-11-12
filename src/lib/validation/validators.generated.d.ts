// Types for the generated validators (see validators.generated.js).
import type { AssetCollectionFile } from "../assets/schema";
import type { BrushConfig } from "../brushes/types";
import type { ProfileGraph } from "../profiles";
import type { DocumentFile } from "../document/schema";
import type { ColourPalette } from "../palette/schema";
import type { AppSettings, AppSettingsFile } from "../settings/schema";
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
export declare const validateBrushPresetCollection: Validator<
  AssetCollectionFile<BrushConfig>
>;
export declare const validateColourPalette: Validator<ColourPalette>;
export declare const validateColourPaletteCollection: Validator<
  AssetCollectionFile<ColourPalette>
>;
export declare const validateProfileGraph: Validator<ProfileGraph>;
export declare const validateProfileGraphCollection: Validator<
  AssetCollectionFile<ProfileGraph>
>;
export declare const validatePatchMessage: Validator<PatchMessage>;
export declare const validateStrokeMessage: Validator<StrokeMessage>;
export declare const validateHistoryMessage: Validator<HistoryMessage>;
export declare const validateDocument: Validator<DocumentFile>;
export declare const validateSettings: Validator<AppSettings>;
export declare const validateAppSettings: Validator<AppSettingsFile>;
