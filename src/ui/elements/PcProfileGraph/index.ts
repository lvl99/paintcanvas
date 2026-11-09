import { css, html, nothing, svg, unsafeCSS } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import { ICON_CONTROLS_CSS } from "../../styles";
import { iconLabel } from "../../icons";
import {
  GRID_UNITS,
  Interpolation,
  MAX_PROFILE_POINTS,
  linearPoints,
  profileY,
  type ProfilePoint,
} from "../../../lib/profiles";

/** Space around the grid, in grid units, so points on its edges can be pressed */
const MARGIN = 0.6;

/** How close (in grid units) a press must be to the line to add a point there */
const LINE_REACH = 0.6;

/** Points are placed on multiples of this many grid units when dragged */
const SNAP = 0.1;

/** How many pieces the curve is drawn with */
const CURVE_STEPS = 100;

/** A value rounded to `SNAP` and kept within a range */
const snap = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value / SNAP) * SNAP));

/**
 * The SVG path of a curve through points, drawn as short straight pieces (y is flipped: up is less negative).
 *
 * @example
 * curvePath(linearPoints()); // "M0,10 L0.1,9.9 …"
 */
export const curvePath = (points: readonly ProfilePoint[]): string =>
  Array.from({ length: CURVE_STEPS + 1 }, (_, step) => {
    const x = (step / CURVE_STEPS) * GRID_UNITS;
    const y = Math.min(GRID_UNITS, Math.max(0, -profileY(points, x)));
    return `${step ? "L" : "M"}${+x.toFixed(3)},${+y.toFixed(3)}`;
  }).join(" ");

/**
 * Move a point within the grid, keeping it between its neighbours (and the first and last points at the edges), to
 * multiples of 0.1. Returns new points.
 *
 * @example
 * movePoint(points, 1, 4.04, -3); // points[1] at { x: 4, y: -3 }
 */
export const movePoint = (
  points: readonly ProfilePoint[],
  index: number,
  x: number,
  y: number,
): ProfilePoint[] => {
  const last = points.length - 1;
  const before = points[index - 1] as ProfilePoint;
  const after = points[index + 1] as ProfilePoint;
  const nextX =
    index === 0 ? 0 : index === last ? GRID_UNITS : snap(x, before.x, after.x);
  return points.map((point, i) =>
    i === index ? { ...point, x: nextX, y: snap(y, -GRID_UNITS, 0) } : point,
  );
};

/**
 * A profile graph to edit (see `@lvl99dotcom/paintcanvas/lib/profiles`): a 10 × 10 grid with the curve through its
 * points, from the setting's min at the bottom left to its max at the top right.
 *
 * - Pressing the line adds a point there (smooth), selected.
 * - Pressing a point selects it; dragging moves it (between its neighbours; the first and last stay at the edges).
 * - With a point selected, the arrow keys move it a grid unit, and the buttons below make it a sharp corner (linear)
 *   or smooth (bezier cubic), or remove it (−; not the first or last).
 *
 * Points are focusable buttons (Tab moves between them; focusing one selects it). Fires `pc-change` (detail:
 * `{ points }`) whenever the points change, after changing `points` itself.
 *
 * @example
 * html`<pc-profile-graph .points=${points} @pc-change=${(e) => (points = e.detail.points)}></pc-profile-graph>`
 */
export class PcProfileGraph extends PcElement {
  static override properties = {
    ...PcElement.properties,
    points: { attribute: false },
    selected: { type: Number },
    label: { type: String },
  };

  static override styles = [
    PcElement.styles,
    unsafeCSS(ICON_CONTROLS_CSS),
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--pc-space-2);
        color: var(--pc-text);
        font-family: var(--pc-font);
      }
      svg {
        width: 100%;
        max-width: 300px;
        aspect-ratio: 1;
        touch-action: none;
        cursor: crosshair;
        user-select: none;
      }
      .grid {
        stroke: var(--pc-border);
        stroke-width: 0.03;
      }
      .frame {
        fill: var(--pc-surface);
        stroke: var(--pc-text);
        stroke-width: 0.08;
      }
      .diagonal {
        stroke: var(--pc-text-muted);
        stroke-width: 0.03;
      }
      .area {
        fill: var(--pc-surface-active);
      }
      .curve {
        fill: none;
        stroke: var(--pc-text);
        stroke-width: 0.12;
      }
      .point {
        fill: var(--pc-text);
        stroke: var(--pc-surface);
        stroke-width: 0.08;
        cursor: grab;
        outline: none;
      }
      .point.selected {
        fill: var(--pc-accent);
        stroke: var(--pc-text);
      }
      .point:focus-visible {
        stroke: var(--pc-focus);
        stroke-width: 0.15;
      }
      .buttons {
        display: flex;
        gap: var(--pc-space-2);
      }
      button.icon-button {
        min-width: 32px;
        min-height: 32px;
        justify-content: center;
        align-items: center;
        color: var(--pc-text);
        font: inherit;
        font-size: 20px;
        line-height: 1;
      }
    `,
  ];

  /** The points, from left to right */
  declare points: ProfilePoint[];

  /** The selected point's index, if any */
  declare selected?: number;

  /** The graph's name for screen readers */
  declare label: string;

  /** The point being dragged */
  private dragging?: number;

  constructor() {
    super();
    this.points = linearPoints();
    this.label = "";
  }

  /** Change the points and tell listeners */
  private setPoints(points: ProfilePoint[]): void {
    this.points = points;
    emit(this, "pc-change", { points });
  }

  /** A pointer's position in grid units */
  private gridAt(event: PointerEvent): { x: number; y: number } {
    const svgElement = this.renderRoot.querySelector("svg") as SVGSVGElement;
    const { left, top, width, height } = svgElement.getBoundingClientRect();
    const size = GRID_UNITS + MARGIN * 2;
    return {
      x: ((event.clientX - left) / (width || 1)) * size - MARGIN,
      y: -(((event.clientY - top) / (height || 1)) * size - MARGIN),
    };
  }

  /**
   * Add a point (smooth) where a press on the line is, and select it. Does nothing away from the line or when full.
   */
  private onGraphDown(event: PointerEvent): void {
    if (event.button > 0 || this.points.length >= MAX_PROFILE_POINTS) return;
    const { x, y } = this.gridAt(event);
    if (x <= 0 || x >= GRID_UNITS) return;
    if (Math.abs(profileY(this.points, x) - y) > LINE_REACH) return;
    const index = this.points.findIndex((point) => point.x > x);
    const added: ProfilePoint = {
      x: snap(x, 0, GRID_UNITS),
      y: snap(profileY(this.points, x), -GRID_UNITS, 0),
      i: Interpolation.BezierCubic,
    };
    this.setPoints([
      ...this.points.slice(0, index),
      added,
      ...this.points.slice(index),
    ]);
    this.startDrag(event, index);
  }

  /** Select a point and start dragging it */
  private startDrag(event: PointerEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.selected = index;
    this.dragging = index;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  private onMove(event: PointerEvent): void {
    if (this.dragging === undefined) return;
    const { x, y } = this.gridAt(event);
    this.setPoints(movePoint(this.points, this.dragging, x, y));
  }

  private onUp(): void {
    this.dragging = undefined;
  }

  /** Move the selected point a grid unit with the arrow keys */
  private onPointKeyDown(event: KeyboardEvent, index: number): void {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const point = this.points[index] as ProfilePoint;
    this.setPoints(
      movePoint(this.points, index, point.x + move[0], point.y + move[1]),
    );
  }

  /** Make the selected point a sharp corner or smooth */
  setInterpolation(i: Interpolation): void {
    const index = this.selected;
    if (index === undefined) return;
    this.setPoints(
      this.points.map((point, at) => (at === index ? { ...point, i } : point)),
    );
  }

  /** Remove the selected point (not the first or last) */
  removeSelected(): void {
    const index = this.selected;
    if (!index || index >= this.points.length - 1) return;
    this.selected = undefined;
    this.setPoints(this.points.filter((_, at) => at !== index));
  }

  override render() {
    const { points } = this;
    const selected =
      this.selected === undefined ? undefined : points[this.selected];
    const inner =
      this.selected !== undefined &&
      this.selected > 0 &&
      this.selected < points.length - 1;
    const curve = curvePath(points);
    const lines = Array.from({ length: GRID_UNITS - 1 }, (_, i) => i + 1);
    const size = GRID_UNITS + MARGIN * 2;
    return html`<svg
        part="graph"
        viewBox="${-MARGIN} ${-MARGIN} ${size} ${size}"
        role="group"
        aria-label=${this.label || nothing}
        @pointerdown=${this.onGraphDown}
        @pointermove=${this.onMove}
        @pointerup=${this.onUp}
        @pointercancel=${this.onUp}
      >
        <rect
          class="frame"
          x="0"
          y="0"
          width=${GRID_UNITS}
          height=${GRID_UNITS}
        ></rect>
        <path
          class="area"
          d="${curve} L${GRID_UNITS},${GRID_UNITS} L0,${GRID_UNITS} Z"
        ></path>
        ${lines.map(
          (n) =>
            svg`<line class="grid" x1=${n} y1="0" x2=${n} y2=${GRID_UNITS}></line><line class="grid" x1="0" y1=${n} x2=${GRID_UNITS} y2=${n}></line>`,
        )}
        <line
          class="diagonal"
          x1="0"
          y1=${GRID_UNITS}
          x2=${GRID_UNITS}
          y2="0"
        ></line>
        <path class="curve" d=${curve}></path>
        ${points.map(
          (point, index) =>
            svg`<circle
              class="point ${index === this.selected ? "selected" : ""}"
              cx=${point.x}
              cy=${-point.y}
              r="0.35"
              tabindex="0"
              role="button"
              aria-pressed=${index === this.selected ? "true" : "false"}
              aria-label=${this.t("paintCanvas.profileGraph.point", { number: index + 1, x: point.x, y: point.y })}
              @focus=${() => (this.selected = index)}
              @pointerdown=${(event: PointerEvent) => this.startDrag(event, index)}
              @keydown=${(event: KeyboardEvent) => this.onPointKeyDown(event, index)}
            ></circle>`,
        )}
      </svg>
      <div class="buttons" part="buttons">
        <button
          type="button"
          class="icon-button remove"
          title=${this.t("paintCanvas.profileGraph.remove")}
          aria-label=${this.t("paintCanvas.profileGraph.remove")}
          ?disabled=${!inner}
          @click=${() => this.removeSelected()}
        >
          −
        </button>
        <button
          type="button"
          class="icon-button linear"
          title=${this.t("paintCanvas.profileGraph.linear")}
          aria-pressed=${selected?.i === Interpolation.Linear ? "true" : "false"}
          ?disabled=${!selected}
          @click=${() => this.setInterpolation(Interpolation.Linear)}
        >
          ${iconLabel(this.iconUrl("smoothingLinear"), this.t("paintCanvas.profileGraph.linear"))}
        </button>
        <button
          type="button"
          class="icon-button bezier"
          title=${this.t("paintCanvas.profileGraph.bezier")}
          aria-pressed=${selected?.i === Interpolation.BezierCubic ? "true" : "false"}
          ?disabled=${!selected}
          @click=${() => this.setInterpolation(Interpolation.BezierCubic)}
        >
          ${iconLabel(this.iconUrl("smoothingBezierCubic"), this.t("paintCanvas.profileGraph.bezier"))}
        </button>
      </div>`;
  }
}

defineElement("pc-profile-graph", PcProfileGraph);
