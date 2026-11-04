import type { BrushConfig, BrushesConfig } from "../../brushes/types";

/** Smallest brush size in pixels */
export const MIN_BRUSH_SIZE = 1;

/** Largest brush size in pixels */
export const MAX_BRUSH_SIZE = 256;

/** Fraction of the current size added or removed by `grow` and `shrink` ("]" and "[" keys) */
export const BRUSH_SIZE_STEP = 0.1;

/** Opacity step for the opacity keyboard shortcuts, in percent */
export const BRUSH_OPACITY_STEP = 10;

/** Lowest opacity the opacity keyboard shortcuts go to, in percent */
export const MIN_BRUSH_OPACITY = 1;

/**
 * Clamp a value between min and max.
 *
 * @example
 * clamp(300, 1, 256); // 256
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * The next opacity step up or down, in percent: to the next multiple of `BRUSH_OPACITY_STEP`, from
 * `MIN_BRUSH_OPACITY` to 100.
 *
 * @example
 * stepOpacity(45, 1); // 50
 * stepOpacity(10, -1); // 1
 * stepOpacity(1, 1); // 10
 */
export const stepOpacity = (percent: number, direction: 1 | -1): number => {
  const steps = percent / BRUSH_OPACITY_STEP;
  const next =
    (direction > 0
      ? Math.floor(steps + 1e-9) + 1
      : Math.ceil(steps - 1e-9) - 1) * BRUSH_OPACITY_STEP;
  return clamp(next, MIN_BRUSH_OPACITY, 100);
};

/**
 * The settings of a brush or eraser: the selected preset, an editable copy of its settings (changed from the tool
 * settings bar or the configuration window, without changing the preset) and the size. The brush and eraser each have
 * their own instance.
 *
 * Dispatches a `change` event whenever the presets, settings or size change.
 *
 * @example
 * const brush = new BrushSettings(standardBrushes);
 * brush.grow(); // "]" key
 * brush.update({ alpha: 0.5 }); // half opacity, until another preset is selected
 */
export default class BrushSettings extends EventTarget {
  /** Available presets */
  presets: BrushesConfig;

  /** Current width in pixels */
  width = 1;

  /** Current height in pixels */
  height = 1;

  /** ID of the selected preset */
  presetId: string;

  /** The current settings: a copy of the selected preset, with any changes */
  private current: BrushConfig;

  constructor(presets: BrushesConfig) {
    super();
    const first = Object.values(presets)[0];
    if (!first) throw new Error("At least one brush preset is required");
    this.presets = presets;
    this.presetId = first.id;
    this.current = structuredClone(first);
    this.applyPresetSize(first);
  }

  /** The current settings: the selected preset's, with any changes made since selecting it */
  get preset(): BrushConfig {
    return this.current;
  }

  /** The selected preset as saved, or undefined if it no longer exists */
  get selectedPreset(): BrushConfig | undefined {
    return this.presets[this.presetId];
  }

  /**
   * Select a preset: use a fresh copy of its settings and its default size.
   */
  select(id: string): void {
    const preset = this.presets[id];
    if (!preset) throw new Error(`Brush preset ${id} not found`);
    this.presetId = id;
    this.current = structuredClone(preset);
    this.applyPresetSize(preset);
    this.notify();
  }

  /**
   * Change the current settings (not the preset). The size is changed with `setSize`.
   *
   * @example
   * brush.update({ alpha: 0.5, widthConfig: { usePressure: true } });
   */
  update(changes: Partial<BrushConfig>): void {
    this.current = { ...this.current, ...changes, id: this.current.id };
    this.notify();
  }

  /**
   * Replace the current settings and size with a whole configuration (the configuration window's "Save").
   */
  apply(config: BrushConfig): void {
    this.current = { ...structuredClone(config), id: this.current.id };
    this.applyPresetSize(config);
    this.notify();
  }

  /**
   * Replace the available presets (e.g. when custom presets are added or removed). If the selected preset is gone, the
   * current settings stay until another preset is selected.
   */
  setPresets(presets: BrushesConfig): void {
    if (Object.keys(presets).length === 0)
      throw new Error("At least one brush preset is required");
    this.presets = presets;
    this.notify();
  }

  /**
   * Set the height, clamped to 1–256 pixels. If the settings constrain proportions, width follows height.
   */
  setHeight(height: number): void {
    if (!this.current.constrainProportions) {
      this.setSize(this.width, height);
      return;
    }
    const ratio = this.width / this.height;
    this.setSize(clamp(height, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE) * ratio);
  }

  /**
   * Set the size, clamped to 1–256 pixels. If the settings constrain proportions, height follows width.
   */
  setSize(width: number, height: number = width): void {
    const ratio = this.height / this.width;
    this.width = Math.round(clamp(width, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE));
    this.height = Math.round(
      clamp(
        this.preset.constrainProportions ? this.width * ratio : height,
        MIN_BRUSH_SIZE,
        MAX_BRUSH_SIZE,
      ),
    );
    this.notify();
  }

  /**
   * Change the size by a number of pixels (positive = bigger). Used when dragging up/right (bigger) or down/left (smaller).
   */
  resize(delta: number): void {
    this.setSize(this.width + delta, this.height + delta);
  }

  /**
   * Increase the size by one step (at least 1 pixel).
   */
  grow(): void {
    this.resize(Math.max(1, Math.round(this.width * BRUSH_SIZE_STEP)));
  }

  /**
   * Decrease the size by one step (at least 1 pixel).
   */
  shrink(): void {
    this.resize(-Math.max(1, Math.round(this.width * BRUSH_SIZE_STEP)));
  }

  /**
   * Increase the opacity by one step (see `stepOpacity`).
   */
  moreOpaque(): void {
    this.stepOpacity(1);
  }

  /**
   * Decrease the opacity by one step (see `stepOpacity`).
   */
  lessOpaque(): void {
    this.stepOpacity(-1);
  }

  /** Change the opacity by one step up or down */
  private stepOpacity(direction: 1 | -1): void {
    const percent = Math.round((this.current.alpha ?? 1) * 100);
    this.update({ alpha: stepOpacity(percent, direction) / 100 });
  }

  /**
   * Use a preset's (or configuration's) default size.
   */
  private applyPresetSize(preset: BrushConfig): void {
    this.width = preset.width ?? MIN_BRUSH_SIZE;
    this.height = preset.height ?? this.width;
  }

  /**
   * Dispatch a `change` event.
   */
  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }
}
