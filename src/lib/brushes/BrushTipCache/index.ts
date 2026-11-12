import type { BrushConfig, BrushesConfig } from "../types";
import BrushTip, {
  decodeImage,
  type ImageDecoder,
} from "../../rendering/BrushTip";
import { createOffscreenCanvas, type CanvasFactory } from "../../classes/Layer";

/**
 * The key a tip is kept under: its shape image, as a data URL or bytes. Settings with the same shape share a tip, and a
 * changed shape loads anew.
 */
type TipKey = string | Uint8Array;

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
  private readonly tips = new Map<TipKey, BrushTip>();

  private readonly loading = new Set<TipKey>();

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
   * Get the tip of a brush's settings, starting to load it if needed. Returns the round tip while loading or if loading
   * fails.
   */
  get(preset: BrushConfig): BrushTip {
    const key = preset.image;
    if (!key) return this.round;
    const tip = this.tips.get(key);
    if (tip) return tip;
    if (!this.loading.has(key)) void this.load(preset, key);
    return this.round;
  }

  /**
   * Start loading every preset's tip, so the first stroke with each preset already uses its shape.
   */
  preload(presets: BrushesConfig): void {
    for (const preset of Object.values(presets)) this.get(preset.content);
  }

  /**
   * Load the tip of a brush's settings and remember it under its key.
   */
  private async load(preset: BrushConfig, key: TipKey): Promise<void> {
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
