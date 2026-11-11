import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { withoutType } from "../../validation/standalone";
import {
  CanvasMessageType,
  createPatchMessage,
  historyMessageSchema,
  messageSchemas,
  patchMessageSchema,
  strokeMessageSchema,
  validateCanvasMessage,
} from "..";

const STEP = "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a";

const patch = createPatchMessage([0, 0, 2, 2], "rgba-deflate", "AAAA");

const stroke = {
  protocol: 1,
  type: CanvasMessageType.Stroke,
  step: STEP,
  layer: "layer-1",
  mode: "paint",
  preset: { id: STEP, name: "Mine" },
  size: { width: 10, height: 10 },
  colour: "#ff0000",
  isPen: true,
  seed: 42,
  points: [{ x: 1, y: 2, time: 0, pressure: 0.5, tiltX: 10, tiltY: -10 }],
};

describe("createPatchMessage", () => {
  it("should make a patch for the current protocol", () => {
    expect(patch).toEqual({
      protocol: 1,
      type: "patch",
      coords: [0, 0, 2, 2],
      encoding: "rgba-deflate",
      data: "AAAA",
    });
  });
});

describe("validateCanvasMessage", () => {
  it.each([
    ["a patch", patch],
    ["a stroke", stroke],
    [
      "a stroke with a built-in preset",
      { ...stroke, preset: { id: "round1" } },
    ],
    ["an undo", { protocol: 1, type: "undo", step: STEP }],
    ["a redo", { protocol: 1, type: "redo", step: STEP }],
  ])("should accept %s", (_label, message) => {
    expect(validateCanvasMessage(message)).toEqual({
      valid: true,
      value: message,
    });
  });

  it.each([
    ["isn't an object", "patch", "/protocol must be 1"],
    [
      "is another protocol version",
      { ...patch, protocol: 2 },
      "/protocol must be 1",
    ],
    [
      "is another kind",
      { protocol: 1, type: "text" },
      "/type is not a drawing message",
    ],
    [
      "has an inherited kind",
      { protocol: 1, type: "toString" },
      "/type is not a drawing message",
    ],
    [
      "has an empty area",
      { ...patch, coords: [2, 0, 2, 2] },
      "/coords must not be empty",
    ],
    [
      "has an upside-down area",
      { ...patch, coords: [0, 2, 2, 1] },
      "/coords must not be empty",
    ],
  ])("should reject a message that %s", (_label, message, error) => {
    expect(validateCanvasMessage(message)).toEqual({
      valid: false,
      errors: [error],
    });
  });

  it.each([
    ["a patch with an unknown encoding", { ...patch, encoding: "jpeg" }],
    ["a patch with data that isn't base64", { ...patch, data: "not base64!" }],
    ["a patch with too few coordinates", { ...patch, coords: [0, 0, 2] }],
    ["a stroke without points", { ...stroke, points: [] }],
    ["a stroke with an invalid preset", { ...stroke, preset: { id: "" } }],
    [
      "a stroke with too much pressure",
      { ...stroke, points: [{ x: 0, y: 0, time: 0, pressure: 2 }] },
    ],
    ["a stroke with an invalid colour", { ...stroke, colour: "red" }],
    ["an undo without a step", { protocol: 1, type: "undo" }],
  ])("should reject %s", (_label, message) => {
    const result = validateCanvasMessage(message);
    expect(result.valid).toBe(false);
    expect(result.valid || result.errors.length).toBeGreaterThan(0);
  });
});

describe("message schemas", () => {
  const ajv = new Ajv2020({
    strict: true,
    schemas: messageSchemas.map(withoutType),
  });

  it("should compile and validate messages with ajv", () => {
    expect(ajv.validate(patchMessageSchema.$id, patch)).toBe(true);
    expect(ajv.validate(strokeMessageSchema.$id, stroke)).toBe(true);
    expect(
      ajv.validate(historyMessageSchema.$id, {
        protocol: 1,
        type: "redo",
        step: STEP,
      }),
    ).toBe(true);
    expect(ajv.validate(patchMessageSchema.$id, { ...patch, extra: 1 })).toBe(
      false,
    );
    expect(ajv.errors?.[0]?.message).toBe(
      "must NOT have additional properties",
    );
  });
});
