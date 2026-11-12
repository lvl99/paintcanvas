// Drawing messages PaintCanvas sends and receives, and their JSON schemas (for checking received messages).
// Imported with extensions, as the validator build script runs this file in Node
import { ImageEncoding, type BoundingBox } from "../image/index.ts";
import type { BrushConfig, BrushStrokePoint } from "../brushes/types/index.ts";
import { brushConfigSchema, UUID_PATTERN } from "../presets/schema.ts";

/** Version of the drawing message protocol, sent in every message (2: a stroke's preset is only its brush settings) */
export const PROTOCOL_VERSION = 2;

/** Kinds of drawing message */
export const CanvasMessageType = {
  /** Pixels of the sender's whole drawing (all their layers, flattened) within an area */
  Patch: "patch",
  /** A finished brush or eraser stroke */
  Stroke: "stroke",
  /** The sender undid a step */
  Undo: "undo",
  /** The sender redid a step */
  Redo: "redo",
} as const;

export type CanvasMessageType =
  (typeof CanvasMessageType)[keyof typeof CanvasMessageType];

/** Largest canvas width or height a message may refer to */
export const MAX_MESSAGE_CANVAS_SIZE = 10000;

/** Most points in one stroke message */
export const MAX_STROKE_POINTS = 100000;

/** Longest encoded image data in a patch (characters): a whole 10000 × 10000 canvas as base64 RGBA */
export const MAX_PATCH_DATA_LENGTH =
  Math.ceil((MAX_MESSAGE_CANVAS_SIZE * MAX_MESSAGE_CANVAS_SIZE * 4) / 3) * 4;

interface BaseCanvasMessage {
  /** Protocol version (`PROTOCOL_VERSION`) */
  protocol: typeof PROTOCOL_VERSION;
}

/** Pixels of the sender's whole drawing within an area, replacing what was there */
export interface PatchMessage extends BaseCanvasMessage {
  type: typeof CanvasMessageType.Patch;
  /** Area the pixels cover */
  coords: BoundingBox;
  encoding: ImageEncoding;
  /** Encoded image data (base64) */
  data: string;
}

/** A stroke point with the time it was recorded */
export interface TimedStrokePoint extends BrushStrokePoint {
  /** Milliseconds, from the same clock as the stroke's other points (e.g. `PointerEvent.timeStamp`) */
  time: number;
}

/** A finished brush or eraser stroke, with everything needed to draw it again */
export interface StrokeMessage extends BaseCanvasMessage {
  type: typeof CanvasMessageType.Stroke;
  /** The history step the stroke made (see undo and redo messages) */
  step: string;
  /** ID of the sender's layer it was drawn on */
  layer: string;
  mode: "paint" | "erase";
  /** Brush settings */
  preset: BrushConfig;
  /** Size chosen by the user */
  size: { width: number; height: number };
  /** Paint colour as `#rrggbb` */
  colour: string;
  /** Whether input came from a pen (pressure and tilt apply) */
  isPen: boolean;
  /** Seed for the stroke's random variation, so it draws the same again */
  seed: number;
  /** Input points, in order */
  points: TimedStrokePoint[];
}

/** The sender undid or redid a step */
export interface HistoryMessage extends BaseCanvasMessage {
  type: typeof CanvasMessageType.Undo | typeof CanvasMessageType.Redo;
  /** The step undone or redone */
  step: string;
}

/** Any drawing message */
export type CanvasMessage = PatchMessage | StrokeMessage | HistoryMessage;

const protocol = { const: PROTOCOL_VERSION } as const;
const step = { type: "string", pattern: UUID_PATTERN } as const;
const coordinate = {
  type: "integer",
  minimum: 0,
  maximum: MAX_MESSAGE_CANVAS_SIZE,
} as const;
const number = { type: "number" } as const;

/** JSON schema for the brush settings in a stroke message: a brush preset's content */
export const strokePresetSchema = {
  ...brushConfigSchema,
  $id: "paintcanvas/stroke-preset",
} as const;

/** JSON schema for a patch message */
export const patchMessageSchema = {
  $id: "paintcanvas/message/patch",
  type: "object",
  additionalProperties: false,
  required: ["protocol", "type", "coords", "encoding", "data"],
  properties: {
    protocol,
    type: { const: CanvasMessageType.Patch },
    coords: {
      type: "array",
      items: coordinate,
      minItems: 4,
      maxItems: 4,
    },
    encoding: { enum: Object.values(ImageEncoding) },
    data: {
      type: "string",
      pattern: "^[A-Za-z0-9+/]*={0,2}$",
      maxLength: MAX_PATCH_DATA_LENGTH,
    },
  },
} as const;

/** JSON schema for a stroke message */
export const strokeMessageSchema = {
  $id: "paintcanvas/message/stroke",
  type: "object",
  additionalProperties: false,
  required: [
    "protocol",
    "type",
    "step",
    "layer",
    "mode",
    "preset",
    "size",
    "colour",
    "isPen",
    "seed",
    "points",
  ],
  properties: {
    protocol,
    type: { const: CanvasMessageType.Stroke },
    step,
    layer: { type: "string", minLength: 1, maxLength: 100 },
    mode: { enum: ["paint", "erase"] },
    // Resolved against this schema's $id, so it is "paintcanvas/stroke-preset"
    preset: { $ref: "../stroke-preset" },
    size: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height"],
      properties: {
        width: { type: "number", minimum: 0, maximum: MAX_MESSAGE_CANVAS_SIZE },
        height: {
          type: "number",
          minimum: 0,
          maximum: MAX_MESSAGE_CANVAS_SIZE,
        },
      },
    },
    colour: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
    isPen: { type: "boolean" },
    seed: { type: "integer", minimum: 0, maximum: 0xffffffff },
    points: {
      type: "array",
      minItems: 1,
      maxItems: MAX_STROKE_POINTS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y", "time"],
        properties: {
          x: number,
          y: number,
          time: number,
          rotation: number,
          pressure: { type: "number", minimum: 0, maximum: 1 },
          tiltX: { type: "number", minimum: -90, maximum: 90 },
          tiltY: { type: "number", minimum: -90, maximum: 90 },
        },
      },
    },
  },
} as const;

/** JSON schema for an undo or redo message */
export const historyMessageSchema = {
  $id: "paintcanvas/message/history",
  type: "object",
  additionalProperties: false,
  required: ["protocol", "type", "step"],
  properties: {
    protocol,
    type: { enum: [CanvasMessageType.Undo, CanvasMessageType.Redo] },
    step,
  },
} as const;

// Listed so the stroke preset schema is available to `$ref`
export const messageSchemas = [
  strokePresetSchema,
  patchMessageSchema,
  strokeMessageSchema,
  historyMessageSchema,
] as const;
