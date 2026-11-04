// The tools enum, kept apart from the engine so modules the engine imports can use it without a circular import.

/** Drawing and navigation tools */
export enum Tool {
  Brush = "brush",
  Eraser = "eraser",
  /** Move, scale and rotate */
  Move = "move",
  RectangleLasso = "rectangle-lasso",
  CircleLasso = "circle-lasso",
  PolygonLasso = "polygon-lasso",
  FreeformLasso = "freeform-lasso",
  Pan = "pan",
  Zoom = "zoom",
  /** Set the current colour from the canvas (eyedropper) */
  ColourSample = "colour-sample",
}
