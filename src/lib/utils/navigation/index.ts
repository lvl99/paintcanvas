import type { Point } from "../../classes/Viewport";
import type { InputSettingsData } from "../../classes/InputSettings";

/** Pixels per line when a wheel reports its movement in lines */
export const WHEEL_LINE_PIXELS = 16;

/** Pixels per page when a wheel reports its movement in pages */
export const WHEEL_PAGE_PIXELS = 800;

/** Largest wheel movement (pixels) counted for one zoom step, so one mouse wheel notch can't zoom too far */
export const MAX_WHEEL_ZOOM_DELTA = 50;

/** How strongly wheel movement zooms: each pixel changes the zoom by about 1% */
export const WHEEL_ZOOM_SPEED = 0.01;

/** What a wheel or trackpad movement does to the view */
export type WheelAction =
  | { kind: "pan"; dx: number; dy: number }
  | { kind: "zoom"; factor: number }
  | null;

/** The navigation settings a wheel movement depends on */
export type NavigationSettings = Pick<
  InputSettingsData,
  "scrollPan" | "pinchZoom" | "modifierScrollZoom"
>;

/**
 * Convert a wheel movement to pixels.
 *
 * @example
 * wheelPixels(3, WheelEvent.DOM_DELTA_LINE); // 48
 */
export const wheelPixels = (delta: number, deltaMode: number): number =>
  delta *
  (deltaMode === 1
    ? WHEEL_LINE_PIXELS
    : deltaMode === 2
      ? WHEEL_PAGE_PIXELS
      : 1);

/**
 * Decide what a wheel movement does:
 *
 * - With Ctrl held, or a trackpad pinch (which browsers report as Ctrl + wheel): zoom, if pinch zoom is on (or, where
 *   Ctrl is the zoom key, if modifier zoom is on).
 * - With Cmd held (Apple devices): zoom, if modifier zoom is on.
 * - Otherwise: pan, if scroll panning is on.
 *
 * @example
 * wheelAction({ deltaX: 0, deltaY: 10, deltaMode: 0, ctrlKey: false, metaKey: false }, settings, "Cmd");
 * // { kind: "pan", dx: -0, dy: -10 }
 */
export const wheelAction = (
  event: Pick<
    WheelEvent,
    "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey"
  >,
  settings: NavigationSettings,
  modifier: "Cmd" | "Ctrl",
): WheelAction => {
  const dx = wheelPixels(event.deltaX, event.deltaMode);
  const dy = wheelPixels(event.deltaY, event.deltaMode);
  const zooms = event.ctrlKey
    ? settings.pinchZoom || (modifier === "Ctrl" && settings.modifierScrollZoom)
    : event.metaKey && modifier === "Cmd" && settings.modifierScrollZoom;
  if (event.ctrlKey || event.metaKey) {
    if (!zooms) return null;
    const step = Math.max(
      -MAX_WHEEL_ZOOM_DELTA,
      Math.min(MAX_WHEEL_ZOOM_DELTA, dy),
    );
    return { kind: "zoom", factor: Math.exp(-step * WHEEL_ZOOM_SPEED) };
  }
  return settings.scrollPan ? { kind: "pan", dx: -dx, dy: -dy } : null;
};

/**
 * The midpoint of two touches and the distance between them, for two-finger pan and pinch.
 *
 * @example
 * touchPair({ x: 0, y: 0 }, { x: 6, y: 8 }); // { mid: { x: 3, y: 4 }, distance: 10 }
 */
export const touchPair = (
  a: Point,
  b: Point,
): { mid: Point; distance: number } => ({
  mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  distance: Math.hypot(b.x - a.x, b.y - a.y),
});
