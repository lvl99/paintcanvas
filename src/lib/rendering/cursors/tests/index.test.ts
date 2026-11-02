import { describe, it, expect } from "vitest";
import {
  FREEFORM_LASSO_CURSOR,
  POLYGON_LASSO_CURSOR,
  ROTATE_CURSOR,
  svgCursor,
} from "..";

describe("svgCursor", () => {
  it("should build a CSS cursor with an outlined SVG, hotspot and fallback", () => {
    const cursor = svgCursor("M0 0 L1 1", [4, 5], "crosshair");
    expect(cursor).toMatch(/^url\("data:image\/svg\+xml,.+"\) 4 5, crosshair$/);
    const svg = decodeURIComponent(
      cursor.slice('url("data:image/svg+xml,'.length, cursor.indexOf('")')),
    );
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg.match(/d="M0 0 L1 1"/g)).toHaveLength(2);
  });

  it("should define lasso and rotate cursors with their hotspots", () => {
    expect(POLYGON_LASSO_CURSOR).toMatch(/\) 3 21, crosshair$/);
    expect(FREEFORM_LASSO_CURSOR).toMatch(/\) 3 21, crosshair$/);
    expect(ROTATE_CURSOR).toBe("grab");
  });
});
