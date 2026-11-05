import ROUND_IMAGE from "../presets/round/round.png?inline";
import SOFT_ROUND_IMAGE from "../presets/round/soft-round.png?inline";
import SQUARE_IMAGE from "../presets/square/square.png?inline";
import PENCIL_2B_IMAGE from "../presets/drawing/pencil-2b.png?inline";
import PENCIL_HB_IMAGE from "../presets/drawing/pencil-hb.png?inline";
import FELT_PEN_IMAGE from "../presets/drawing/felt-pen.png?inline";
import BRUSH_PEN_IMAGE from "../presets/drawing/brush-pen.png?inline";
import TEXTURED_PAINT_IMAGE from "../presets/painting/textured-paint.png?inline";
import WATERY_PAINT_IMAGE from "../presets/painting/watery-paint.png?inline";
import SPLATTER_IMAGE from "../presets/painting/splatter.png?inline";
import HAIR_IMAGE from "../presets/painting/hair.png?inline";
import GRASS_IMAGE from "../presets/painting/grass.png?inline";

/** A brush shape that comes with PaintCanvas (all square) */
export interface BuiltInShape {
  id: string;
  name: string;
  /** PNG data URL */
  image: string;
}

/** The brush shapes that come with PaintCanvas, the ones its presets use */
export const BUILT_IN_SHAPES: readonly BuiltInShape[] = [
  { id: "round", name: "Round", image: ROUND_IMAGE },
  { id: "softRound", name: "Soft round", image: SOFT_ROUND_IMAGE },
  { id: "square", name: "Square", image: SQUARE_IMAGE },
  { id: "pencil2b", name: "Pencil 2B", image: PENCIL_2B_IMAGE },
  { id: "pencilHb", name: "Pencil HB", image: PENCIL_HB_IMAGE },
  { id: "feltPen", name: "Felt pen", image: FELT_PEN_IMAGE },
  { id: "brushPen", name: "Brush pen", image: BRUSH_PEN_IMAGE },
  { id: "texturedPaint", name: "Textured paint", image: TEXTURED_PAINT_IMAGE },
  { id: "wateryPaint", name: "Watery paint", image: WATERY_PAINT_IMAGE },
  { id: "splatter", name: "Splatter", image: SPLATTER_IMAGE },
  { id: "hair", name: "Hair", image: HAIR_IMAGE },
  { id: "grass", name: "Grass", image: GRASS_IMAGE },
];

/**
 * Which built-in shape a brush uses: its id, "round" for a brush without an image (drawn round), or undefined for one
 * of the user's own (uploaded or pasted).
 *
 * @example
 * builtInShapeId(undefined); // "round"
 * builtInShapeId("data:image/png;base64,…"); // undefined, unless it's a built-in shape's image
 */
export const builtInShapeId = (image: unknown): string | undefined =>
  image === undefined
    ? "round"
    : BUILT_IN_SHAPES.find((shape) => shape.image === image)?.id;
