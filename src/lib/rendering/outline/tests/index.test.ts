import { describe, it, expect } from "vitest";
import { chainSegments, traceOutline } from "..";

/** Build an alpha array from rows of 0/1 */
const grid = (...rows: string[]) =>
  Uint8ClampedArray.from(
    rows
      .join("")
      .split("")
      .map((c) => (c === "1" ? 255 : 0)),
  );

/** Total outline length in pixels for a shape of the given size */
const length = (segments: number[][], width: number, height: number) =>
  segments.reduce(
    (sum, [x1, y1, x2, y2]) =>
      sum + Math.hypot((x2! - x1!) * width, (y2! - y1!) * height),
    0,
  );

describe("traceOutline", () => {
  it("should return no outline for empty images", () => {
    expect(traceOutline(grid("000", "000"), 3, 2)).toEqual([]);
  });

  it("should outline a single pixel as a closed diamond", () => {
    const segments = traceOutline(grid("000", "010", "000"), 3, 3);
    expect(segments).toHaveLength(4);
    expect(length(segments, 3, 3)).toBeCloseTo(4 * Math.SQRT1_2);
  });

  it("should outline a filled square around its pixel centres", () => {
    const segments = traceOutline(grid("11", "11"), 2, 2);
    // Edges run half a pixel outside the pixel centres, with cut corners
    const xs = segments.flatMap(([x1, , x2]) => [x1! * 2, x2! * 2]);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(2);
    expect(segments.length).toBe(8);
  });

  it("should handle diagonal (saddle) cells and the threshold", () => {
    expect(traceOutline(grid("10", "01"), 2, 2).length).toBeGreaterThan(4);
    expect(traceOutline(Uint8ClampedArray.from([100]), 1, 1)).toEqual([]);
    expect(
      traceOutline(Uint8ClampedArray.from([100]), 1, 1, { threshold: 50 }),
    ).toHaveLength(4);
  });

  it("should cover every cell shape", () => {
    // Shapes exercising all 14 edge cases
    const shapes = [
      grid("100", "000"),
      grid("110", "000"),
      grid("110", "100"),
      grid("010", "110"),
      grid("011", "100"),
    ];
    for (const shape of shapes)
      expect(traceOutline(shape, 3, 2).length).toBeGreaterThan(0);
  });
});

describe("traceOutline (pixels and bounds)", () => {
  it("should return pixel coordinates when not normalised", () => {
    const segments = traceOutline(grid("000", "010", "000"), 3, 3, {
      normalise: false,
    });
    const xs = segments.flatMap(([x1, , x2]) => [x1, x2]);
    expect(Math.min(...xs)).toBe(1);
    expect(Math.max(...xs)).toBe(2);
  });

  it("should only trace within the given bounds", () => {
    const alpha = grid("100", "000", "001");
    const all = traceOutline(alpha, 3, 3, { normalise: false });
    const corner = traceOutline(alpha, 3, 3, {
      normalise: false,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(all).toHaveLength(8);
    expect(corner).toHaveLength(4);
  });
});

describe("chainSegments", () => {
  it("should join a single pixel's outline into one closed loop", () => {
    const loops = chainSegments(
      traceOutline(grid("000", "010", "000"), 3, 3, { normalise: false }),
    );
    expect(loops).toHaveLength(1);
    // Diamond: 4 corners plus the start point repeated to close it
    expect(loops[0]).toHaveLength(10);
    expect(loops[0]!.slice(0, 2)).toEqual(loops[0]!.slice(-2));
  });

  it("should merge straight runs into single lines", () => {
    const loops = chainSegments(
      traceOutline(grid("0000", "0110", "0110", "0000"), 4, 4, {
        normalise: false,
      }),
    );
    expect(loops).toHaveLength(1);
    // An octagon (square with cut corners): 8 corners plus the closing point
    expect(loops[0]!.length / 2).toBeLessThanOrEqual(9);
  });

  it("should merge long straight edges of a larger block", () => {
    const alpha = grid(
      "000000",
      "011110",
      "011110",
      "011110",
      "011110",
      "000000",
    );
    const segments = traceOutline(alpha, 6, 6, { normalise: false });
    const [loop] = chainSegments(segments);
    expect(loop!.length / 2 - 1).toBeLessThan(segments.length);
    expect(loop!.length / 2 - 1).toBe(8);
  });

  it("should produce one loop per separate shape, and none for nothing", () => {
    expect(
      chainSegments(
        traceOutline(grid("100", "000", "001"), 3, 3, { normalise: false }),
      ),
    ).toHaveLength(2);
    expect(chainSegments([])).toEqual([]);
  });

  it("should stop at an open end", () => {
    expect(chainSegments([[0, 0, 1, 0]])).toEqual([[0, 0, 1, 0]]);
  });
});
