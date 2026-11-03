import { html } from "lit";

// The icons that come with PaintCanvas (128 × 128 PNGs), and the registry elements look icons up in.
import brush from "./images/brush.png?url";
import eraser from "./images/eraser.png?url";
import cursor from "./images/cursor.png?url";
import rectangleMask from "./images/rectangle-mask.png?url";
import circleMask from "./images/circle-mask.png?url";
import polygonMask from "./images/polygon-mask.png?url";
import freehandMask from "./images/freehand-mask.png?url";
import eyedropper from "./images/eyedropper.png?url";
import zoom from "./images/zoom.png?url";
import zoomIn from "./images/zoom-in.png?url";
import zoomOut from "./images/zoom-out.png?url";
import pan from "./images/pan.png?url";
import undo from "./images/undo.png?url";
import redo from "./images/redo.png?url";
import layers from "./images/layers.png?url";
import locked from "./images/locked.png?url";
import unlocked from "./images/unlocked.png?url";
import visible from "./images/visible.png?url";
import hidden from "./images/hidden.png?url";
import linked from "./images/linked.png?url";
import unlinked from "./images/unlinked.png?url";
import pressure from "./images/pressure.png?url";
import focusPen from "./images/focus-pen.png?url";
import tilt from "./images/tilt.png?url";
import randomise from "./images/randomise.png?url";
import flipHorizontal from "./images/flip-horizontal.png?url";
import flipVertical from "./images/flip-vertical.png?url";
import rotate90Left from "./images/rotate-90-left.png?url";
import rotate90Right from "./images/rotate-90-right.png?url";
import clipboard from "./images/clipboard.png?url";
import smoothingLinear from "./images/smoothing-linear.png?url";
import smoothingBezierQuad from "./images/smoothing-bezier-quad.png?url";
import smoothingBezierCubic from "./images/smoothing-bezier-cubic.png?url";
import sun from "./images/sun.png?url";
import moon from "./images/moon.png?url";
import star from "./images/star.png?url";

/** Names of the icons that come with PaintCanvas */
export type IconName =
  | "brush"
  | "eraser"
  | "cursor"
  | "rectangleMask"
  | "circleMask"
  | "polygonMask"
  | "freehandMask"
  | "eyedropper"
  | "zoom"
  | "zoomIn"
  | "zoomOut"
  | "pan"
  | "undo"
  | "redo"
  | "layers"
  | "locked"
  | "unlocked"
  | "visible"
  | "hidden"
  | "linked"
  | "unlinked"
  | "pressure"
  | "focusPen"
  | "tilt"
  | "randomise"
  | "flipHorizontal"
  | "flipVertical"
  | "rotate90Left"
  | "rotate90Right"
  | "clipboard"
  | "smoothingLinear"
  | "smoothingBezierQuad"
  | "smoothingBezierCubic"
  | "sun"
  | "moon"
  | "star";

/** The icons that come with PaintCanvas, as URLs */
export const DEFAULT_ICONS: Readonly<Record<IconName, string>> = {
  brush,
  eraser,
  cursor,
  rectangleMask,
  circleMask,
  polygonMask,
  freehandMask,
  eyedropper,
  zoom,
  zoomIn,
  zoomOut,
  pan,
  undo,
  redo,
  layers,
  locked,
  unlocked,
  visible,
  hidden,
  linked,
  unlinked,
  pressure,
  focusPen,
  tilt,
  randomise,
  flipHorizontal,
  flipVertical,
  rotate90Left,
  rotate90Right,
  clipboard,
  smoothingLinear,
  smoothingBezierQuad,
  smoothingBezierCubic,
  sun,
  moon,
  star,
};

/**
 * The icons PaintCanvas's elements show, by name. Implementers can replace any icon (or add their own) with an image
 * URL, e.g. an SVG data URL.
 *
 * Dispatches a `change` event when icons change, so elements show the new ones.
 *
 * @example
 * icons.register({ brush: "/my-icons/brush.svg" });
 * icons.get("brush"); // "/my-icons/brush.svg"
 */
export class IconRegistry extends EventTarget {
  private readonly urls: Map<string, string>;

  constructor(initial: Readonly<Record<string, string>> = DEFAULT_ICONS) {
    super();
    this.urls = new Map(Object.entries(initial));
  }

  /** Names of all registered icons */
  get names(): string[] {
    return [...this.urls.keys()];
  }

  /**
   * An icon's URL, or undefined if there's none by that name.
   */
  get(name: string): string | undefined {
    return this.urls.get(name);
  }

  /**
   * Add or replace icons, by name. Dispatches `change`.
   */
  register(icons: Readonly<Record<string, string>>): void {
    for (const [name, url] of Object.entries(icons)) this.urls.set(name, url);
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Put back the icons that come with PaintCanvas, removing any added. Dispatches `change`.
   */
  reset(): void {
    this.urls.clear();
    for (const [name, url] of Object.entries(DEFAULT_ICONS))
      this.urls.set(name, url);
    this.dispatchEvent(new Event("change"));
  }
}

/** The icons PaintCanvas's UI uses, unless an element is given others */
export const icons = new IconRegistry();

/**
 * An icon button's or toggle's content: its icon, and its name for screen readers only (style `.visually-hidden` and
 * `.icon-toggle` with `iconControls`).
 *
 * @example
 * html`<label class="icon-toggle"><input type="checkbox" />${iconLabel(url, "Tilt")}</label>`
 */
export const iconLabel = (icon: string, name: string) =>
  html`<img src=${icon} alt="" /><span class="visually-hidden">${name}</span>`;
