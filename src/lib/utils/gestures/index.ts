/** Touch gestures that can undo, redo, copy or paste */
export const TOUCH_GESTURES = [
  "tap2",
  "tap3",
  "swipeLeft3",
  "swipeRight3",
  "swipeUp3",
  "swipeDown3",
  "swipeOut3",
  "swipeIn3",
] as const;

export type TouchGesture = (typeof TOUCH_GESTURES)[number];

/** What each gesture is called in "My settings" */
export const TOUCH_GESTURE_NAMES: Record<TouchGesture, string> = {
  tap2: "Tap with two fingers",
  tap3: "Tap with three fingers",
  swipeLeft3: "Swipe left with three fingers",
  swipeRight3: "Swipe right with three fingers",
  swipeUp3: "Swipe up with three fingers",
  swipeDown3: "Swipe down with three fingers",
  swipeOut3: "Swipe out with three fingers",
  swipeIn3: "Swipe in with three fingers",
};

/** Actions a touch gesture can do */
export const GESTURE_ACTIONS = ["undo", "redo", "copy", "paste"] as const;

export type GestureAction = (typeof GESTURE_ACTIONS)[number];

/** Which gesture does each action, or "off" */
export type GestureSettings = Record<GestureAction, TouchGesture | "off">;

/** The gestures each action starts with (copy and paste as iPadOS does them) */
export const DEFAULT_GESTURES: GestureSettings = {
  undo: "tap2",
  redo: "tap3",
  copy: "swipeIn3",
  paste: "swipeOut3",
};

/**
 * Keep only valid gestures from stored (untrusted) settings, using the defaults for anything missing or invalid. A
 * gesture used by an earlier action is turned off for later ones, so one gesture never does two things.
 *
 * @example
 * sanitiseGestures({ undo: "tap3", redo: "tap3" }); // { undo: "tap3", redo: "off", copy: "swipeIn3", paste: "swipeOut3" }
 */
export const sanitiseGestures = (input: unknown): GestureSettings => {
  const value =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const used = new Set<TouchGesture>();
  const result = { ...DEFAULT_GESTURES };
  for (const action of GESTURE_ACTIONS) {
    const chosen = value[action];
    const gesture =
      chosen === "off" || TOUCH_GESTURES.includes(chosen as TouchGesture)
        ? (chosen as TouchGesture | "off")
        : DEFAULT_GESTURES[action];
    result[action] = gesture !== "off" && used.has(gesture) ? "off" : gesture;
    if (result[action] !== "off") used.add(result[action]);
  }
  return result;
};

/**
 * Give an action a gesture. If another action had it, that action takes this action's old gesture instead (the two
 * swap).
 *
 * @example
 * assignGesture(DEFAULT_GESTURES, "undo", "tap3"); // undo: "tap3", redo: "tap2"
 */
export const assignGesture = (
  gestures: GestureSettings,
  action: GestureAction,
  gesture: TouchGesture | "off",
): GestureSettings => {
  const result = { ...gestures, [action]: gesture };
  if (gesture === "off") return result;
  const other = GESTURE_ACTIONS.find(
    (each) => each !== action && gestures[each] === gesture,
  );
  if (other) result[other] = gestures[action];
  return result;
};

/**
 * The action a gesture does, if any.
 *
 * @example
 * gestureAction(DEFAULT_GESTURES, "tap2"); // "undo"
 */
export const gestureAction = (
  gestures: GestureSettings,
  gesture: TouchGesture,
): GestureAction | undefined =>
  GESTURE_ACTIONS.find((action) => gestures[action] === gesture);
