import {
  DEFAULT_GESTURES,
  sanitiseGestures,
  type GestureSettings,
} from "../../utils/gestures";

/** How the user's input devices control the canvas */
export interface InputSettingsData {
  /** Two-finger scroll (or mouse wheel) pans the canvas */
  scrollPan: boolean;
  /** Pinch zooms the canvas */
  pinchZoom: boolean;
  /** Cmd/Ctrl + scroll zooms the canvas (desktop only) */
  modifierScrollZoom: boolean;
  /** Which touch gesture undoes, redoes, copies and pastes (touch devices only) */
  gestures: GestureSettings;
  /** Focus pen mode: fingers and palms never draw, and touches are ignored while a pen is down or just lifted */
  focusPen: boolean;
  /** Pen pressure varies the brush and eraser's width and height, whatever the preset says (see `withPenInput`) */
  penPressure: boolean;
  /** Pen tilt turns the brush and eraser to the pen's lean, whatever the preset says (see `withPenInput`) */
  penTilt: boolean;
}

/** The on/off input settings */
const INPUT_TOGGLES = [
  "scrollPan",
  "pinchZoom",
  "modifierScrollZoom",
  "focusPen",
  "penPressure",
  "penTilt",
] as const;

/** Names of all input settings, e.g. to pick them out of a larger settings object */
export const INPUT_SETTING_KEYS = [...INPUT_TOGGLES, "gestures"] as const;

/**
 * Default input settings: all navigation on, the default touch gestures, focus pen mode off, pen pressure on and pen
 * tilt off.
 *
 * @example
 * defaultInputSettings().focusPen; // false
 */
export const defaultInputSettings = (): InputSettingsData => ({
  scrollPan: true,
  pinchZoom: true,
  modifierScrollZoom: true,
  gestures: { ...DEFAULT_GESTURES },
  focusPen: false,
  penPressure: true,
  penTilt: false,
});

/**
 * Keep only valid input settings from an untrusted value (e.g. stored or imported), using `defaults` for anything
 * missing or invalid. Other properties are left out.
 *
 * @example
 * sanitiseInputSettings({ focusPen: true, scrollPan: "yes" }, defaultInputSettings()); // focusPen on, scrollPan from defaults
 */
export const sanitiseInputSettings = (
  input: unknown,
  defaults: InputSettingsData,
): InputSettingsData => {
  const result: InputSettingsData = {
    ...defaults,
    gestures: { ...defaults.gestures },
  };
  if (typeof input !== "object" || input === null) return result;
  const value = input as Record<string, unknown>;
  for (const key of INPUT_TOGGLES) {
    if (typeof value[key] === "boolean") result[key] = value[key];
  }
  if ("gestures" in value) result.gestures = sanitiseGestures(value.gestures);
  return result;
};

/**
 * Whether two sets of input settings are the same.
 */
const sameInputSettings = (
  a: InputSettingsData,
  b: InputSettingsData,
): boolean =>
  INPUT_TOGGLES.every((key) => a[key] === b[key]) &&
  JSON.stringify(a.gestures) === JSON.stringify(b.gestures);

/**
 * Whether the device has no fine pointer (mouse or trackpad), i.e. it is a phone or tablet. Without `matchMedia`, the
 * device is treated as a desktop.
 *
 * @example
 * isTouchDevice(); // false on a laptop
 */
export const isTouchDevice = (
  matchMedia:
    | ((query: string) => { matches: boolean })
    | undefined = typeof window.matchMedia === "function"
    ? (query) => window.matchMedia(query)
    : undefined,
): boolean => (matchMedia ? !matchMedia("(any-pointer: fine)").matches : false);

/**
 * Name of the key held to zoom with the scroll wheel: "Cmd" on Apple devices, "Ctrl" elsewhere.
 *
 * @example
 * zoomModifierName("MacIntel"); // "Cmd"
 * zoomModifierName("Win32"); // "Ctrl"
 */
export const zoomModifierName = (
  platform: string = navigator.platform,
): "Cmd" | "Ctrl" => (/Mac|iPhone|iPad|iPod/.test(platform) ? "Cmd" : "Ctrl");

/**
 * How the user's input devices control the canvas: scrolling, pinching, touch gestures, focus pen mode, and pen
 * pressure and tilt. Kept in
 * memory; the implementer saves and restores them (see `update` and the `change` event).
 *
 * Dispatches a `change` event when a setting changes.
 *
 * @example
 * const input = new InputSettings();
 * input.update({ focusPen: true });
 * input.data.focusPen; // true
 */
export default class InputSettings extends EventTarget {
  private values: InputSettingsData;

  constructor(initial?: unknown) {
    super();
    this.values = sanitiseInputSettings(initial, defaultInputSettings());
  }

  /** Current settings (read-only copy) */
  get data(): Readonly<InputSettingsData> {
    return this.values;
  }

  /**
   * Change some settings and dispatch `change` if anything changed. Invalid values and other properties are ignored, so
   * a larger settings object can be passed.
   *
   * @example
   * input.update({ pinchZoom: false });
   */
  update(changes: Partial<InputSettingsData>): void {
    const next = sanitiseInputSettings(
      { ...this.values, ...changes },
      this.values,
    );
    if (sameInputSettings(next, this.values)) return;
    this.values = next;
    this.dispatchEvent(new Event("change"));
  }
}
