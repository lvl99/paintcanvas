import { html } from "lit";

// The icons that come with PaintCanvas (128 × 128 PNGs made from the 64 × 64 SVG source artwork beside them by
// `node scripts/build-icons.ts`), and the registry elements look icons up in.
import brush from "./images/icon-brush@2x.png?url";
import eraser from "./images/icon-eraser@2x.png?url";
import cursor from "./images/icon-cursor@2x.png?url";
import rectangleMask from "./images/icon-rectangle-mask@2x.png?url";
import circleMask from "./images/icon-circle-mask@2x.png?url";
import polygonMask from "./images/icon-polygon-mask@2x.png?url";
import freehandMask from "./images/icon-freehand-mask@2x.png?url";
import eyedropper from "./images/icon-eyedropper@2x.png?url";
import zoom from "./images/icon-zoom@2x.png?url";
import zoomIn from "./images/icon-zoom-in@2x.png?url";
import zoomOut from "./images/icon-zoom-out@2x.png?url";
import pan from "./images/icon-pan@2x.png?url";
import undo from "./images/icon-undo@2x.png?url";
import redo from "./images/icon-redo@2x.png?url";
import layers from "./images/icon-layers@2x.png?url";
import locked from "./images/icon-locked@2x.png?url";
import unlocked from "./images/icon-unlocked@2x.png?url";
import visible from "./images/icon-visible@2x.png?url";
import hidden from "./images/icon-hidden@2x.png?url";
import linked from "./images/icon-linked@2x.png?url";
import unlinked from "./images/icon-unlinked@2x.png?url";
import pressure from "./images/icon-pressure@2x.png?url";
import focusPen from "./images/icon-focus-pen@2x.png?url";
import tilt from "./images/icon-tilt@2x.png?url";
import randomise from "./images/icon-randomise@2x.png?url";
import flipHorizontal from "./images/icon-flip-horizontal@2x.png?url";
import flipVertical from "./images/icon-flip-vertical@2x.png?url";
import rotate90Left from "./images/icon-rotate-90-left@2x.png?url";
import rotate90Right from "./images/icon-rotate-90-right@2x.png?url";
import rotate from "./images/icon-rotate@2x.png?url";
import horizontalSize from "./images/icon-horizontal-size@2x.png?url";
import verticalSize from "./images/icon-vertical-size@2x.png?url";
import diagonalTlbrSize from "./images/icon-diagonal-tlbr-size@2x.png?url";
import diagonalTrblSize from "./images/icon-diagonal-trbl-size@2x.png?url";
import clipboard from "./images/icon-clipboard@2x.png?url";
import smoothingLinear from "./images/icon-smoothing-linear@2x.png?url";
import smoothingBezierQuad from "./images/icon-smoothing-bezier-quad@2x.png?url";
import smoothingBezierCubic from "./images/icon-smoothing-bezier-cubic@2x.png?url";
import sun from "./images/icon-sun@2x.png?url";
import moon from "./images/icon-moon@2x.png?url";
import star from "./images/icon-star@2x.png?url";

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
  | "rotate"
  | "horizontalSize"
  | "verticalSize"
  | "diagonalTlbrSize"
  | "diagonalTrblSize"
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
  rotate,
  horizontalSize,
  verticalSize,
  diagonalTlbrSize,
  diagonalTrblSize,
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
