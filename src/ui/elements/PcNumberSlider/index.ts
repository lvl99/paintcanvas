import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import { DRAG_THRESHOLD, PointerDrag } from "../../drag";

/**
 * A number kept within `min` and `max` and rounded to a multiple of `step` (from `min`).
 *
 * @example
 * fitNumber(300, 1, 256, 1); // 256
 * fitNumber(12.4, 0, 100, 5); // 10
 */
export const fitNumber = (
  value: number,
  min: number,
  max: number,
  step: number,
): number => {
  const stepped = min + Math.round((value - min) / step) * step;
  return Math.min(max, Math.max(min, stepped));
};

/**
 * A number shown as text that changes when pressed and dragged: right or up raises it, left or down lowers it, a step
 * per pixel, within `min` and `max`. A press that barely moves (a tap or click) turns it into a field to type a value
 * in: Enter or leaving the field keeps the value, Escape cancels.
 *
 * With keyboard focus, the arrow keys change it by `step`, Page Up and Page Down by `pageStep`, Home and End go to
 * `min` and `max`, and Enter or F2 starts typing.
 *
 * Fires `pc-change` (detail: `{ value }`) when the value changes, after changing `value` itself. Bind a value that
 * may be changed by others with `live()`, e.g. `.value=${live(brush.width)}`, so it's shown again if a listener keeps
 * it the same.
 *
 * @example
 * html`<pc-number-slider label="Opacity" min="0" max="100" unit="%" .value=${live(50)}
 *   @pc-change=${(e) => setOpacity(e.detail.value)}></pc-number-slider>`
 */
export class PcNumberSlider extends PcElement {
  static override properties = {
    ...PcElement.properties,
    value: { type: Number },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
    pageStep: { type: Number, attribute: "page-step" },
    unit: { type: String },
    text: { type: String },
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
    editing: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: inline-flex;
        min-width: 44px;
        user-select: none;
        -webkit-user-select: none;
      }
      [role="slider"],
      input {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-width: 0;
        min-height: 30px;
        margin: 0;
        padding: 0 var(--pc-space-2);
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface);
        color: var(--pc-text);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
        font-variant-numeric: tabular-nums;
        text-align: center;
        white-space: nowrap;
      }
      [role="slider"] {
        cursor: ew-resize;
        touch-action: none;
      }
      [role="slider"]:hover {
        background: var(--pc-surface-hover);
      }
      [role="slider"]:focus-visible,
      input:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: -2px;
      }
      input {
        user-select: text;
        -webkit-user-select: text;
      }
      :host([disabled]) [role="slider"] {
        opacity: 0.4;
        cursor: default;
      }
    `,
  ];

  /** The number */
  declare value: number;

  /** Lowest value (0 by default) */
  declare min: number;

  /** Highest value (100 by default) */
  declare max: number;

  /** How much a pixel of dragging or an arrow key changes it (1 by default) */
  declare step: number;

  /** How much Page Up and Page Down change it (10 steps by default) */
  declare pageStep?: number;

  /** Shown after the value, e.g. "%" */
  declare unit: string;

  /** Shown instead of the value and unit, e.g. "30 × 10" */
  declare text: string;

  /** Its name for screen readers, e.g. "Opacity" */
  declare label: string;

  declare disabled: boolean;

  /** Whether it's a field being typed in */
  declare editing: boolean;

  /** Whether focus goes back to the slider when typing ends (it doesn't when the field lost focus) */
  private refocus = false;

  private readonly drag = new PointerDrag(
    (delta) => this.change(this.value + delta * this.step),
    DRAG_THRESHOLD,
  );

  constructor() {
    super();
    this.value = 0;
    this.min = 0;
    this.max = 100;
    this.step = 1;
    this.unit = "";
    this.text = "";
    this.label = "";
    this.disabled = false;
    this.editing = false;
  }

  /** The value as shown: `text`, or the value and unit */
  get displayText(): string {
    return this.text || `${this.value}${this.unit}`;
  }

  /**
   * Set the value (fitted within `min` and `max`, to a multiple of `step`) and tell listeners if it changed.
   *
   * @example
   * slider.change(40); // fires pc-change with { value: 40 }
   */
  change(value: number): void {
    const next = fitNumber(value, this.min, this.max, this.step);
    if (next === this.value) return;
    this.value = next;
    emit(this, "pc-change", { value: next });
  }

  /**
   * Turn into a field to type a value in, with its text selected.
   */
  startEditing(): void {
    if (this.disabled) return;
    this.refocus = true;
    this.editing = true;
    // Show and focus the field now, while handling the press, so touch devices show their keyboard
    this.performUpdate();
  }

  /**
   * Stop typing, keeping the typed value (if it's a number) unless cancelled.
   */
  private stopEditing(keep: boolean): void {
    const input = this.renderRoot.querySelector("input") as HTMLInputElement;
    const typed = input.value.trim();
    this.editing = false;
    if (keep && typed !== "" && Number.isFinite(Number(typed)))
      this.change(Number(typed));
  }

  /** Start a press, unless disabled */
  private onPointerDown(event: PointerEvent): void {
    if (!this.disabled) this.drag.start(event);
  }

  /** End a press: one that didn't become a drag starts typing */
  private onPointerUp(): void {
    if (this.disabled) return;
    if (!this.drag.end()) this.startEditing();
  }

  /** Change the value with the arrow keys, Page Up and Page Down, Home and End, or start typing (Enter, F2) */
  private onSliderKeyDown(event: KeyboardEvent): void {
    if (this.disabled) return;
    const page = this.pageStep ?? this.step * 10;
    const actions: Record<string, () => void> = {
      ArrowUp: () => this.change(this.value + this.step),
      ArrowRight: () => this.change(this.value + this.step),
      ArrowDown: () => this.change(this.value - this.step),
      ArrowLeft: () => this.change(this.value - this.step),
      PageUp: () => this.change(this.value + page),
      PageDown: () => this.change(this.value - page),
      Home: () => this.change(this.min),
      End: () => this.change(this.max),
      Enter: () => this.startEditing(),
      F2: () => this.startEditing(),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  /** Keep the typed value with Enter, or cancel with Escape (neither reaches the rest of the page) */
  private onInputKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.stopEditing(event.key === "Enter");
  }

  /**
   * Keep the typed value when the field loses focus, leaving focus where it went. Ignored once typing has ended (some
   * browsers blur the field as it's removed).
   */
  private onInputBlur(): void {
    if (!this.editing) return;
    this.refocus = false;
    this.stopEditing(true);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("disabled") && this.disabled) this.editing = false;
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has("editing")) return;
    if (this.editing) {
      const input = this.renderRoot.querySelector("input") as HTMLInputElement;
      input.focus();
      input.select();
    } else if (changed.get("editing") && this.refocus)
      (this.renderRoot.querySelector("[role=slider]") as HTMLElement).focus();
  }

  override render() {
    const text = this.displayText;
    if (this.editing)
      return html`<input
        part="field"
        type="text"
        inputmode="decimal"
        aria-label=${this.label || nothing}
        .value=${String(this.value)}
        @keydown=${this.onInputKeyDown}
        @blur=${this.onInputBlur}
      />`;
    return html`<div
      part="control"
      role="slider"
      tabindex=${this.disabled ? -1 : 0}
      aria-label=${this.label || nothing}
      aria-valuemin=${this.min}
      aria-valuemax=${this.max}
      aria-valuenow=${this.value}
      aria-valuetext=${text}
      aria-disabled=${this.disabled ? "true" : nothing}
      title=${this.t("paintCanvas.numberSlider.hint")}
      @pointerdown=${this.onPointerDown}
      @pointermove=${this.drag.move}
      @pointerup=${this.onPointerUp}
      @pointercancel=${this.drag.end}
      @keydown=${this.onSliderKeyDown}
    >
      ${text}
    </div>`;
  }
}

defineElement("pc-number-slider", PcNumberSlider);
