/** Layer blending modes, mapped to canvas `globalCompositeOperation` values */
export enum BlendMode {
  Normal = "source-over",
  Screen = "screen",
  Lighten = "lighten",
  Multiply = "multiply",
  Darken = "darken",
  Overlay = "overlay",
}

/** Maximum length of a layer name */
export const MAX_LAYER_NAME_LENGTH = 64;

export interface LayerConfig {
  /** Unique ID (generated if not given) */
  id?: string;
  /** Layer name */
  name: string;
  /** Affects how the layer blends with layers below */
  blendMode?: BlendMode;
  /** Opacity (0–1) */
  opacity?: number;
  /** Visibility */
  visible?: boolean;
  /** When enabled, drawing cannot add or remove alpha data on the layer */
  alphaLock?: boolean;
}

/** Creates the canvas that stores a layer's image data. Replaceable so tests can run without a real canvas. */
export type CanvasFactory = (width: number, height: number) => OffscreenCanvas;

/**
 * Create an `OffscreenCanvas` of the given size.
 */
export const createOffscreenCanvas: CanvasFactory = (width, height) =>
  new OffscreenCanvas(width, height);

/**
 * Create an `OffscreenCanvas` whose pixels are kept in regular memory rather than on the GPU (its 2D context is made
 * with `willReadFrequently`). Reading its pixels, encoding it and copying it are then plain memory copies, which on
 * phones avoids long stalls waiting for the GPU (up to 15 seconds were seen on an iPhone), at the cost of drawing on
 * the CPU. PaintCanvas makes its canvases this way by default.
 *
 * @example
 * const canvas = createMemoryCanvas(2000, 2000);
 */
export const createMemoryCanvas: CanvasFactory = (width, height) => {
  const canvas = new OffscreenCanvas(width, height);
  // The first context made decides where the pixels live; later `getContext("2d")` calls get this one
  canvas.getContext("2d", { willReadFrequently: true });
  return canvas;
};

/**
 * Clamp an opacity value to 0–1.
 *
 * @example
 * clampOpacity(1.5); // 1
 */
export const clampOpacity = (value: number): number =>
  Number.isNaN(value) ? 1 : Math.max(0, Math.min(1, value));

/**
 * A single drawing layer. Layers are local to each user and never sent to other users; only the flattened result of all a user's layers is sent.
 *
 * @example
 * const layer = new Layer({ name: "Layer 1" }, 2000, 2000);
 * layer.opacity = 0.5;
 */
export default class Layer {
  /** Unique ID */
  readonly id: string;

  /** Width in pixels */
  readonly width: number;

  /** Height in pixels */
  readonly height: number;

  /** Image data */
  readonly canvas: OffscreenCanvas;

  /** Blending mode */
  blendMode: BlendMode;

  /** Visibility */
  visible: boolean;

  /** Alpha lock */
  alphaLock: boolean;

  private layerName = "";

  private layerOpacity = 1;

  constructor(
    config: LayerConfig,
    width: number,
    height: number,
    createCanvas: CanvasFactory = createOffscreenCanvas,
  ) {
    this.id = config.id ?? crypto.randomUUID();
    this.name = config.name;
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    this.blendMode = config.blendMode ?? BlendMode.Normal;
    this.opacity = config.opacity ?? 1;
    this.visible = config.visible ?? true;
    this.alphaLock = config.alphaLock ?? false;
  }

  /** Layer name (trimmed, 1–64 characters) */
  get name(): string {
    return this.layerName;
  }

  set name(value: string) {
    const name = value.trim().slice(0, MAX_LAYER_NAME_LENGTH);
    if (name.length === 0) throw new Error("Layer name cannot be empty");
    this.layerName = name;
  }

  /** Opacity (clamped to 0–1) */
  get opacity(): number {
    return this.layerOpacity;
  }

  set opacity(value: number) {
    this.layerOpacity = clampOpacity(value);
  }

  /**
   * Get the 2D drawing context of the layer's canvas.
   */
  get context(): OffscreenCanvasRenderingContext2D {
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Layer canvas has no 2D context");
    return context;
  }

  /**
   * Remove all image data from the layer.
   */
  clear(): void {
    this.context.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Replace this layer's image data with a copy of another layer's image data.
   */
  copyImageFrom(source: Layer): void {
    this.clear();
    this.context.drawImage(source.canvas, 0, 0);
  }

  /**
   * Get the layer's settings (without image data).
   */
  toConfig(): Required<LayerConfig> {
    return {
      id: this.id,
      name: this.name,
      blendMode: this.blendMode,
      opacity: this.opacity,
      visible: this.visible,
      alphaLock: this.alphaLock,
    };
  }
}
