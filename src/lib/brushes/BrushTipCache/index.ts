import type { BrushConfig, BrushesConfig } from "../types";
import BrushTip, {
  decodeImage,
  type ImageDecoder,
} from "../../rendering/BrushTip";
import { createOffscreenCanvas, type CanvasFactory } from "../../classes/Layer";

/**
 * The key a preset's tip is kept under: its shape image (so presets and edited settings with the same shape share a
 * tip, and a changed shape loads anew), or its ID for shapes given as bytes.
 */
const tipKey = (preset: BrushConfig): string =>
  typeof preset.image === "string" ? preset.image : preset.id;

/**
 * Loads and keeps each shape's brush tip. Until a shape's image has loaded, the round tip is used.
 *
 * Dispatches a `change` event when a tip finishes loading.
 *
 * @example
 * const tips = new BrushTipCache();
 * const tip = tips.get(preset); // round until the image loads
 */
export default class BrushTipCache extends EventTarget {
  private readonly tips = new Map<string, BrushTip>();

  private readonly loading = new Set<string>();

  private readonly round: BrushTip;

  private readonly decode: ImageDecoder;

  private readonly createCanvas: CanvasFactory;

  constructor(
    decode: ImageDecoder = decodeImage,
    createCanvas: CanvasFactory = createOffscreenCanvas,
  ) {
    super();
    this.decode = decode;
    this.createCanvas = createCanvas;
    this.round = new BrushTip(undefined, undefined, createCanvas);
  }

  /**
   * Get a preset's tip, starting to load it if needed. Returns the round tip while loading or if loading fails.
   */
  get(preset: BrushConfig): BrushTip {
    if (!preset.image) return this.round;
    const key = tipKey(preset);
    const tip = this.tips.get(key);
    if (tip) return tip;
    if (!this.loading.has(key)) void this.load(preset, key);
    return this.round;
  }

  /**
   * Start loading every preset's tip, so the first stroke with each preset already uses its shape.
   */
  preload(presets: BrushesConfig): void {
    for (const preset of Object.values(presets)) this.get(preset);
  }

  /**
   * Load a preset's tip and remember it under its key.
   */
  private async load(preset: BrushConfig, key: string): Promise<void> {
    this.loading.add(key);
    try {
      this.tips.set(
        key,
        await BrushTip.load(preset, this.decode, this.createCanvas),
      );
      this.dispatchEvent(new Event("change"));
    } catch {
      // Keep using the round tip if the image cannot be decoded
      this.tips.set(key, this.round);
    }
  }
}
