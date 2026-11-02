import { describe, it, expect } from "vitest";
import { CHECKER_DARK, CHECKER_LIGHT, drawCheckerboard, fitSize } from "..";
import { createRecordingContext } from "../../../../testing/recordingContext";

describe("drawCheckerboard", () => {
  it("should fill light, then alternate dark squares row by row", () => {
    const { ctx, calls } = createRecordingContext();
    drawCheckerboard(ctx, 10, 10, 5);
    expect(calls).toEqual([
      ["set:fillStyle", CHECKER_LIGHT],
      ["fillRect", 0, 0, 10, 10],
      ["set:fillStyle", CHECKER_DARK],
      ["fillRect", 0, 0, 5, 5],
      ["fillRect", 5, 5, 5, 5],
    ]);
  });
});

describe("fitSize", () => {
  it("should scale to fit a box keeping proportions", () => {
    expect(fitSize(2000, 1000, 90, 90)).toEqual({ width: 90, height: 45 });
    expect(fitSize(1000, 2000, 90, 90)).toEqual({ width: 45, height: 90 });
    expect(fitSize(10, 10, 30, 30)).toEqual({ width: 30, height: 30 });
  });
});
