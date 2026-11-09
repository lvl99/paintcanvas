import { css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { styleMap } from "lit/directives/style-map.js";
import { PcElement, defineElement, emit } from "../../base";
import { fitNumber } from "../PcNumberSlider";
import "../PcNumberSlider";

/** One of a range's two ends: its lowest or highest value */
export type RangeEnd = "low" | "high";

/** What `pc-input` and `pc-change` give: the range's lowest and highest values */
export interface RangeDetail {
  /** A single slider's value (the same as `high`) */
  value: number;
  low: number;
  high: number;
}

/**
 * Where a value sits between `min` and `max`, from 0 to 1 (0 when they're the same).
 *
 * @example
 * rangeFraction(25, 0, 100); // 0.25
 */
export const rangeFraction = (
  value: number,
  min: number,
  max: number,
): number =>
  max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

/**
 * A slider for a range: one track with two handles, the left for the lowest value (`low`) and the right for the highest
 * (`high`), and a `<pc-number-slider>` for each on either side (dragged, or tapped to type). The two can't cross: the
 * lowest is never above the highest. Values are kept within `min` and `max` and rounded to `step`.
 *
 * Pressing the track moves the nearest handle there and drags it. With keyboard focus on a handle, the arrow keys move
 * it by `step`, Page Up and Page Down by `pageStep`, and Home and End as far as it can go. Touch, mouse and pen all work.
 *
 * With `single`, it's a slider for one value (`value`, from `min`): one handle, and one number slider before the track,
 * or after it with `number-position="end"`. Use it for single values too, so they look and work the same as ranges.
 *
 * Fires `pc-input` (detail: `{ low, high }`) while a handle is dragged, and `pc-change` once it's let go, or when a value
 * is changed with the keyboard or a number slider, after changing `low` and `high` themselves (and `value`, the same as
 * `high`).
 *
 * @example
 * html`<pc-slider-range label="Width" min="1" max="256" .low=${10} .high=${40}
 *   @pc-change=${(e) => setWidth(e.detail.low, e.detail.high)}></pc-slider-range>`
 */
export class PcSliderRange extends PcElement {
  static override properties = {
    ...PcElement.properties,
    low: { type: Number },
    high: { type: Number },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
    pageStep: { type: Number, attribute: "page-step" },
    unit: { type: String },
    label: { type: String },
    single: { type: Boolean, reflect: true },
    numberPosition: { type: String, attribute: "number-position" },
    disabled: { type: Boolean, reflect: true },
    dragging: { state: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--pc-space-2);
        min-width: 0;
        --pc-range-thumb: 16px;
      }
      :host([disabled]) {
        opacity: 0.5;
      }
      pc-number-slider {
        flex: none;
        width: 4.5em;
      }
      /* The handles' centres reach the ends of the track */
      .track {
        position: relative;
        flex: 1;
        min-width: 60px;
        height: 24px;
        margin: 0 calc(var(--pc-range-thumb) / 2);
        touch-action: none;
        cursor: pointer;
      }
      :host([disabled]) .track {
        cursor: default;
      }
      .rail,
      .fill {
        position: absolute;
        top: 50%;
        height: 4px;
        border-radius: var(--pc-radius-pill);
        transform: translateY(-50%);
      }
      .rail {
        left: calc(var(--pc-range-thumb) / -2);
        right: calc(var(--pc-range-thumb) / -2);
        background: var(--pc-border);
      }
      .fill {
        background: var(--pc-accent);
      }
      /* A 24px target around each 16px thumb, for fingers */
      .handle {
        position: absolute;
        top: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-left: -12px;
        border-radius: 50%;
        outline: none;
      }
      .handle::before {
        content: "";
        width: var(--pc-range-thumb);
        height: var(--pc-range-thumb);
        box-sizing: border-box;
        border: 2px solid var(--pc-surface-raised);
        border-radius: 50%;
        background: var(--pc-accent);
        box-shadow: var(--pc-shadow);
      }
      .handle:focus-visible::before {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 2px;
      }
      /* The handle being dragged stays on top, so it can be dragged off the other */
      .handle.active {
        z-index: 1;
      }
    `,
  ];

  /** The range's lowest value */
  declare low: number;

  /** The range's highest value */
  declare high: number;

  /** Lowest value either end can have (0 by default) */
  declare min: number;

  /** Highest value either end can have (100 by default) */
  declare max: number;

  /** What values are rounded to, and how much an arrow key moves a handle (1 by default) */
  declare step: number;

  /** How much Page Up and Page Down move a handle (10 steps by default) */
  declare pageStep?: number;

  /** Shown after each value, e.g. "%" */
  declare unit: string;

  /** The range's name for screen readers, e.g. "Width" (each end is named from it) */
  declare label: string;

  declare disabled: boolean;

  /** Whether it's a slider for one value (`value`), with one handle and one number slider */
  declare single: boolean;

  /** Where a single slider's number slider goes: before the track (`start`, the default) or after it (`end`) */
  declare numberPosition: "start" | "end";

  /** A single slider's value: the same as `high` */
  get value(): number {
    return this.high;
  }

  set value(value: number) {
    this.high = value;
  }

  /** What `pc-input` and `pc-change` give */
  private get detail(): RangeDetail {
    return { low: this.low, high: this.high, value: this.high };
  }

  /** How far an end can go: not past the other end (a single slider's value can go down to `min`) */
  private limitsOf(end: RangeEnd): [number, number] {
    if (end === "low") return [this.min, this.high];
    return [this.single ? this.min : this.low, this.max];
  }

  /** An end's name for screen readers: a single slider's is its label */
  private endLabel(end: RangeEnd): string {
    return this.single
      ? this.label
      : this.t(`paintCanvas.range.${end}`, { label: this.label });
  }

  /** The end being dragged, if any */
  declare dragging?: RangeEnd;

  constructor() {
    super();
    this.low = 0;
    this.high = 100;
    this.min = 0;
    this.max = 100;
    this.step = 1;
    this.unit = "";
    this.label = "";
    this.single = false;
    this.numberPosition = "start";
    this.disabled = false;
  }

  /**
   * Set one end, kept within `min` and `max`, rounded to `step`, and not past the other end, then tell listeners (with
   * `pc-input` while dragging, or `pc-change`) if it changed.
   *
   * @example
   * range.setEnd("high", 40); // high is 40, unless low is above it (then it's low)
   */
  setEnd(end: RangeEnd, value: number, type = "pc-change"): void {
    const [lowest, highest] = this.limitsOf(end);
    const next = Math.min(
      highest,
      Math.max(lowest, fitNumber(value, this.min, this.max, this.step)),
    );
    if (next === this[end]) return;
    this[end] = next;
    emit<RangeDetail>(this, type, this.detail);
  }

  /** The value at a pointer's position along the track */
  private valueAt(event: PointerEvent): number {
    const track = event.currentTarget as HTMLElement;
    const { left, width } = track.getBoundingClientRect();
    const fraction = width > 0 ? (event.clientX - left) / width : 0;
    return (
      this.min + Math.min(1, Math.max(0, fraction)) * (this.max - this.min)
    );
  }

  /** The end nearest a value: the high end when it's above both, or past the middle of two that meet */
  private nearestEnd(value: number): RangeEnd {
    if (this.single) return "high";
    if (value > this.high) return "high";
    if (value < this.low) return "low";
    return value - this.low > this.high - value ? "high" : "low";
  }

  // Pressing the track moves the nearest handle there, and drags it
  private onPointerDown(event: PointerEvent): void {
    if (this.disabled || event.button > 0) return;
    event.preventDefault();
    const value = this.valueAt(event);
    const end = this.nearestEnd(value);
    this.dragging = end;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    (this.renderRoot.querySelector(`.handle.${end}`) as HTMLElement).focus();
    this.setEnd(end, value, "pc-input");
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.dragging)
      this.setEnd(this.dragging, this.valueAt(event), "pc-input");
  }

  // Letting go tells listeners the range is settled
  private onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = undefined;
    emit<RangeDetail>(this, "pc-change", this.detail);
  }

  /** Move a handle with the arrow keys, Page Up and Page Down, Home and End */
  private onHandleKeyDown(event: KeyboardEvent, end: RangeEnd): void {
    if (this.disabled) return;
    const page = this.pageStep ?? this.step * 10;
    const value = this[end];
    const moves: Record<string, number> = {
      ArrowRight: value + this.step,
      ArrowUp: value + this.step,
      ArrowLeft: value - this.step,
      ArrowDown: value - this.step,
      PageUp: value + page,
      PageDown: value - page,
      Home: this.min,
      End: this.max,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.setEnd(end, next);
  }

  /** One end's handle */
  private renderHandle(end: RangeEnd) {
    const value = this[end];
    const [lowest, highest] = this.limitsOf(end);
    return html`<div
      class="handle ${end} ${this.dragging === end ? "active" : ""}"
      part="handle"
      role="slider"
      tabindex=${this.disabled ? -1 : 0}
      aria-label=${this.endLabel(end)}
      aria-valuemin=${lowest}
      aria-valuemax=${highest}
      aria-valuenow=${value}
      aria-valuetext=${`${value}${this.unit}`}
      aria-disabled=${this.disabled ? "true" : nothing}
      style=${styleMap({
        left: `${rangeFraction(value, this.min, this.max) * 100}%`,
      })}
      @keydown=${(event: KeyboardEvent) => this.onHandleKeyDown(event, end)}
    ></div>`;
  }

  /** One end's number slider: it can't go past the other end */
  private renderNumber(end: RangeEnd) {
    const [lowest, highest] = this.limitsOf(end);
    return html`<pc-number-slider
      class=${end}
      part="number"
      label=${this.endLabel(end)}
      min=${lowest}
      max=${highest}
      step=${this.step}
      page-step=${this.pageStep ?? nothing}
      unit=${this.unit}
      ?disabled=${this.disabled}
      .value=${live(this[end])}
      @pc-change=${(event: CustomEvent<{ value: number }>) => {
        event.stopPropagation();
        this.setEnd(end, event.detail.value);
      }}
    ></pc-number-slider>`;
  }

  override render() {
    const from = this.single
      ? 0
      : rangeFraction(this.low, this.min, this.max) * 100;
    const to = rangeFraction(this.high, this.min, this.max) * 100;
    const before = this.single
      ? this.numberPosition === "end"
        ? nothing
        : this.renderNumber("high")
      : this.renderNumber("low");
    const after =
      !this.single || this.numberPosition === "end"
        ? this.renderNumber("high")
        : nothing;
    return html`${before}
      <div
        class="track"
        part="track"
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${this.onPointerUp}
        @pointercancel=${this.onPointerUp}
      >
        <div class="rail"></div>
        <div
          class="fill"
          part="fill"
          style=${styleMap({ left: `${from}%`, right: `${100 - to}%` })}
        ></div>
        ${this.single ? nothing : this.renderHandle("low")}
        ${this.renderHandle("high")}
      </div>
      ${after}`;
  }
}

defineElement("pc-slider-range", PcSliderRange);
