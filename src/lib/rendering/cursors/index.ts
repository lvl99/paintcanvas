/**
 * Build a CSS cursor from SVG path data drawn on a 24×24 grid: black lines with a white outline so it shows on any colour.
 *
 * @param hotspot - the point (in the 24×24 grid) that is the cursor's exact position
 * @param fallback - standard cursor used if the image cannot be shown
 *
 * @example
 * svgCursor("M4 4 L20 20", [4, 4], "crosshair"); // 'url("data:image/svg+xml,...") 4 4, crosshair'
 */
export const svgCursor = (
  path: string,
  hotspot: [number, number],
  fallback: string,
): string => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${path}" stroke="#ffffff" stroke-width="3.5"/>` +
    `<path d="${path}" stroke="#000000" stroke-width="1.5"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot[0]} ${hotspot[1]}, ${fallback}`;
};

/** Deleting: an "X", e.g. over a brush preset or saved colour that a click deletes (Alt/Option held); the point is its middle */
export const DELETE_CURSOR = svgCursor(
  "M6 6 L18 18 M18 6 L6 18",
  [12, 12],
  "not-allowed",
);

/** Colour sample (eyedropper): a pipette pointing down to the left; the point is at its tip */
export const EYEDROPPER_CURSOR = svgCursor(
  "M2 22 L3 18 L12 9 L15 12 L6 21 Z M10 7 L17 14 M14 10 L18 6 C19 5 20 4 21 5 C22 6 21 7 20 8 L16 12",
  [2, 22],
  "crosshair",
);

/** Polygon lasso: a straight-edged loop with a tail; the point is at the tail's end */
export const POLYGON_LASSO_CURSOR = svgCursor(
  "M3 21 L7 15 M7 15 L5 6 L13 2 L21 7 L17 15 Z",
  [3, 21],
  "crosshair",
);

/** Freeform lasso: an irregular hand-drawn loop with a tail; the point is at the tail's end */
export const FREEFORM_LASSO_CURSOR = svgCursor(
  "M3 21 C3 19 5 18 7 17 C7 17 5 16 4 14 C2 10 4 6 8 5 C11 4 12 6 15 4 C18 3 22 6 20 10 C19 13 21 15 18 16 C15 17 11 15 9 16 C8 16.5 7.5 17 7 17",
  [3, 21],
  "crosshair",
);

/** Rotate: the browser's grab cursor, as browsers have no standard rotate cursor */
export const ROTATE_CURSOR = "grab";
