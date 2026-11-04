import { describe, it, expect } from "vitest";
import {
  CONFIGURABLE_SHORTCUTS,
  FIXED_SHORTCUTS,
  HOLD_TO_PAN,
  SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  ariaKeyShortcut,
  cmdSymbol,
  comboFromEvent,
  comboText,
  defaultShortcutBindings,
  fixedShortcutFor,
  isApplePlatform,
  isTypingTarget,
  matchShortcut,
  normaliseCombo,
  sameCombo,
  sanitiseCombo,
  sanitiseShortcutBindings,
  shortcutLabel,
  shortcutsFor,
  type KeyEventLike,
} from "..";
import { Tool } from "../../../classes/PaintCanvas";

/** Create a key press with no modifiers unless given */
const key = (
  value: string,
  modifiers: Partial<KeyEventLike> = {},
): KeyEventLike => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

const MAC = "MacIntel";
const WINDOWS = "Win32";

describe("SHORTCUT_DEFINITIONS", () => {
  it("should have unique IDs and not define the same key combination twice", () => {
    const ids = SHORTCUT_DEFINITIONS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    const combos = SHORTCUT_DEFINITIONS.flatMap(({ combos }) => combos);
    for (const [i, combo] of combos.entries())
      expect(combos.findIndex((other) => sameCombo(other, combo))).toBe(i);
  });

  it("should give each configurable action one key combination, and fixed ones at least one", () => {
    for (const { combos } of CONFIGURABLE_SHORTCUTS)
      expect(combos).toHaveLength(1);
    for (const { combos } of FIXED_SHORTCUTS)
      expect(combos.length).toBeGreaterThan(0);
    expect(FIXED_SHORTCUTS.map(({ id }) => id)).toEqual([
      ...Array.from({ length: 10 }, (_, i) => `layer-opacity-${(i + 1) * 10}`),
      "toggle-interface",
      "save",
      "undo",
      "redo",
      "delete",
      "cancel",
      "commit",
    ]);
  });

  it("should set layer opacity with 1 to 9 and 0", () => {
    const opacity = (digit: string) =>
      SHORTCUTS.find((shortcut) => sameCombo(shortcut, { key: digit }))?.action;
    expect(opacity("1")).toEqual({ type: "layer-opacity", opacity: 0.1 });
    expect(opacity("5")).toEqual({ type: "layer-opacity", opacity: 0.5 });
    expect(opacity("0")).toEqual({ type: "layer-opacity", opacity: 1 });
  });
});

describe("normaliseCombo and sameCombo", () => {
  it("should keep only modifiers that are on", () => {
    expect(
      normaliseCombo({ key: "s", cmd: true, ctrl: false, shift: false }),
    ).toEqual({ key: "s", cmd: true });
    expect(
      normaliseCombo({
        key: "g",
        cmd: true,
        ctrl: true,
        shift: true,
        alt: true,
      }),
    ).toEqual({ key: "g", cmd: true, ctrl: true, shift: true, alt: true });
  });

  it("should compare key combinations", () => {
    expect(
      sameCombo({ key: "s", cmd: true }, { key: "s", cmd: true, alt: false }),
    ).toBe(true);
    expect(sameCombo({ key: "s", cmd: true }, { key: "s", ctrl: true })).toBe(
      false,
    );
    expect(sameCombo({ key: "s" }, { key: "d" })).toBe(false);
  });
});

describe("sanitiseCombo", () => {
  it("should keep valid key combinations", () => {
    expect(
      sanitiseCombo({ key: "s", cmd: true, shift: false, extra: 1 }),
    ).toEqual({
      key: "s",
      cmd: true,
    });
    expect(sanitiseCombo({ key: " " })).toEqual({ key: " " });
  });

  it.each([
    [null],
    ["s"],
    [{}],
    [{ key: "" }],
    [{ key: "S" }],
    [{ key: "x".repeat(33) }],
    [{ key: "s", cmd: "yes" }],
  ])("should reject %j", (input) => {
    expect(sanitiseCombo(input)).toBeUndefined();
  });
});

describe("defaultShortcutBindings", () => {
  it("should give each configurable action its default key combination", () => {
    const bindings = defaultShortcutBindings();
    expect(Object.keys(bindings)).toEqual(
      CONFIGURABLE_SHORTCUTS.map(({ id }) => id),
    );
    expect(bindings[HOLD_TO_PAN]).toEqual({ key: " " });
    expect(bindings["tool-circle-mask"]).toEqual({ key: "m", shift: true });
    expect(bindings["invert-selection"]).toEqual({
      key: "i",
      cmd: true,
      shift: true,
    });
    expect(bindings["zoom-in"]).toEqual({ key: "+", cmd: true });
    expect(bindings["tool-pan"]).toBeUndefined();
  });
});

describe("fixedShortcutFor", () => {
  it("should find the fixed action using a key combination", () => {
    expect(fixedShortcutFor({ key: "z", cmd: true })?.id).toBe("undo");
    expect(fixedShortcutFor({ key: "backspace" })?.id).toBe("delete");
    expect(fixedShortcutFor({ key: "3" })?.id).toBe("layer-opacity-30");
    expect(fixedShortcutFor({ key: "b" })).toBeUndefined();
  });
});

describe("sanitiseShortcutBindings", () => {
  const defaults = defaultShortcutBindings();

  it("should use defaults for missing and invalid actions, and leave out unknown ones", () => {
    const bindings = sanitiseShortcutBindings(
      { "tool-brush": { key: "p" }, cut: "nope", unknown: { key: "q" } },
      defaults,
    );
    expect(bindings["tool-brush"]).toEqual({ key: "p" });
    expect(bindings.cut).toEqual(defaults.cut);
    expect(bindings.unknown).toBeUndefined();
    expect(sanitiseShortcutBindings("nope", defaults)).toEqual(defaults);
  });

  it("should remove a key combination with null", () => {
    expect(sanitiseShortcutBindings({ cut: null }, defaults).cut).toBeNull();
  });

  it("should remove key combinations fixed actions use, or that an earlier action has", () => {
    const bindings = sanitiseShortcutBindings(
      { "tool-move": { key: "z", cmd: true }, "tool-eraser": { key: "b" } },
      defaults,
    );
    expect(bindings["tool-move"]).toBeNull();
    // The brush comes first and keeps b
    expect(bindings["tool-brush"]).toEqual({ key: "b" });
    expect(bindings["tool-eraser"]).toBeNull();
  });

  it("should handle defaults without an action", () => {
    expect(sanitiseShortcutBindings({}, {})["tool-brush"]).toBeNull();
  });
});

describe("shortcutsFor", () => {
  it("should list configurable and fixed shortcuts, without the hold-to-pan key or removed ones", () => {
    const shortcuts = shortcutsFor({
      ...defaultShortcutBindings(),
      cut: null,
    });
    expect(shortcuts.some(({ action }) => action.type === "pan")).toBe(false);
    expect(shortcuts.some(({ action }) => action.type === "cut")).toBe(false);
    expect(shortcuts).toContainEqual({
      key: "b",
      action: { type: "tool", tool: Tool.Brush },
    });
    expect(shortcuts).toContainEqual({
      key: "delete",
      action: { type: "delete" },
    });
    expect(shortcuts).toContainEqual({
      key: "backspace",
      action: { type: "delete" },
    });
  });
});

describe("comboFromEvent", () => {
  it.each([
    // Letters, with Shift
    ["b", {}, MAC, { key: "b" }],
    ["M", { shiftKey: true }, MAC, { key: "m", shift: true }],
    // cmd is Command on Apple devices and Ctrl elsewhere; ctrl is Control on Apple devices
    ["z", { metaKey: true }, MAC, { key: "z", cmd: true }],
    ["z", { ctrlKey: true }, WINDOWS, { key: "z", cmd: true }],
    ["z", { ctrlKey: true }, MAC, { key: "z", ctrl: true }],
    [
      "g",
      { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true },
      MAC,
      { key: "g", cmd: true, ctrl: true, alt: true, shift: true },
    ],
    // Named keys keep their modifiers
    ["Backspace", { altKey: true }, WINDOWS, { key: "backspace", alt: true }],
    ["Tab", { shiftKey: true }, MAC, { key: "tab", shift: true }],
    [" ", { shiftKey: true }, MAC, { key: " ", shift: true }],
    // Symbols and digits ignore the Shift or AltGr/Option used to type them
    ["<", { shiftKey: true }, MAC, { key: "<" }],
    [">", { shiftKey: true }, WINDOWS, { key: ">" }],
    ["[", { altKey: true, code: "Digit5" }, MAC, { key: "[" }],
    ["1", { shiftKey: true, code: "Digit1" }, WINDOWS, { key: "1" }],
    // AltGr on Windows is reported as Ctrl+Alt
    [
      "[",
      {
        ctrlKey: true,
        altKey: true,
        getModifierState: (k: string) => k === "AltGraph",
      },
      WINDOWS,
      { key: "[" },
    ],
    // = is +, so cmd + works without Shift
    ["=", { metaKey: true }, MAC, { key: "+", cmd: true }],
    ["+", { metaKey: true, shiftKey: true }, MAC, { key: "+", cmd: true }],
    // Characters that aren't basic Latin use the physical key
    ["©", { altKey: true, code: "KeyG" }, MAC, { key: "g", alt: true }],
    ["ф", { ctrlKey: true, code: "KeyA" }, WINDOWS, { key: "a", cmd: true }],
    ["“", { altKey: true, code: "BracketLeft" }, MAC, { key: "[", alt: true }],
    ["¡", { altKey: true, code: "Digit1" }, MAC, { key: "1", alt: true }],
    ["Dead", { altKey: true, code: "KeyE" }, MAC, { key: "e", alt: true }],
    // A character without a known physical key stays as it is
    ["ß", { code: "Minus" }, WINDOWS, { key: "-" }],
    ["é", {}, WINDOWS, { key: "é" }],
    ["é", { code: "Unknown" }, WINDOWS, { key: "é" }],
  ])(
    "should read %j with %j on %s as %j",
    (value, modifiers, platform, combo) => {
      expect(comboFromEvent(key(value, modifiers), platform)).toEqual(combo);
    },
  );

  it.each([
    ["while composing text", "a", { isComposing: true }],
    ["for input method keys", "Process", {}],
    ["for unidentified keys", "Unidentified", {}],
    ["for a modifier alone", "Shift", { shiftKey: true }],
    ["for Control alone", "Control", { ctrlKey: true }],
    ["for a dead key without a physical key", "Dead", {}],
  ])("should give nothing %s", (_, value, modifiers) => {
    expect(comboFromEvent(key(value, modifiers), MAC)).toBeUndefined();
  });

  it("should ignore the Windows key outside Apple devices", () => {
    expect(
      comboFromEvent(key("d", { metaKey: true }), WINDOWS),
    ).toBeUndefined();
  });

  it("should use the browser's platform by default", () => {
    expect(comboFromEvent(key("b"))).toEqual({ key: "b" });
  });
});

describe("matchShortcut", () => {
  it.each([
    ["b", {}, MAC, { type: "tool", tool: Tool.Brush }],
    ["M", { shiftKey: true }, MAC, { type: "tool", tool: Tool.CircleLasso }],
    ["L", { shiftKey: true }, MAC, { type: "tool", tool: Tool.FreeformLasso }],
    ["Tab", {}, MAC, { type: "toggle-interface" }],
    ["[", {}, MAC, { type: "brush-smaller" }],
    ["<", { shiftKey: true }, MAC, { type: "brush-less-opaque" }],
    [">", { shiftKey: true }, MAC, { type: "brush-more-opaque" }],
    ["a", { metaKey: true }, MAC, { type: "select-all" }],
    ["a", { ctrlKey: true }, WINDOWS, { type: "select-all" }],
    ["I", { metaKey: true, shiftKey: true }, MAC, { type: "invert-selection" }],
    ["z", { metaKey: true }, MAC, { type: "undo" }],
    ["Z", { metaKey: true, shiftKey: true }, MAC, { type: "redo" }],
    ["Delete", {}, MAC, { type: "delete" }],
    ["Backspace", {}, MAC, { type: "delete" }],
    ["Backspace", { metaKey: true }, MAC, { type: "fill-foreground" }],
    ["Backspace", { altKey: true }, MAC, { type: "fill-background" }],
    ["x", {}, MAC, { type: "swap-colours" }],
    ["=", { ctrlKey: true }, WINDOWS, { type: "zoom-in" }],
    ["-", { metaKey: true }, MAC, { type: "zoom-out" }],
    ["0", { metaKey: true }, MAC, { type: "reset-zoom" }],
    ["7", {}, MAC, { type: "layer-opacity", opacity: 0.7 }],
    ["Escape", {}, MAC, { type: "cancel" }],
    ["Enter", {}, MAC, { type: "commit" }],
  ])("should match %j with %j on %s", (value, modifiers, platform, action) => {
    expect(matchShortcut(key(value, modifiers), SHORTCUTS, platform)).toEqual(
      action,
    );
  });

  it("should not treat Space as a press shortcut (it is held to pan), and no longer select the pan tool with h", () => {
    expect(matchShortcut(key(" "), SHORTCUTS, MAC)).toBeUndefined();
    expect(matchShortcut(key("h"), SHORTCUTS, MAC)).toBeUndefined();
  });

  it("should require modifiers to match exactly", () => {
    expect(
      matchShortcut(key("b", { altKey: true }), SHORTCUTS, MAC),
    ).toBeUndefined();
    expect(matchShortcut(key("s"), SHORTCUTS, MAC)).toBeUndefined();
    expect(
      matchShortcut(key("z", { ctrlKey: true }), SHORTCUTS, MAC),
    ).toBeUndefined();
    expect(
      matchShortcut(key("Shift", { shiftKey: true }), SHORTCUTS, MAC),
    ).toBeUndefined();
  });

  it("should use a custom shortcut list, and the default list and platform otherwise", () => {
    expect(
      matchShortcut(key("b"), [
        { key: "b", alt: false, action: { type: "save" } },
      ]),
    ).toEqual({ type: "save" });
    expect(matchShortcut(key("e"))).toEqual({
      type: "tool",
      tool: Tool.Eraser,
    });
  });
});

describe("comboText", () => {
  it.each([
    [
      { key: "g", shift: true, alt: true, cmd: true, ctrl: true },
      MAC,
      "shift alt cmd ctrl g",
    ],
    [{ key: "s", cmd: true }, WINDOWS, "ctrl s"],
    [{ key: " " }, MAC, "space"],
    [{ key: "backspace", alt: true }, MAC, "alt backspace"],
  ])("should write %j on %s as %s", (combo, platform, text) => {
    expect(comboText(combo, platform)).toBe(text);
  });
});

describe("isTypingTarget", () => {
  it("should detect text fields", () => {
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("should ignore buttons, sliders and non-elements", () => {
    const range = document.createElement("input");
    range.type = "range";
    expect(isTypingTarget(range)).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe("cmdSymbol", () => {
  it("should be ⌘ on Apple devices and ^ elsewhere", () => {
    expect(cmdSymbol("MacIntel")).toBe("⌘");
    expect(cmdSymbol("iPad")).toBe("⌘");
    expect(cmdSymbol("Win32")).toBe("^");
    expect(cmdSymbol("Linux x86_64")).toBe("^");
    expect(cmdSymbol()).toBe(cmdSymbol(navigator.platform));
  });
});

describe("isApplePlatform", () => {
  it("should detect Apple devices", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
    expect(isApplePlatform()).toBe(isApplePlatform(navigator.platform));
  });
});

describe("shortcutLabel", () => {
  it.each([
    [{ key: "s", cmd: true }, "MacIntel", "⌘S"],
    [{ key: "s", cmd: true }, "Win32", "^S"],
    [{ key: "z", cmd: true, shift: true }, "MacIntel", "⇧⌘Z"],
    [
      { key: "x", ctrl: true, alt: true, shift: true, cmd: true },
      "MacIntel",
      "^⌥⇧⌘X",
    ],
    [{ key: "backspace", alt: true }, "Win32", "⌥⌫"],
    [{ key: "delete" }, "MacIntel", "⌦"],
    [{ key: "tab" }, "MacIntel", "⇥"],
    [{ key: "escape" }, "MacIntel", "⎋"],
    [{ key: "enter" }, "MacIntel", "↵"],
    [{ key: "arrowup", shift: true }, "MacIntel", "⇧↑"],
    [{ key: " " }, "MacIntel", "Space"],
    [{ key: "[" }, "MacIntel", "["],
    [{ key: "f5" }, "MacIntel", "F5"],
  ])("should label %j on %s as %s", (combo, platform, label) => {
    expect(shortcutLabel(combo, platform)).toBe(label);
  });
});

describe("ariaKeyShortcut", () => {
  it.each([
    [{ key: "s", cmd: true }, "MacIntel", "Meta+S"],
    [{ key: "s", cmd: true }, "Win32", "Control+S"],
    [
      { key: "z", ctrl: true, alt: true, shift: true },
      "MacIntel",
      "Control+Alt+Shift+Z",
    ],
    [{ key: "backspace", alt: true }, "Win32", "Alt+Backspace"],
    [{ key: " " }, "MacIntel", "Space"],
    [{ key: "]" }, "MacIntel", "]"],
  ])("should name %j on %s as %s", (combo, platform, value) => {
    expect(ariaKeyShortcut(combo, platform)).toBe(value);
  });
});
