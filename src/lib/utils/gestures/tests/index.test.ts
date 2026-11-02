import { describe, it, expect } from "vitest";
import {
  DEFAULT_GESTURES,
  TOUCH_GESTURES,
  TOUCH_GESTURE_NAMES,
  assignGesture,
  gestureAction,
  sanitiseGestures,
} from "..";

describe("TOUCH_GESTURES", () => {
  it("should name every gesture", () => {
    expect(TOUCH_GESTURES).toHaveLength(8);
    for (const gesture of TOUCH_GESTURES)
      expect(TOUCH_GESTURE_NAMES[gesture]).toMatch(/with (two|three) fingers$/);
  });
});

describe("sanitiseGestures", () => {
  it("should use the defaults for missing or invalid gestures", () => {
    expect(sanitiseGestures(undefined)).toEqual(DEFAULT_GESTURES);
    expect(sanitiseGestures("tap2")).toEqual(DEFAULT_GESTURES);
    expect(sanitiseGestures({ undo: "wave", copy: "off" })).toEqual({
      ...DEFAULT_GESTURES,
      copy: "off",
    });
  });

  it("should turn off a gesture already used by an earlier action", () => {
    expect(
      sanitiseGestures({
        undo: "tap3",
        redo: "tap3",
        copy: "off",
        paste: "off",
      }),
    ).toEqual({ undo: "tap3", redo: "off", copy: "off", paste: "off" });
  });
});

describe("assignGesture", () => {
  it("should swap gestures with the action that had it", () => {
    expect(assignGesture(DEFAULT_GESTURES, "undo", "tap3")).toEqual({
      ...DEFAULT_GESTURES,
      undo: "tap3",
      redo: "tap2",
    });
  });

  it("should give a free gesture, or turn the action off", () => {
    expect(assignGesture(DEFAULT_GESTURES, "copy", "swipeUp3")).toEqual({
      ...DEFAULT_GESTURES,
      copy: "swipeUp3",
    });
    expect(assignGesture(DEFAULT_GESTURES, "paste", "off")).toEqual({
      ...DEFAULT_GESTURES,
      paste: "off",
    });
  });
});

describe("gestureAction", () => {
  it("should find the action a gesture does", () => {
    expect(gestureAction(DEFAULT_GESTURES, "tap2")).toBe("undo");
    expect(gestureAction(DEFAULT_GESTURES, "swipeOut3")).toBe("paste");
    expect(gestureAction(DEFAULT_GESTURES, "swipeLeft3")).toBeUndefined();
  });
});
