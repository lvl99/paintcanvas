import { Tool } from "../../classes/PaintCanvas";

/** Actions that keyboard shortcuts trigger */
export type ShortcutAction =
  | { type: "tool"; tool: Tool }
  | { type: "brush-smaller" }
  | { type: "brush-bigger" }
  | { type: "toggle-interface" }
  | { type: "select-all" }
  | { type: "deselect" }
  | { type: "save" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "cut" }
  | { type: "delete" }
  | { type: "copy" }
  | { type: "paste" }
  | { type: "cancel" }
  | { type: "commit" }
  | { type: "fill-foreground" }
  | { type: "fill-background" }
  | { type: "swap-colours" };

/**
 * A key combination. `cmd` is the Command key on Apple devices and Ctrl elsewhere; `ctrl` is the Control key on Apple
 * devices only (elsewhere Ctrl is `cmd`).
 */
export interface KeyCombo {
  /** Lowercase `KeyboardEvent.key` value */
  key: string;
  cmd?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface Shortcut extends KeyCombo {
  action: ShortcutAction;
}

/** All keyboard shortcuts */
export const SHORTCUTS: readonly Shortcut[] = [
  { key: "b", action: { type: "tool", tool: Tool.Brush } },
  { key: "e", action: { type: "tool", tool: Tool.Eraser } },
  { key: "v", action: { type: "tool", tool: Tool.Move } },
  { key: "m", action: { type: "tool", tool: Tool.RectangleLasso } },
  { key: "m", shift: true, action: { type: "tool", tool: Tool.CircleLasso } },
  { key: "l", action: { type: "tool", tool: Tool.PolygonLasso } },
  { key: "l", shift: true, action: { type: "tool", tool: Tool.FreeformLasso } },
  { key: "h", action: { type: "tool", tool: Tool.Pan } },
  { key: "z", action: { type: "tool", tool: Tool.Zoom } },
  { key: "i", action: { type: "tool", tool: Tool.ColourSample } },
  { key: "[", action: { type: "brush-smaller" } },
  { key: "]", action: { type: "brush-bigger" } },
  { key: "tab", action: { type: "toggle-interface" } },
  { key: "a", cmd: true, action: { type: "select-all" } },
  { key: "d", cmd: true, action: { type: "deselect" } },
  { key: "s", cmd: true, action: { type: "save" } },
  { key: "z", cmd: true, action: { type: "undo" } },
  { key: "z", cmd: true, shift: true, action: { type: "redo" } },
  { key: "x", cmd: true, action: { type: "cut" } },
  { key: "delete", action: { type: "delete" } },
  { key: "backspace", action: { type: "delete" } },
  { key: "backspace", cmd: true, action: { type: "fill-foreground" } },
  { key: "backspace", alt: true, action: { type: "fill-background" } },
  { key: "x", action: { type: "swap-colours" } },
  { key: "c", cmd: true, action: { type: "copy" } },
  { key: "v", cmd: true, action: { type: "paste" } },
  { key: "escape", action: { type: "cancel" } },
  { key: "enter", action: { type: "commit" } },
];

/**
 * Whether a platform (`navigator.platform` by default) is an Apple device, where "cmd" is the Command key.
 *
 * @example
 * isApplePlatform("MacIntel"); // true
 * isApplePlatform("Win32"); // false
 */
export const isApplePlatform = (
  platform: string = navigator.platform,
): boolean => /Mac|iPhone|iPad|iPod/.test(platform);

/**
 * The symbol for the "cmd" key in shortcut labels: ⌘ on Apple devices, ^ (Control) elsewhere.
 *
 * @example
 * cmdSymbol("MacIntel"); // "⌘"
 * cmdSymbol("Win32"); // "^"
 */
export const cmdSymbol = (platform?: string): string =>
  isApplePlatform(platform) ? "⌘" : "^";

/** Symbols for keys in shortcut labels; other keys are shown in uppercase */
const KEY_SYMBOLS: Readonly<Record<string, string>> = {
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  escape: "⎋",
  enter: "↵",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  " ": "Space",
};

/** Names of keys for `aria-keyshortcuts`; other keys are named as they are, in uppercase */
const ARIA_KEY_NAMES: Readonly<Record<string, string>> = {
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  escape: "Escape",
  enter: "Enter",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  " ": "Space",
};

/**
 * A short label for a key combination, e.g. for menus: modifier symbols (^ Control, ⌥ Alt, ⇧ Shift, then ⌘ for "cmd" on
 * Apple devices or ^ elsewhere), then the key as a symbol or in uppercase.
 *
 * @example
 * shortcutLabel({ key: "z", cmd: true, shift: true }, "MacIntel"); // "⇧⌘Z"
 * shortcutLabel({ key: "backspace", alt: true }, "Win32"); // "⌥⌫"
 */
export const shortcutLabel = (combo: KeyCombo, platform?: string): string =>
  [
    combo.ctrl && "^",
    combo.alt && "⌥",
    combo.shift && "⇧",
    combo.cmd && cmdSymbol(platform),
    KEY_SYMBOLS[combo.key] ?? combo.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join("");

/**
 * A key combination as an `aria-keyshortcuts` value, so screen readers can announce it.
 *
 * @example
 * ariaKeyShortcut({ key: "s", cmd: true }, "MacIntel"); // "Meta+S"
 * ariaKeyShortcut({ key: "backspace", alt: true }, "Win32"); // "Alt+Backspace"
 */
export const ariaKeyShortcut = (combo: KeyCombo, platform?: string): string =>
  [
    (combo.ctrl || (combo.cmd && !isApplePlatform(platform))) && "Control",
    combo.cmd && isApplePlatform(platform) && "Meta",
    combo.alt && "Alt",
    combo.shift && "Shift",
    ARIA_KEY_NAMES[combo.key] ?? combo.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join("+");

/** Key held to pan temporarily (handled separately because it acts while held, not on press) */
export const HOLD_TO_PAN_KEY = " ";

/** The parts of a keyboard event used to match shortcuts */
export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

/**
 * Find the action for a key press. Modifier keys must match exactly.
 *
 * @example
 * matchShortcut({ key: "Z", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false });
 * // { type: "redo" }
 */
export const matchShortcut = (
  event: KeyEventLike,
  shortcuts: readonly Shortcut[] = SHORTCUTS,
): ShortcutAction | undefined => {
  const key = event.key.toLowerCase();
  const cmd = event.metaKey || event.ctrlKey;
  return shortcuts.find(
    (s) =>
      s.key === key &&
      Boolean(s.cmd) === cmd &&
      Boolean(s.shift) === event.shiftKey &&
      Boolean(s.alt) === event.altKey,
  )?.action;
};

/**
 * Check if a key press happened while typing in a text field, where shortcuts must not apply.
 *
 * @example
 * isTypingTarget(document.querySelector("textarea")); // true
 */
export const isTypingTarget = (
  target: EventTarget | null | undefined,
): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
    return true;
  if (target instanceof HTMLInputElement) {
    return ![
      "button",
      "checkbox",
      "color",
      "radio",
      "range",
      "submit",
    ].includes(target.type);
  }
  return false;
};
