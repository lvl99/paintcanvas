import { Tool } from "../../classes/PaintCanvas/tool";

/** Actions that keyboard shortcuts trigger */
export type ShortcutAction =
  | { type: "tool"; tool: Tool }
  | { type: "pan" }
  | { type: "brush-smaller" }
  | { type: "brush-bigger" }
  | { type: "brush-less-opaque" }
  | { type: "brush-more-opaque" }
  | { type: "toggle-interface" }
  | { type: "select-all" }
  | { type: "invert-selection" }
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
  | { type: "swap-colours" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "reset-zoom" }
  | { type: "layer-opacity"; opacity: number };

/**
 * A key combination. `cmd` is the Command key on Apple devices and Ctrl elsewhere; `ctrl` is the Control key on Apple
 * devices only (elsewhere Ctrl is `cmd`).
 */
export interface KeyCombo {
  /** Lowercase `KeyboardEvent.key` value, e.g. `a`, `[`, `backspace` or ` ` (Space) */
  key: string;
  cmd?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** A key combination and the action it runs */
export interface Shortcut extends KeyCombo {
  action: ShortcutAction;
}

/** Groups shortcuts are listed in, e.g. in the keyboard shortcuts settings */
export type ShortcutGroup =
  | "tools"
  | "brushes"
  | "clipboard"
  | "masking"
  | "fills"
  | "viewport"
  | "layers"
  | "general";

/** A keyboard shortcut action and its default key combinations */
export interface ShortcutDefinition {
  /** Names the action, e.g. to save its key combination and to translate its name (`paintCanvas.shortcuts.<id>`) */
  id: string;
  group: ShortcutGroup;
  action: ShortcutAction;
  /** Default key combinations (a configurable action has one) */
  combos: readonly KeyCombo[];
  /** Whether users can change or remove its key combination */
  configurable: boolean;
}

/** ID of the action run while its key is held: pan, returning to the last tool when released */
export const HOLD_TO_PAN = "pan";

/**
 * Define a shortcut action.
 */
const define = (
  id: string,
  group: ShortcutGroup,
  action: ShortcutAction,
  combos: KeyCombo[],
  configurable = true,
): ShortcutDefinition => ({ id, group, action, combos, configurable });

/** Define a configurable tool shortcut */
const tool = (id: string, toolName: Tool, combo: KeyCombo) =>
  define(id, "tools", { type: "tool", tool: toolName }, [combo]);

/** Layer opacity shortcuts: 1 for 10% to 9 for 90%, and 0 for 100% */
const LAYER_OPACITY_SHORTCUTS = Array.from({ length: 10 }, (_, i) =>
  define(
    `layer-opacity-${(i + 1) * 10}`,
    "layers",
    { type: "layer-opacity", opacity: (i + 1) / 10 },
    [{ key: String((i + 1) % 10) }],
    false,
  ),
);

/** Every keyboard shortcut action, in the order they are listed */
export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  define(HOLD_TO_PAN, "tools", { type: "pan" }, [{ key: " " }]),
  tool("tool-move", Tool.Move, { key: "v" }),
  tool("tool-brush", Tool.Brush, { key: "b" }),
  tool("tool-eraser", Tool.Eraser, { key: "e" }),
  tool("tool-rectangle-mask", Tool.RectangleLasso, { key: "m" }),
  tool("tool-circle-mask", Tool.CircleLasso, { key: "m", shift: true }),
  tool("tool-polygon-mask", Tool.PolygonLasso, { key: "l" }),
  tool("tool-freehand-mask", Tool.FreeformLasso, { key: "l", shift: true }),
  tool("tool-colour-sample", Tool.ColourSample, { key: "i" }),
  tool("tool-zoom", Tool.Zoom, { key: "z" }),
  define("brush-bigger", "brushes", { type: "brush-bigger" }, [{ key: "]" }]),
  define("brush-smaller", "brushes", { type: "brush-smaller" }, [{ key: "[" }]),
  define("brush-more-opaque", "brushes", { type: "brush-more-opaque" }, [
    { key: ">" },
  ]),
  define("brush-less-opaque", "brushes", { type: "brush-less-opaque" }, [
    { key: "<" },
  ]),
  define("cut", "clipboard", { type: "cut" }, [{ key: "x", cmd: true }]),
  define("copy", "clipboard", { type: "copy" }, [{ key: "c", cmd: true }]),
  define("paste", "clipboard", { type: "paste" }, [{ key: "v", cmd: true }]),
  define("select-all", "masking", { type: "select-all" }, [
    { key: "a", cmd: true },
  ]),
  define("invert-selection", "masking", { type: "invert-selection" }, [
    { key: "i", cmd: true, shift: true },
  ]),
  define("deselect", "masking", { type: "deselect" }, [
    { key: "d", cmd: true },
  ]),
  define("fill-foreground", "fills", { type: "fill-foreground" }, [
    { key: "backspace", cmd: true },
  ]),
  define("fill-background", "fills", { type: "fill-background" }, [
    { key: "backspace", alt: true },
  ]),
  define("swap-colours", "fills", { type: "swap-colours" }, [{ key: "x" }]),
  define("zoom-in", "viewport", { type: "zoom-in" }, [{ key: "+", cmd: true }]),
  define("zoom-out", "viewport", { type: "zoom-out" }, [
    { key: "-", cmd: true },
  ]),
  define("reset-zoom", "viewport", { type: "reset-zoom" }, [
    { key: "0", cmd: true },
  ]),
  ...LAYER_OPACITY_SHORTCUTS,
  define(
    "toggle-interface",
    "general",
    { type: "toggle-interface" },
    [{ key: "tab" }],
    false,
  ),
  define("save", "general", { type: "save" }, [{ key: "s", cmd: true }], false),
  define("undo", "general", { type: "undo" }, [{ key: "z", cmd: true }], false),
  define(
    "redo",
    "general",
    { type: "redo" },
    [{ key: "z", cmd: true, shift: true }],
    false,
  ),
  define(
    "delete",
    "general",
    { type: "delete" },
    [{ key: "delete" }, { key: "backspace" }],
    false,
  ),
  define("cancel", "general", { type: "cancel" }, [{ key: "escape" }], false),
  define("commit", "general", { type: "commit" }, [{ key: "enter" }], false),
];

/** The actions users can change the key combinations of */
export const CONFIGURABLE_SHORTCUTS: readonly ShortcutDefinition[] =
  SHORTCUT_DEFINITIONS.filter((definition) => definition.configurable);

/** The actions whose key combinations can't be changed */
export const FIXED_SHORTCUTS: readonly ShortcutDefinition[] =
  SHORTCUT_DEFINITIONS.filter((definition) => !definition.configurable);

/** The key combination of each configurable action, by ID (null when it has none) */
export type ShortcutBindings = Record<string, KeyCombo | null>;

/** Longest key name in a saved key combination (characters) */
const MAX_KEY_LENGTH = 32;

/**
 * A key combination with only the modifiers that are on, e.g. to compare or save it.
 *
 * @example
 * normaliseCombo({ key: "s", cmd: true, shift: false }); // { key: "s", cmd: true }
 */
export const normaliseCombo = ({
  key,
  cmd,
  ctrl,
  shift,
  alt,
}: KeyCombo): KeyCombo => ({
  key,
  ...(cmd && { cmd: true }),
  ...(ctrl && { ctrl: true }),
  ...(shift && { shift: true }),
  ...(alt && { alt: true }),
});

/**
 * Whether two key combinations are the same.
 *
 * @example
 * sameCombo({ key: "s", cmd: true }, { key: "s", cmd: true, shift: false }); // true
 */
export const sameCombo = (a: KeyCombo, b: KeyCombo): boolean =>
  a.key === b.key &&
  Boolean(a.cmd) === Boolean(b.cmd) &&
  Boolean(a.ctrl) === Boolean(b.ctrl) &&
  Boolean(a.shift) === Boolean(b.shift) &&
  Boolean(a.alt) === Boolean(b.alt);

/**
 * Keep a valid key combination from an untrusted value (e.g. stored or imported). Undefined if it isn't one.
 *
 * @example
 * sanitiseCombo({ key: "s", cmd: true, extra: 1 }); // { key: "s", cmd: true }
 * sanitiseCombo({ key: "" }); // undefined
 */
export const sanitiseCombo = (input: unknown): KeyCombo | undefined => {
  if (typeof input !== "object" || input === null) return undefined;
  const { key, cmd, ctrl, shift, alt } = input as Record<string, unknown>;
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.length > MAX_KEY_LENGTH ||
    key !== key.toLowerCase() ||
    ![cmd, ctrl, shift, alt].every(
      (flag) => flag === undefined || typeof flag === "boolean",
    )
  )
    return undefined;
  return normaliseCombo({
    key,
    cmd: cmd as boolean,
    ctrl: ctrl as boolean,
    shift: shift as boolean,
    alt: alt as boolean,
  });
};

/**
 * The default key combination of each configurable action.
 *
 * @example
 * defaultShortcutBindings()["tool-brush"]; // { key: "b" }
 */
export const defaultShortcutBindings = (): ShortcutBindings =>
  Object.fromEntries(
    // Each configurable action has one default key combination
    CONFIGURABLE_SHORTCUTS.map(({ id, combos }) => [
      id,
      normaliseCombo(combos[0] as KeyCombo),
    ]),
  );

/**
 * The fixed action that uses a key combination, if any.
 *
 * @example
 * fixedShortcutFor({ key: "z", cmd: true })?.id; // "undo"
 */
export const fixedShortcutFor = (
  combo: KeyCombo,
): ShortcutDefinition | undefined =>
  FIXED_SHORTCUTS.find(({ combos }) =>
    combos.some((fixed) => sameCombo(fixed, combo)),
  );

/**
 * Keep valid key combinations from an untrusted value (e.g. stored or imported), using `defaults` for actions that are
 * missing or invalid. `null` removes an action's key combination. A key combination a fixed action uses, or that an
 * earlier action (in `SHORTCUT_DEFINITIONS` order) already has, is removed. Unknown actions are left out.
 *
 * @example
 * sanitiseShortcutBindings({ "tool-brush": { key: "p" }, cut: null }, defaultShortcutBindings());
 */
export const sanitiseShortcutBindings = (
  input: unknown,
  defaults: ShortcutBindings,
): ShortcutBindings => {
  const given =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const used: KeyCombo[] = [];
  return Object.fromEntries(
    CONFIGURABLE_SHORTCUTS.map(({ id }) => {
      const value = given[id];
      const combo =
        value === null ? null : (sanitiseCombo(value) ?? defaults[id] ?? null);
      if (
        !combo ||
        fixedShortcutFor(combo) ||
        used.some((other) => sameCombo(other, combo))
      )
        return [id, null];
      used.push(combo);
      return [id, combo];
    }),
  );
};

/**
 * The shortcuts to match key presses against: the configurable actions' key combinations (except the hold-to-pan key,
 * which acts while held) and the fixed ones.
 *
 * @example
 * shortcutsFor(defaultShortcutBindings()).find((s) => s.key === "b")?.action; // { type: "tool", tool: Tool.Brush }
 */
export const shortcutsFor = (bindings: ShortcutBindings): Shortcut[] => [
  ...CONFIGURABLE_SHORTCUTS.flatMap(({ id, action }) => {
    const combo = bindings[id];
    return combo && id !== HOLD_TO_PAN ? [{ ...combo, action }] : [];
  }),
  ...FIXED_SHORTCUTS.flatMap(({ action, combos }) =>
    combos.map((combo) => ({ ...combo, action })),
  ),
];

/** All keyboard shortcuts with their default key combinations */
export const SHORTCUTS: readonly Shortcut[] = shortcutsFor(
  defaultShortcutBindings(),
);

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

/** The parts of a keyboard event used to read key combinations */
export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
> &
  Partial<Pick<KeyboardEvent, "code" | "isComposing" | "getModifierState">>;

/** Keys that are only modifiers, which don't make a key combination on their own (lowercase) */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "shift",
  "control",
  "alt",
  "altgraph",
  "meta",
  "os",
  "super",
  "hyper",
  "fn",
  "fnlock",
  "capslock",
  "numlock",
  "scrolllock",
  "symbol",
  "symbollock",
]);

/** Characters of physical keys (by `KeyboardEvent.code`) other than letters and digits, as on a US keyboard */
const CODE_CHARACTERS: Readonly<Record<string, string>> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
  IntlBackslash: "<",
};

/** Keys treated as another key: `=` (typed without Shift on many keyboards) as `+` */
const KEY_ALIASES: Readonly<Record<string, string>> = { "=": "+" };

/**
 * The character of a physical key (by `KeyboardEvent.code`) as on a US keyboard, e.g. `KeyA` → `a`, `Digit5` → `5`.
 *
 * @example
 * codeCharacter("KeyG"); // "g"
 * codeCharacter("BracketLeft"); // "["
 */
const codeCharacter = (code: string | undefined): string | undefined => {
  const match = /^(?:Key([A-Z])|Digit(\d)|Numpad(\d))$/.exec(code ?? "");
  const character = match?.slice(1).find(Boolean);
  if (character) return character.toLowerCase();
  return code ? CODE_CHARACTERS[code] : undefined;
};

/**
 * Whether a key is one printable basic Latin (ASCII) character.
 */
const isBasicCharacter = (key: string): boolean =>
  key.length === 1 && key >= " " && key <= "~";

/**
 * The key combination of a key press, matching keyboards with different layouts:
 * - Keys are matched by the character they type, so letters follow the key's label (e.g. `a` on a French keyboard).
 * - Digits and symbols ignore Shift and AltGr/Option, which are often needed to type them (e.g. `<` and `[` on a
 *   German keyboard).
 * - When a key types a character that isn't basic Latin (another alphabet, or Option on macOS), or is a dead key, the
 *   physical key is used instead (e.g. `a` for `ф`, and `alt g` for Option+G typing `©`).
 * - `=` counts as `+`, so `cmd +` works with or without Shift.
 *
 * `cmd` is Command on Apple devices and Ctrl elsewhere; `ctrl` is Control on Apple devices. Undefined while composing
 * text (e.g. with an input method), for modifier keys alone, and for the Windows key elsewhere.
 *
 * @example
 * comboFromEvent({ key: "Z", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, "MacIntel");
 * // { key: "z", cmd: true, shift: true }
 */
export const comboFromEvent = (
  event: KeyEventLike,
  platform?: string,
): KeyCombo | undefined => {
  const apple = isApplePlatform(platform);
  const typed = event.key.toLowerCase();
  if (
    event.isComposing ||
    typed === "process" ||
    typed === "unidentified" ||
    MODIFIER_KEYS.has(typed) ||
    (!apple && event.metaKey)
  )
    return undefined;
  const character = [...event.key].length === 1;
  const physical =
    (character && !isBasicCharacter(typed)) || typed === "dead"
      ? codeCharacter(event.code)
      : undefined;
  if (typed === "dead" && !physical) return undefined;
  const key = KEY_ALIASES[physical ?? typed] ?? physical ?? typed;
  // AltGr (reported as Ctrl+Alt on Windows) is only used to type characters
  const altGraph = event.getModifierState?.("AltGraph") ?? false;
  // Digits and symbols already include the Shift or AltGr/Option used to type them
  const typedSymbol = character && !physical && !/^[a-z ]$/.test(key);
  return normaliseCombo({
    key,
    cmd: apple ? event.metaKey : event.ctrlKey && !altGraph,
    ctrl: apple && event.ctrlKey,
    shift: event.shiftKey && !typedSymbol,
    alt: event.altKey && !altGraph && !typedSymbol,
  });
};

/**
 * Find the action for a key press (see `comboFromEvent`). Modifier keys must match exactly.
 *
 * @example
 * matchShortcut({ key: "Z", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, SHORTCUTS, "MacIntel");
 * // { type: "redo" }
 */
export const matchShortcut = (
  event: KeyEventLike,
  shortcuts: readonly Shortcut[] = SHORTCUTS,
  platform?: string,
): ShortcutAction | undefined => {
  const combo = comboFromEvent(event, platform);
  return (
    combo && shortcuts.find((shortcut) => sameCombo(shortcut, combo))?.action
  );
};

/**
 * A key combination as words, e.g. for a text field: modifiers in the order shift, alt, cmd, ctrl, then the key
 * (Space as `space`). "cmd" is written `ctrl` except on Apple devices.
 *
 * @example
 * comboText({ key: "g", shift: true, alt: true, cmd: true, ctrl: true }, "MacIntel"); // "shift alt cmd ctrl g"
 * comboText({ key: "s", cmd: true }, "Win32"); // "ctrl s"
 */
export const comboText = (combo: KeyCombo, platform?: string): string =>
  [
    combo.shift && "shift",
    combo.alt && "alt",
    combo.cmd && (isApplePlatform(platform) ? "cmd" : "ctrl"),
    combo.ctrl && "ctrl",
    combo.key === " " ? "space" : combo.key,
  ]
    .filter(Boolean)
    .join(" ");

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
