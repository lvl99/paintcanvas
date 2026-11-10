import { html, unsafeCSS, type PropertyValues } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { unionRect } from "../../../lib/brushes/StrokeEngine";
import styles from "./style.css?inline";
import { NO_TEXT_SELECTION_CSS as noTextSelection } from "../../styles";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import { isDismissingPress } from "../../dismiss";
import { DRAG_THRESHOLD } from "../../drag";
import {
  Tool,
  type default as PaintCanvas,
} from "../../../lib/classes/PaintCanvas";
import type { Insets, Point, Rect } from "../../../lib/classes/Viewport";
import { drawScene } from "../../../lib/rendering/compositing";
import { drawBrushCursor } from "../../../lib/rendering/cursor";
import {
  drawLassoPreview,
  drawMaskOutline,
} from "../../../lib/rendering/maskOutline";
import { CLOSE_DISTANCE, isNear } from "../../../lib/selection/geometry";
import { drawTransformBox } from "../../../lib/rendering/transformBox";
import {
  EYEDROPPER_CURSOR,
  FREEFORM_LASSO_CURSOR,
  POLYGON_LASSO_CURSOR,
  ROTATE_CURSOR,
} from "../../../lib/rendering/cursors";
import {
  SCALE_HANDLES,
  handleAt,
  isInsideBox,
  moveBox,
  resizeCursor,
  rotateBox,
  rotateHandle,
  scaleBox,
  type Handle,
  type TransformBox,
} from "../../../lib/transform/geometry";
import type { LassoKind } from "../../../lib/selection/Lasso";
import { zoomModifierName } from "../../../lib/classes/InputSettings";
import { touchPair, wheelAction } from "../../../lib/utils/navigation";
import GestureTracker from "../../../lib/classes/GestureTracker";
import {
  SAMPLE_PIXELS,
  SAMPLE_SCALE,
  PREVIEW_MAX_PIXELS,
} from "../../../lib/rendering/sample";
import { PASTEBOARD_COLOUR } from "../../../lib/rendering/compositing";
import { gestureAction, type TouchGesture } from "../../../lib/utils/gestures";
import type { BrushStrokePoint } from "../../../lib/brushes/types";
import { snapToPixelGrid } from "../../../lib/brushes/params";
import type BrushSettings from "../../../lib/classes/BrushSettings";

/** Toolbar width in CSS pixels (kept clear when fitting the canvas) */
export const TOOLBAR_WIDTH = 50;

/** Share of the screen width taken by the chat panel (kept clear when fitting the canvas) */
export const CHAT_WIDTH_RATIO = 0.375;

/** Lasso kind for each lasso tool */
export const LASSO_TOOLS: Partial<Record<Tool, LassoKind>> = {
  [Tool.RectangleLasso]: "rectangle",
  [Tool.CircleLasso]: "circle",
  [Tool.PolygonLasso]: "polygon",
  [Tool.FreeformLasso]: "freeform",
};

/** Distance (CSS pixels) within which a transform handle can be grabbed */
export const HANDLE_GRAB_DISTANCE = 8;

/** Milliseconds between steps of the crawling ants animation */
export const ANTS_INTERVAL = 100;

/** In focus pen mode, how long after a pen lifts touches are still ignored (milliseconds) */
export const PEN_LIFT_GRACE_MS = 500;

/** The most device pixels per CSS pixel the canvases on screen use (see `PcCanvas.pixelRatio`) */
export const MAX_PIXEL_RATIO = 2;

/**
 * Space covered by the toolbar and chat on a screen of the given width.
 *
 * @example
 * interfaceInsets(1000, true); // { top: 0, right: 375, bottom: 0, left: 50 }
 */
export const interfaceInsets = (
  width: number,
  interfaceVisible: boolean,
): Insets =>
  interfaceVisible
    ? {
        top: 0,
        right: width * CHAT_WIDTH_RATIO,
        bottom: 0,
        left: TOOLBAR_WIDTH,
      }
    : { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * CSS cursor for a tool. The brush and eraser hide the cursor because their outline is drawn on the canvas; rectangle and circle lassos
 * use the "+" crosshair; zoom uses the magnifier with "+" or "-".
 *
 * @example
 * cursorFor(Tool.Zoom, { dragging: false, altKey: true }); // "zoom-out"
 */
/** How far above a finger the sampling window sits, so the finger doesn't cover it (screen pixels) */
export const TOUCH_SAMPLER_GAP = 40;

/** The sampling window's size: the colour on top of the enlarged pixels (screen pixels) */
export const SAMPLER_WIDTH = SAMPLE_PIXELS * SAMPLE_SCALE;
export const SAMPLER_HEIGHT = SAMPLER_WIDTH * 2;

/**
 * Where the colour sample tool's window goes (its top left, in screen pixels): with a mouse or pen, so the outlined
 * pixel in its enlarged view is on the pointer (which is hidden); with touch, centred above the finger. Kept on screen.
 *
 * @example
 * samplerPosition({ x: 100, y: 200 }, false, 1000, 800); // { x: 72.5, y: 122.5 }
 */
export const samplerPosition = (
  point: Point,
  touch: boolean,
  width: number,
  height: number,
): Point => {
  // The outlined pixel's centre, from the window's top left
  const pixelCentre = (SAMPLE_PIXELS / 2 + 0.5) * SAMPLE_SCALE;
  const x = point.x - (touch ? SAMPLER_WIDTH / 2 : pixelCentre);
  const y = touch
    ? point.y - TOUCH_SAMPLER_GAP - SAMPLER_HEIGHT
    : point.y - SAMPLER_WIDTH - pixelCentre;
  return {
    x: Math.min(Math.max(0, x), width - SAMPLER_WIDTH),
    y: Math.min(Math.max(0, y), height - SAMPLER_HEIGHT),
  };
};

export const cursorFor = (
  tool: Tool,
  { dragging, altKey }: { dragging: boolean; altKey: boolean },
): string => {
  switch (tool) {
    case Tool.Pan:
      return dragging ? "grabbing" : "grab";
    case Tool.Zoom:
      return altKey ? "zoom-out" : "zoom-in";
    case Tool.Brush:
    case Tool.Eraser:
      return "none";
    case Tool.Move:
      return "move";
    case Tool.PolygonLasso:
      return POLYGON_LASSO_CURSOR;
    case Tool.FreeformLasso:
      return FREEFORM_LASSO_CURSOR;
    case Tool.ColourSample:
      return EYEDROPPER_CURSOR;
    default:
      return "crosshair";
  }
};

/**
 * The drawing area: a full-size canvas showing the composited layers through the viewport.
 *
 * Handles drawing with the brush and eraser (mouse, pen with pressure and tilt, or touch), and navigation: dragging with the pan tool (or while Space is held, or with the middle mouse button), clicking with the zoom tool (Alt to zoom out), scrolling or two-finger dragging to pan, and pinching or Cmd/Ctrl + scrolling to zoom (each as the user's settings allow).
 * Taps and swipes with two or three fingers undo, redo, copy or paste, as the user's touch gesture settings say (see
 * `GestureTracker`); two-finger pan and pinch wait until a finger moves further than a tap allows.
 * In focus pen mode (a user setting), one finger does nothing (only pens draw), and touches are ignored altogether while
 * a pen is down or for `PEN_LIFT_GRACE_MS` after it lifts, so a resting hand can't draw, pan or undo.
 * The Move tool shows the transform box: drag inside it to move, a square handle to scale, or the round handle to rotate.
 * The colour sample tool sets the current colour from what's shown under the pointer, or the average of a dragged area,
 * showing a sampling window while sampling (see `drawSampler`).
 * Lasso tools build mask shapes (see `Lasso`); the mask's outline is drawn as animated black and white "crawling ants".
 * The mask outline and lasso shape are drawn on their own canvas; the brush cursor on an overlay that inverts what is underneath.
 * Redraws at most once per animation frame, only when something changed. The first time it has a size, it fits the canvas beside the toolbar and chat.
 *
 * @example
 * html`<pc-canvas .app=${app}></pc-canvas>`
 */
export class PcCanvas extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    insets: { attribute: false },
  };

  static override styles = [
    PcElement.styles,
    unsafeCSS(noTextSelection),
    unsafeCSS(styles),
  ];

  declare app?: PaintCanvas;

  /**
   * Space covered by the interface on each side (CSS pixels), kept clear when fitting or centring the canvas. Without
   * it, a toolbar on the left and (with the interface shown) a panel taking 37.5% on the right are assumed.
   */
  declare insets?: Insets;

  /** The insets in effect (see `insets`) */
  private get activeInsets(): Insets {
    const app = this.app as PaintCanvas;
    return (
      this.insets ?? interfaceInsets(app.viewport.width, app.interfaceVisible)
    );
  }

  /**
   * Device pixels per CSS pixel for the canvases on screen, at most `MAX_PIXEL_RATIO`: phones with 3 have 2.25 times
   * the pixels to draw and put on screen for little visible difference (replaceable for tests).
   */
  pixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

  // Redraw when the app, layers, view, stroke in progress, a loaded brush shape or the brush or eraser settings change
  // (so the brush cursor outline follows a new size or preset without the pointer moving)
  private changes = new ChangeController(
    this,
    () => [
      this.app,
      this.app?.brush,
      this.app?.eraser,
      this.app?.layers,
      this.app?.external,
      this.app?.viewport,
      this.app?.strokes,
      this.app?.tips,
      this.app?.selection,
      this.app?.lasso,
      this.app?.transform,
    ],
    (target) => this.sceneChanged(target),
  );

  /** Whether anything but the stroke in progress changed since the last update (so everything is redrawn) */
  private fullChange = false;

  /** The area the stroke in progress changed since the last update */
  private strokeArea?: Rect;

  /** Whether a finished stroke is being written into its layer (its layer change needs no redraw) */
  private committing = false;

  /** Whether the next frame redraws everything */
  private drawAll = false;

  /** The area the next frame redraws, if not everything */
  private drawArea?: Rect;

  /**
   * Transform drag in progress: what is being changed, the box and pointer when it started, the pointer now, and (when
   * scaling) whether "Constrain proportions" was on when it started
   */
  private transformDrag: {
    pointerId: number;
    kind: "move" | "scale" | "rotate";
    handle?: Handle;
    startBox: TransformBox;
    startPoint: Point;
    point: Point;
    constrain: boolean;
  } | null = null;

  /** Crawling ants animation timer while a mask is active */
  private antsTimer?: ReturnType<typeof setInterval>;

  /** Current crawling ants dash offset */
  private antsOffset = 0;

  /** Viewport that has been fitted once (so resizing doesn't refit) */
  private fittedViewport?: object;

  /** The screen canvas whose 2D context has been made (see `prepareScene`) */
  private preparedCanvas?: HTMLCanvasElement;

  private frame = 0;

  /** Animation frame drawing only the brush cursor, if requested */
  private overlayFrame = 0;

  private resizeObserver?: ResizeObserver;

  private drag: { pointerId: number; last: Point } | null = null;

  /** Pointer drawing the current stroke, and the layer it draws on */
  private stroke: { pointerId: number; layerId: string } | null = null;

  /** A press that closed a panel or menu, held until it moves far enough to count (see `onPointerDown`) */
  private heldPress: PointerEvent | null = null;

  /** Pointer position over the stage (for the brush cursor), or null when outside */
  private hover: Point | null = null;

  /** Name of the key held to zoom with the scroll wheel (replaceable for tests) */
  modifier = zoomModifierName();

  /** Touches on the stage by pointer ID, for two-finger pan and pinch */
  private readonly touches = new Map<number, Point>();

  /** The two-finger gesture in progress: where its touches' midpoint and spread were last */
  private pinch: { mid: Point; distance: number } | null = null;

  /**
   * A colour sample in progress: the pointer, whether it's a finger, where it started and is now (canvas pixels), and
   * where it is on screen
   */
  private sampling: {
    pointerId: number;
    touch: boolean;
    start: Point;
    point: Point;
    screen: Point;
  } | null = null;

  /** Recognises taps and swipes with two or three fingers, for the actions in the user's touch gesture settings */
  private readonly gestureTracker = new GestureTracker();

  /** Pens touching the stage, by pointer ID */
  private readonly pens = new Set<number>();

  /** When a pen last lifted (event time) */
  private penLiftedAt = -Infinity;

  /** Touches ignored altogether in focus pen mode (they touched while a pen was down or had just lifted) */
  private readonly ignoredTouches = new Set<number>();

  /** Touches that can only pan, pinch and make gestures in focus pen mode (one finger does nothing) */
  private readonly navigationTouches = new Set<number>();

  /** Zoom when a Safari trackpad pinch started */
  private gestureZoom = 1;

  private altKey = false;

  private readonly onModifierKey = (event: KeyboardEvent) => {
    if (event.altKey !== this.altKey) {
      this.altKey = event.altKey;
      this.updateCursor();
    }
    // Pressing or releasing Shift or Alt while scaling changes "Constrain proportions" straight away
    if (this.transformDrag?.kind === "scale") this.applyTransformDrag(event);
  };

  /** The screen canvas */
  get canvas(): HTMLCanvasElement | null {
    return this.renderRoot.querySelector("canvas.scene");
  }

  /** The canvas for the colour sample tool's window and area */
  get sampler(): HTMLCanvasElement | null {
    return this.renderRoot.querySelector("canvas.sampler");
  }

  /** The overlay canvas for the brush cursor */
  get overlay(): HTMLCanvasElement | null {
    return this.renderRoot.querySelector("canvas.overlay");
  }

  /** The canvas for the mask outline and lasso shape (no blend mode: drawn in black and white) */
  get outlines(): HTMLCanvasElement | null {
    return this.renderRoot.querySelector("canvas.outlines");
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onModifierKey);
    window.addEventListener("keyup", this.onModifierKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onModifierKey);
    window.removeEventListener("keyup", this.onModifierKey);
    this.resizeObserver?.disconnect();
    this.animateAnts(false);
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.overlayFrame);
    this.overlayFrame = 0;
    this.frame = 0;
  }

  override firstUpdated(): void {
    this.prepareScene();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(this);
    }
    this.syncSize();
  }

  /**
   * Make a new screen canvas's 2D context where the app's canvases draw (see `PaintCanvas.rendering`). Drawn from layers
   * kept in regular memory (`cpu`), keeping the screen canvas there too means each frame copies only the area that
   * changed, instead of sending whole layers to the GPU. The first context decides that; later `getContext("2d")` calls
   * get this one, so the screen canvas is made again when the app's rendering differs (see `render`).
   */
  private prepareScene(): void {
    const canvas = this.canvas;
    if (!canvas || canvas === this.preparedCanvas) return;
    this.preparedCanvas = canvas;
    canvas.getContext("2d", {
      willReadFrequently: this.app?.rendering !== "gpu",
    });
  }

  /**
   * Note what changed: the stroke in progress (and the area it changed), or anything else.
   */
  private sceneChanged(target: EventTarget): void {
    const app = this.app;
    if (target === app?.strokes) {
      const area = app.strokes.takeChangedArea();
      if (area) this.strokeArea = unionRect(this.strokeArea, area);
      else this.fullChange = true;
    } else if (!(this.committing && target === app?.layers))
      this.fullChange = true;
  }

  override updated(changed: PropertyValues): void {
    this.prepareScene();
    // Any app, layer or viewport change re-renders this component; redraw the canvas too. When only the stroke in
    // progress changed, redraw just the area it changed (much quicker with many layers)
    const resized = this.syncSize();
    const onlyStroke = changed.size === 0 && !this.fullChange && !resized;
    this.requestDraw(onlyStroke ? this.strokeArea : undefined);
    this.fullChange = false;
    this.strokeArea = undefined;
    this.updateCursor();
    this.animateAnts(this.app?.selection.active ?? false);
  }

  /**
   * Match the canvas's pixel size to its on-screen size and pixel ratio, and update the viewport. Fits the canvas the
   * first time. Returns whether the canvas was resized (which clears it).
   */
  syncSize(): boolean {
    const app = this.app;
    const canvas = this.canvas;
    if (!app || !canvas) return false;
    let resized = false;
    const width = this.clientWidth;
    const height = this.clientHeight;
    const ratio = this.pixelRatio();
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    for (const target of [canvas, this.outlines, this.overlay, this.sampler]) {
      if (
        target &&
        (target.width !== pixelWidth || target.height !== pixelHeight)
      ) {
        target.width = pixelWidth;
        target.height = pixelHeight;
        resized = true;
      }
    }
    const view = app.viewport;
    if (view.width !== width || view.height !== height) {
      // Keep the same part of the canvas in the middle (e.g. as panels around it take or give back space)
      const dx = (width - view.width) / 2;
      const dy = (height - view.height) / 2;
      view.resize(width, height);
      if (this.fittedViewport === view) view.panBy(dx, dy);
    }
    if (this.fittedViewport !== view && width > 0 && height > 0) {
      this.fittedViewport = view;
      view.fit(this.activeInsets);
    }
    return resized;
  }

  /**
   * Schedule a redraw of everything, or of an area of the canvas, on the next animation frame (repeated requests are
   * combined; redrawing everything wins).
   */
  requestDraw(area?: Rect): void {
    if (area) this.drawArea = unionRect(this.drawArea, area);
    else this.drawAll = true;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const drawArea = this.drawAll ? undefined : this.drawArea;
      this.drawAll = false;
      this.drawArea = undefined;
      this.draw(drawArea);
    });
  }

  /**
   * Draw the scene now (with the stroke in progress, if any), or only an area of the canvas, then the brush cursor.
   */
  draw(area?: Rect): void {
    // The cursor is drawn here too: a cursor-only frame waiting to run isn't needed
    cancelAnimationFrame(this.overlayFrame);
    this.overlayFrame = 0;
    const app = this.app;
    const ctx = this.canvas?.getContext("2d");
    if (app && ctx) {
      const start = app.strokeLog.now();
      drawScene(
        ctx,
        app.drawables,
        app.viewport,
        this.pixelRatio(),
        app.transform.preview ?? app.strokes.preview,
        area,
      );
      app.strokeLog.frame(app.strokeLog.now() - start);
    }
    this.drawOverlay();
  }

  /**
   * Schedule drawing the brush cursor on the next animation frame (repeated requests are combined, and a scene redraw
   * draws it too).
   */
  requestOverlay(): void {
    if (this.overlayFrame || this.frame) return;
    this.overlayFrame = requestAnimationFrame(() => {
      this.overlayFrame = 0;
      // A redraw due in this frame draws the cursor too
      if (!this.frame) this.drawOverlay();
    });
  }

  /**
   * Draw the brush cursor on the overlay: a 1:1 outline of the brush or eraser shape at the pointer. For presets that
   * snap to the pixel grid, the outline covers the pixels the stamp will.
   */
  drawOverlay(): void {
    const app = this.app;
    const overlay = this.overlay;
    const ctx = overlay?.getContext("2d");
    if (!app || !overlay || !ctx) return;
    app.strokeLog.overlay();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    this.drawOutlines();
    this.drawSampler();
    if (app.strokes.debugEnabled) this.drawDebugTrace(ctx);
    const settings = this.brushSettings();
    if (!settings || !this.hover || this.drag) return;
    const { viewport } = app;
    let { x, y } = this.hover;
    let { width, height } = settings;
    if (settings.preset.snapToPixelGrid) {
      const point = viewport.screenToCanvas(this.hover);
      const area = snapToPixelGrid(point.x, point.y, width, height);
      ({ x, y } = viewport.canvasToScreen(area));
      ({ width, height } = area);
    }
    drawBrushCursor(
      ctx,
      app.tips.get(settings.preset),
      x,
      y,
      width * viewport.zoom,
      height * viewport.zoom,
      settings.preset.rotation ?? 0,
      this.pixelRatio(),
    );
  }

  /**
   * Draw the mask outline (crawling ants) and the lasso shape in progress in black and white on their own canvas.
   */
  private drawOutlines(): void {
    const app = this.app as PaintCanvas;
    const outlines = this.outlines;
    const ctx = outlines?.getContext("2d");
    if (!outlines || !ctx) return;
    ctx.clearRect(0, 0, outlines.width, outlines.height);
    const ratio = this.pixelRatio();
    if (app.selection.active && !app.transform.pending) {
      drawMaskOutline(
        ctx,
        app.selection.outline,
        app.viewport,
        ratio,
        this.antsOffset,
      );
    }
    const lassoShape = app.lasso.preview;
    if (lassoShape)
      drawLassoPreview(ctx, lassoShape, app.lasso.nodes, app.viewport, ratio);
    const handles = this.transformHandles();
    if (handles && app.transform.box)
      drawTransformBox(ctx, app.transform.box, handles, app.viewport, ratio);
  }

  /**
   * The square handles of the transform box (the 8 scale handles) while the Move tool is in use, or none.
   */
  private transformHandles(): readonly Handle[] | undefined {
    return this.app?.activeTool === Tool.Move ? SCALE_HANDLES : undefined;
  }

  /**
   * What the pointer is over in the transform box: the rotate handle, a scale handle, inside the box, or none of them.
   */
  private transformPart(
    box: TransformBox,
    screen: Point,
  ):
    | { kind: "rotate" }
    | { kind: "scale"; handle: Handle }
    | { kind: "move" }
    | undefined {
    const view = (this.app as PaintCanvas).viewport;
    const toScreen = (p: Point) => view.canvasToScreen(p);
    if (
      isNear(rotateHandle(box, toScreen).handle, screen, HANDLE_GRAB_DISTANCE)
    )
      return { kind: "rotate" };
    const handle = handleAt(
      box,
      SCALE_HANDLES,
      screen,
      HANDLE_GRAB_DISTANCE,
      toScreen,
    );
    if (handle) return { kind: "scale", handle };
    return isInsideBox(box, view.screenToCanvas(screen))
      ? { kind: "move" }
      : undefined;
  }

  /**
   * Start rotating, scaling or moving the transform box, depending on where the pointer is: on the round handle, a
   * square handle, or anywhere else (moving).
   */
  private beginTransformDrag(event: PointerEvent): void {
    const app = this.app as PaintCanvas;
    const box = app.transform.box;
    if (!box) return;
    const screen = this.pointerPoint(event);
    const part = this.transformPart(box, screen) ?? { kind: "move" };
    this.transformDrag = {
      pointerId: event.pointerId,
      kind: part.kind,
      handle: part.kind === "scale" ? part.handle : undefined,
      startBox: box,
      startPoint: app.viewport.screenToCanvas(screen),
      point: app.viewport.screenToCanvas(screen),
      constrain: app.constrainProportions,
    };
    this.capturePointer(event.pointerId);
  }

  /**
   * Update the transform box while dragging.
   */
  private continueTransformDrag(event: PointerEvent): void {
    const app = this.app as PaintCanvas;
    const drag = this.transformDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.point = app.viewport.screenToCanvas(this.pointerPoint(event));
    this.applyTransformDrag(event);
  }

  /**
   * Change the transform box for the drag in progress, with the modifier keys held now. While scaling, "Constrain
   * proportions" is turned on while Shift is held (if it was off when the drag started), or off while Alt is held (if
   * it was on), and shows so in the settings bar.
   */
  private applyTransformDrag({
    shiftKey,
    altKey,
  }: Pick<MouseEvent, "shiftKey" | "altKey">): void {
    const app = this.app as PaintCanvas;
    const { kind, handle, startBox, startPoint, point, constrain } = this
      .transformDrag as NonNullable<PcCanvas["transformDrag"]>;
    let box: TransformBox;
    if (kind === "scale") {
      const proportional = constrain ? !altKey : shiftKey;
      if (app.constrainProportions !== proportional)
        app.setConstrainProportions(proportional);
      box = scaleBox(
        startBox,
        handle as Handle,
        point,
        proportional,
        app.transform.aspect,
      );
    } else if (kind === "rotate")
      box = rotateBox(startBox, startPoint, point, shiftKey);
    else
      box = moveBox(
        startBox,
        point.x - startPoint.x,
        point.y - startPoint.y,
        shiftKey,
      );
    app.transform.setBox(box);
  }

  /**
   * End the transform drag of a pointer, if it has one: "Constrain proportions" goes back to how it was when a scale
   * drag started.
   */
  private endTransformDrag(pointerId: number): void {
    const drag = this.transformDrag;
    if (drag?.pointerId !== pointerId) return;
    this.transformDrag = null;
    const app = this.app as PaintCanvas;
    if (drag.kind === "scale" && app.constrainProportions !== drag.constrain)
      app.setConstrainProportions(drag.constrain);
  }

  /**
   * Cursor while hovering with the Move tool: the grab cursor over the rotate handle, a two-way arrow along a scale
   * handle's direction (turned with the box), four-way arrows inside the box, and the default cursor elsewhere.
   */
  private transformCursor(screen: Point): string | undefined {
    const app = this.app as PaintCanvas;
    const box = app.transform.box;
    if (app.activeTool !== Tool.Move || !box) return undefined;
    const part = this.transformPart(box, screen);
    if (part?.kind === "rotate") return ROTATE_CURSOR;
    if (part?.kind === "scale") return resizeCursor(part.handle, box.rotation);
    return part ? "move" : "default";
  }

  /**
   * Start or stop the crawling ants animation.
   */
  private animateAnts(run: boolean): void {
    if (run && !this.antsTimer) {
      this.antsTimer = setInterval(() => {
        this.antsOffset = (this.antsOffset + 1) % 1000;
        this.drawOverlay();
      }, ANTS_INTERVAL);
    } else if (!run && this.antsTimer) {
      clearInterval(this.antsTimer);
      this.antsTimer = undefined;
    }
  }

  /**
   * Handle a lasso tool press: start a shape, add a polygon node, or close a polygon on its first node.
   */
  private lassoDown(event: PointerEvent, kind: LassoKind): void {
    const app = this.app as PaintCanvas;
    const point = this.pointerPoint(event);
    const first = app.lasso.nodes[0];
    const nearFirstNode =
      first !== undefined &&
      isNear(app.viewport.canvasToScreen(first), point, CLOSE_DISTANCE);
    if (kind !== "polygon") this.capturePointer(event.pointerId);
    app.applyLasso(
      app.lasso.down(
        kind,
        app.viewport.screenToCanvas(point),
        event,
        nearFirstNode,
      ),
    );
  }

  /**
   * Draw the last stroke's recorded points (circles) and stamp positions (dots) for tuning how brushes feel.
   */
  private drawDebugTrace(ctx: CanvasRenderingContext2D): void {
    const app = this.app as PaintCanvas;
    const ratio = this.pixelRatio();
    const { points, stamps } = app.strokes.debugTrace;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = ratio;
    for (const stamp of stamps) {
      const { x, y } = app.viewport.canvasToScreen(stamp);
      ctx.fillRect(x * ratio - ratio, y * ratio - ratio, ratio * 2, ratio * 2);
    }
    ctx.beginPath();
    for (const point of points) {
      const { x, y } = app.viewport.canvasToScreen(point);
      ctx.moveTo(x * ratio + 5 * ratio, y * ratio);
      ctx.arc(x * ratio, y * ratio, 5 * ratio, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The brush or eraser settings for the tool in use, if it draws.
   */
  private brushSettings() {
    const app = this.app;
    if (app?.activeTool === Tool.Brush) return app.brush;
    if (app?.activeTool === Tool.Eraser) return app.eraser;
    return undefined;
  }

  /**
   * Convert a pointer event to a stroke point in canvas pixels, with pen pressure and tilt.
   */
  private strokePoint(event: PointerEvent): BrushStrokePoint {
    const app = this.app as PaintCanvas;
    const point: BrushStrokePoint = app.viewport.screenToCanvas(
      this.pointerPoint(event),
    );
    if (event.pointerType === "pen") {
      point.pressure = event.pressure;
      point.tiltX = event.tiltX;
      point.tiltY = event.tiltY;
    }
    return point;
  }

  /**
   * Start a brush or eraser stroke on the active layer (cancelling any other stroke in progress), logging how long it
   * took. Hidden layers cannot be drawn on.
   */
  private beginStroke(event: PointerEvent, settings: BrushSettings): void {
    const app = this.app as PaintCanvas;
    const layer = app.layers.active;
    if (!layer.visible) {
      app.strokeLog.ignore(event.pointerType, "the layer is hidden");
      return;
    }
    if (this.stroke)
      app.strokeLog.cancel(`a ${event.pointerType} started another stroke`);
    const start = app.strokeLog.now();
    this.stroke = { pointerId: event.pointerId, layerId: layer.id };
    this.capturePointer(event.pointerId);
    const erasing = app.activeTool === Tool.Eraser;
    app.strokes.begin(
      {
        layer,
        mode: erasing ? "erase" : "paint",
        preset: settings.preset,
        size: { width: settings.width, height: settings.height },
        colour: app.colours[erasing ? "background" : "foreground"],
        tip: app.tips.get(settings.preset),
        isPen: event.pointerType === "pen",
        mask: app.selection.mask,
      },
      this.strokePoint(event),
      event.timeStamp,
    );
    app.strokeLog.begin(
      event.pointerType,
      event.timeStamp,
      app.strokeLog.now() - start,
      {
        layers: app.drawables.filter((l) => l.visible && l.opacity > 0).length,
        zoomPct: app.viewport.zoom * 100,
      },
    );
  }

  /**
   * Get a pointer's position relative to the stage.
   */
  private pointerPoint(event: Pick<MouseEvent, "clientX" | "clientY">): Point {
    const rect = this.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /**
   * Send a pointer's events to the canvas until it's lifted, even outside it.
   */
  private capturePointer(pointerId: number): void {
    this.renderRoot
      .querySelector("canvas.scene")
      ?.setPointerCapture?.(pointerId);
  }

  /**
   * Handle a press, unless it closed a panel or menu (see `isDismissingPress`): that press is held, and only starts
   * drawing (or whatever the tool does) once it moves `DRAG_THRESHOLD` pixels, so tapping the canvas to close a panel
   * leaves no mark.
   */
  private onPointerDown(event: PointerEvent): void {
    if (!this.app) return;
    if (!isDismissingPress(event)) {
      this.pointerDown(event);
      return;
    }
    this.heldPress = event;
    this.capturePointer(event.pointerId);
  }

  /**
   * Start a held press (see `onPointerDown`) once it moves far enough. Returns whether the pointer is still held.
   */
  private releaseHeldPress(event: PointerEvent): boolean {
    const held = this.heldPress;
    if (held?.pointerId !== event.pointerId) return false;
    const moved = Math.hypot(
      event.clientX - held.clientX,
      event.clientY - held.clientY,
    );
    if (moved < DRAG_THRESHOLD) return true;
    this.heldPress = null;
    this.pointerDown(held);
    return false;
  }

  /**
   * Start panning, or zoom, depending on the tool and button. In focus pen mode, touches only pan, pinch and make
   * gestures, and are ignored while a pen is down or just lifted (see `focusPenTouch`).
   */
  private pointerDown(event: PointerEvent): void {
    const app = this.app as PaintCanvas;
    if (event.pointerType === "pen") this.penDown(event);
    if (event.pointerType === "touch") {
      const ignored = this.focusPenTouch(event);
      if (ignored) {
        app.strokeLog.ignore("touch", `focus pen mode: ${ignored}`);
        return;
      }
      if (this.touchDown(event)) {
        if (this.brushSettings())
          app.strokeLog.ignore(
            "touch",
            `part of a ${this.touches.size}-finger gesture`,
          );
        return;
      }
      if (app.input.data.focusPen) {
        this.navigationTouches.add(event.pointerId);
        app.strokeLog.ignore("touch", "focus pen mode: one finger");
        return;
      }
    }
    const point = this.pointerPoint(event);
    const middleButton = event.button === 1;
    const settings = this.brushSettings();
    if (settings && event.button > 1)
      app.strokeLog.ignore(event.pointerType, `button ${event.button}`);
    const lassoKind = LASSO_TOOLS[app.activeTool];
    if (settings && event.button === 0) {
      this.beginStroke(event, settings);
    } else if (lassoKind && event.button === 0) {
      this.lassoDown(event, lassoKind);
    } else if (this.transformHandles() && event.button === 0) {
      this.beginTransformDrag(event);
    } else if (app.activeTool === Tool.ColourSample && event.button === 0) {
      this.beginSample(event);
    } else if (app.activeTool === Tool.Pan || middleButton) {
      event.preventDefault();
      this.drag = { pointerId: event.pointerId, last: point };
      this.capturePointer(event.pointerId);
      this.updateCursor();
    } else if (app.activeTool === Tool.Zoom && event.button === 0) {
      if (event.altKey) app.viewport.zoomOut(point);
      else app.viewport.zoomIn(point);
    }
  }

  /**
   * Continue a stroke (using every in-between event the browser recorded), pan while dragging, and move the brush cursor.
   */
  private onPointerMove(event: PointerEvent): void {
    const app = this.app;
    if (!app || this.ignoredTouches.has(event.pointerId)) return;
    if (this.releaseHeldPress(event)) return;
    const point = this.pointerPoint(event);
    if (this.touches.has(event.pointerId)) {
      this.touches.set(event.pointerId, point);
      this.gestureTracker.move(event.pointerId, point);
      if (this.pinch) {
        // Wait until a finger moves further than a tap allows, so tapping doesn't nudge the view
        if (this.gestureTracker.dragging) this.movePinch();
        return;
      }
      if (this.navigationTouches.has(event.pointerId)) return;
    }
    this.hover = point;
    this.reportPointer(point);
    if (app.lasso.active)
      app.lasso.move(app.viewport.screenToCanvas(point), event);
    if (this.sampling?.pointerId === event.pointerId) {
      this.sampling.point = app.viewport.screenToCanvas(point);
      this.sampling.screen = point;
    }
    if (this.transformDrag) this.continueTransformDrag(event);
    else {
      const cursor = this.transformCursor(point);
      if (cursor) this.style.cursor = cursor;
    }
    if (this.stroke?.pointerId === event.pointerId) {
      const start = app.strokeLog.now();
      const events = event.getCoalescedEvents?.() ?? [];
      for (const each of events.length > 0 ? events : [event]) {
        app.strokes.move(this.strokePoint(each), each.timeStamp);
      }
      app.strokeLog.move(event.timeStamp, app.strokeLog.now() - start);
    }
    if (this.drag?.pointerId === event.pointerId) {
      app.viewport.panBy(
        point.x - this.drag.last.x,
        point.y - this.drag.last.y,
      );
      this.drag.last = point;
    }
    // Pens send many more moves than the screen shows: draw the cursor once per frame
    this.requestOverlay();
  }

  /**
   * Forget a held press lifted (or cancelled) before it moved far enough. Returns whether it was one.
   */
  private dropHeldPress(event: PointerEvent): boolean {
    if (this.heldPress?.pointerId !== event.pointerId) return false;
    this.heldPress = null;
    return true;
  }

  /**
   * Finish a stroke (writing it into the layer) or stop panning.
   */
  private onPointerUp(event: PointerEvent): void {
    if (
      this.ignoredTouches.delete(event.pointerId) ||
      this.dropHeldPress(event)
    )
      return;
    this.penUp(event);
    this.touchUp(event);
    if (this.sampling?.pointerId === event.pointerId) this.finishSample();
    if (event.pointerType === "touch") {
      const gesture = this.gestureTracker.up(event.pointerId, event.timeStamp);
      if (gesture) this.runGesture(gesture);
    }
    if (this.navigationTouches.delete(event.pointerId)) return;
    const app = this.app;
    this.endTransformDrag(event.pointerId);
    if (app?.lasso.active) {
      app.applyLasso(
        app.lasso.up(
          app.viewport.screenToCanvas(this.pointerPoint(event)),
          event,
        ),
      );
    }
    if (app && this.stroke?.pointerId === event.pointerId) {
      const { layerId } = this.stroke;
      const start = app.strokeLog.now();
      this.stroke = null;
      app.strokes.end(this.strokePoint(event), event.timeStamp);
      // The screen already shows the stroke: only the area it changed needs drawing again
      this.committing = true;
      app.layers.markChanged(layerId);
      this.committing = false;
      app.strokeLog.end(event.timeStamp, app.strokeLog.now() - start);
    }
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = null;
    this.updateCursor();
  }

  /**
   * Abandon a stroke or pan when the browser cancels the pointer (e.g. a system gesture).
   */
  private onPointerCancel(event: PointerEvent): void {
    if (
      this.ignoredTouches.delete(event.pointerId) ||
      this.dropHeldPress(event)
    )
      return;
    this.navigationTouches.delete(event.pointerId);
    this.penUp(event);
    this.touchUp(event);
    this.gestureTracker.cancel(event.pointerId);
    if (this.sampling?.pointerId === event.pointerId) this.endSample();
    this.endTransformDrag(event.pointerId);
    if (this.stroke?.pointerId === event.pointerId) {
      this.stroke = null;
      this.app?.strokeLog.cancel("the browser cancelled the pointer");
      this.app?.strokes.cancel();
    }
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = null;
    this.updateCursor();
  }

  /**
   * Keep the browser from handling touches on the canvas itself while the brush or eraser is in use (e.g. Safari on
   * iPad holding back quick Apple Pencil strokes while it checks for its own gestures). Other tools keep the browser's
   * handling, so a double tap still closes a polygon lasso. Pointer events are unaffected.
   */
  private readonly onTouchStart = {
    handleEvent: (event: TouchEvent): void => {
      if (this.brushSettings()) event.preventDefault();
    },
    passive: false,
  };

  /**
   * Note a pen touching down. In focus pen mode, touches already on the stage are ignored from now on, abandoning any
   * pan, pinch or gesture they were making (e.g. a palm resting on the screen).
   */
  private penDown(event: PointerEvent): void {
    this.pens.add(event.pointerId);
    if (!this.app?.input.data.focusPen) return;
    for (const id of this.touches.keys()) {
      this.gestureTracker.cancel(id);
      this.navigationTouches.delete(id);
      this.ignoredTouches.add(id);
    }
    this.touches.clear();
    this.pinch = null;
  }

  /** Note a pen lifting (or being cancelled), and when */
  private penUp(event: PointerEvent): void {
    if (this.pens.delete(event.pointerId)) this.penLiftedAt = event.timeStamp;
  }

  /**
   * In focus pen mode, why a touch is ignored altogether: a pen is down, or lifted less than `PEN_LIFT_GRACE_MS` ago
   * (a hand landing as the pen lifts). Undefined if the touch counts.
   */
  private focusPenTouch(event: PointerEvent): string | undefined {
    if (!this.app?.input.data.focusPen) return undefined;
    let reason: string | undefined;
    if (this.pens.size > 0) reason = "the pen is down";
    else if (event.timeStamp - this.penLiftedAt < PEN_LIFT_GRACE_MS)
      reason = "the pen just lifted";
    if (reason) this.ignoredTouches.add(event.pointerId);
    return reason;
  }

  /**
   * Note a touch. A second touch stops any stroke or pan and starts a two-finger gesture; a third stops two-finger pan
   * and pinch, for three-finger gestures. Returns whether the touch is part of a gesture (and so does nothing else).
   */
  private touchDown(event: PointerEvent): boolean {
    const point = this.pointerPoint(event);
    this.touches.set(event.pointerId, point);
    this.gestureTracker.down(event.pointerId, point, event.timeStamp);
    if (this.touches.size < 2) return false;
    if (this.touches.size > 2) this.pinch = null;
    if (this.touches.size === 2) {
      if (this.stroke) {
        this.stroke = null;
        this.app?.strokeLog.cancel("a second finger touched");
        this.app?.strokes.cancel();
      }
      if (this.sampling) this.endSample();
      this.drag = null;
      const [a, b] = [...this.touches.values()] as [Point, Point];
      this.pinch = touchPair(a, b);
      this.capturePointer(event.pointerId);
    }
    return true;
  }

  /**
   * Start sampling a colour with the colour sample tool: the pointer is hidden while the sampling window shows.
   */
  private beginSample(event: PointerEvent): void {
    const app = this.app as PaintCanvas;
    const screen = this.pointerPoint(event);
    const point = app.viewport.screenToCanvas(screen);
    this.sampling = {
      pointerId: event.pointerId,
      touch: event.pointerType === "touch",
      start: point,
      point,
      screen,
    };
    this.capturePointer(event.pointerId);
    this.updateCursor();
    this.drawOverlay();
  }

  /**
   * Set the selected colour (foreground or background) from the sample: the pixel under the pointer, or the average of every pixel in the area.
   * Nothing changes if it's outside the canvas.
   */
  private finishSample(): void {
    const app = this.app as PaintCanvas;
    const { start, point } = this.sampling as NonNullable<typeof this.sampling>;
    const colour =
      app.sampleMode === "area"
        ? app.sampleAreaColour(start, point)
        : app.sampleColour(point);
    this.endSample();
    if (colour) app.setColour(colour, app.selectedColour);
  }

  /** Stop sampling and close the sampling window */
  private endSample(): void {
    this.sampling = null;
    this.updateCursor();
    this.drawOverlay();
  }

  /**
   * Draw the colour sample tool's window while sampling (see `samplerPosition`): the sampled colour on top (the area's
   * average while dragging an area, worked out from at most `PREVIEW_MAX_PIXELS` across), and the pixels around the
   * pointer enlarged below, with the sampled pixel outlined. An area being sampled is outlined on the canvas.
   */
  private drawSampler(): void {
    const app = this.app as PaintCanvas;
    const ctx = this.sampler?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const sampling = this.sampling;
    // Hidden while not sampling, so the browser doesn't spend time putting an empty layer on screen
    (this.sampler as HTMLCanvasElement).hidden = !sampling;
    if (!sampling) return;
    const ratio = this.pixelRatio();
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    let colour: string | undefined;
    if (app.sampleMode === "area") {
      const a = app.viewport.canvasToScreen(sampling.start);
      const b = sampling.screen;
      const [x, y, w, h] = [
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y),
      ];
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#ffffff";
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = "#000000";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      colour = app.sampleAreaColour(
        sampling.start,
        sampling.point,
        PREVIEW_MAX_PIXELS,
      );
    } else {
      colour = app.sampleColour(sampling.point);
    }
    const { x, y } = samplerPosition(
      sampling.screen,
      sampling.touch,
      this.clientWidth,
      this.clientHeight,
    );
    ctx.fillStyle = colour ?? PASTEBOARD_COLOUR;
    ctx.fillRect(x, y, SAMPLER_WIDTH, SAMPLER_WIDTH);
    ctx.fillStyle = PASTEBOARD_COLOUR;
    ctx.fillRect(x, y + SAMPLER_WIDTH, SAMPLER_WIDTH, SAMPLER_WIDTH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      app.samplePixels(sampling.point),
      x,
      y + SAMPLER_WIDTH,
      SAMPLER_WIDTH,
      SAMPLER_WIDTH,
    );
    // The sampled pixel, outlined in black and white
    const pixel = (SAMPLE_PIXELS / 2) * SAMPLE_SCALE;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(
      x + pixel - 0.5,
      y + SAMPLER_WIDTH + pixel - 0.5,
      SAMPLE_SCALE + 1,
      SAMPLE_SCALE + 1,
    );
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(
      x + pixel - 1.5,
      y + SAMPLER_WIDTH + pixel - 1.5,
      SAMPLE_SCALE + 3,
      SAMPLE_SCALE + 3,
    );
    // The window's edge
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(x - 0.5, y - 0.5, SAMPLER_WIDTH + 1, SAMPLER_HEIGHT + 1);
    ctx.restore();
  }

  /**
   * Do what the user's touch gesture settings say a gesture does: undo, redo, copy or paste.
   */
  private runGesture(gesture: TouchGesture): void {
    const app = this.app as PaintCanvas;
    const action = gestureAction(app.input.data.gestures, gesture);
    if (action) app.strokeLog.gesture(gesture, action);
    if (action === "undo") app.undo();
    else if (action === "redo") app.redo();
    else if (action === "copy") app.copy();
    else if (action === "paste") app.paste();
  }

  /**
   * Pan by how far the two touches' midpoint moved and zoom by how much their spread changed, around the midpoint.
   */
  private movePinch(): void {
    const app = this.app as PaintCanvas;
    const pinch = this.pinch as { mid: Point; distance: number };
    const [a, b] = [...this.touches.values()] as [Point, Point];
    const next = touchPair(a, b);
    const { scrollPan, pinchZoom } = app.input.data;
    if (scrollPan)
      app.viewport.panBy(next.mid.x - pinch.mid.x, next.mid.y - pinch.mid.y);
    if (pinchZoom && pinch.distance > 0)
      app.viewport.zoomAt(
        next.mid,
        (app.viewport.zoom * next.distance) / pinch.distance,
      );
    this.pinch = next;
  }

  /**
   * Forget a lifted touch; the gesture ends once fewer than two touches are left.
   */
  private touchUp(event: PointerEvent): void {
    this.touches.delete(event.pointerId);
    if (this.touches.size < 2) this.pinch = null;
  }

  /**
   * Pan with the wheel or two-finger scroll, and zoom around the pointer with a pinch or Cmd/Ctrl + scroll (see
   * `wheelAction`). The page itself never scrolls or zooms.
   */
  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const app = this.app;
    if (!app) return;
    const action = wheelAction(event, app.input.data, this.modifier);
    if (action?.kind === "pan") app.viewport.panBy(action.dx, action.dy);
    else if (action?.kind === "zoom")
      app.viewport.zoomAt(
        this.pointerPoint(event),
        app.viewport.zoom * action.factor,
      );
  }

  /**
   * Start a Safari trackpad pinch (Safari reports these as gesture events, not Ctrl + wheel). Touch screens use the
   * pointer events instead.
   */
  private onGestureStart(event: Event): void {
    event.preventDefault();
    this.gestureZoom = this.app?.viewport.zoom ?? 1;
  }

  /**
   * Zoom with a Safari trackpad pinch, around the pointer.
   */
  private onGestureChange(event: Event): void {
    event.preventDefault();
    const app = this.app;
    if (!app || this.touches.size > 0 || !app.input.data.pinchZoom) return;
    const gesture = event as Event &
      Pick<MouseEvent, "clientX" | "clientY"> & { scale: number };
    app.viewport.zoomAt(
      this.pointerPoint(gesture),
      this.gestureZoom * gesture.scale,
    );
  }

  /**
   * Hide the brush cursor (and the user's shared cursor) when the pointer leaves the stage.
   */
  private onPointerLeave(): void {
    this.hover = null;
    this.app?.setPointer(undefined);
    this.drawOverlay();
  }

  /**
   * Tell the app where the pointer is on the canvas, in whole canvas pixels (undefined when off the canvas), so it can be
   * shared with others in a session.
   */
  private reportPointer(point: Point): void {
    const app = this.app as PaintCanvas;
    const { x, y } = app.viewport.screenToCanvas(point);
    const inside = x >= 0 && y >= 0 && x <= app.width && y <= app.height;
    app.setPointer(inside ? { x: Math.floor(x), y: Math.floor(y) } : undefined);
  }

  /**
   * Show the cursor for the tool in use.
   */
  private updateCursor(): void {
    const app = this.app;
    if (!app) return;
    // While sampling, the outlined pixel in the sampling window shows where the pointer is
    if (this.sampling) {
      this.style.cursor = "none";
      return;
    }
    this.style.cursor = cursorFor(app.activeTool, {
      dragging: this.drag !== null,
      altKey: this.altKey,
    });
  }

  override render() {
    // A new screen canvas for each rendering, as its first context decides where it draws (see `prepareScene`)
    return html`${keyed(
        this.app?.rendering ?? "cpu",
        html`<canvas
          class="scene"
          aria-label=${this.t("paintCanvas.canvas.label")}
          @pointerdown=${this.onPointerDown}
          @pointermove=${this.onPointerMove}
          @pointerup=${this.onPointerUp}
          @pointercancel=${this.onPointerCancel}
          @touchstart=${this.onTouchStart}
          @pointerleave=${this.onPointerLeave}
          @wheel=${this.onWheel}
          @gesturestart=${this.onGestureStart}
          @gesturechange=${this.onGestureChange}
          @gestureend=${(e: Event) => e.preventDefault()}
          @dblclick=${() => this.app?.applyLasso(this.app.lasso.close())}
          @contextmenu=${(e: Event) => e.preventDefault()}
        ></canvas>`,
      )}
      <canvas class="outlines" aria-hidden="true"></canvas>
      <canvas class="overlay" aria-hidden="true"></canvas>
      <canvas class="sampler" aria-hidden="true"></canvas>`;
  }
}

defineElement("pc-canvas", PcCanvas);
