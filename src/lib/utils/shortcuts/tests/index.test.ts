import { describe, it, expect } from "vitest";
import {
  SHORTCUTS,
  cmdSymbol,
  isTypingTarget,
  matchShortcut,
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

describe("SHORTCUTS", () => {
  it("should not define the same key combination twice", () => {
    const combos = SHORTCUTS.map(
      (s) => `${s.key}|${!!s.cmd}|${!!s.shift}|${!!s.alt}`,
    );
    expect(new Set(combos).size).toBe(combos.length);
  });
});

describe("matchShortcut", () => {
  it.each([
    ["b", {}, { type: "tool", tool: Tool.Brush }],
    ["M", { shiftKey: true }, { type: "tool", tool: Tool.CircleLasso }],
    ["L", { shiftKey: true }, { type: "tool", tool: Tool.FreeformLasso }],
    ["h", {}, { type: "tool", tool: Tool.Pan }],
    ["Tab", {}, { type: "toggle-interface" }],
    ["[", {}, { type: "brush-smaller" }],
    ["a", { metaKey: true }, { type: "select-all" }],
    ["a", { ctrlKey: true }, { type: "select-all" }],
    ["z", { metaKey: true }, { type: "undo" }],
    ["Z", { metaKey: true, shiftKey: true }, { type: "redo" }],
    ["Delete", {}, { type: "delete" }],
    ["Backspace", {}, { type: "delete" }],
    ["Backspace", { metaKey: true }, { type: "fill-foreground" }],
    ["Backspace", { altKey: true }, { type: "fill-background" }],
    ["x", {}, { type: "swap-colours" }],
    ["Escape", {}, { type: "cancel" }],
    ["Enter", {}, { type: "commit" }],
  ])("should match %j with %j", (value, modifiers, action) => {
    expect(matchShortcut(key(value, modifiers))).toEqual(action);
  });

  it("should not treat Space as a press shortcut (it is held to pan)", () => {
    expect(matchShortcut(key(" "))).toBeUndefined();
  });

  it("should require modifiers to match exactly", () => {
    expect(matchShortcut(key("b", { altKey: true }))).toBeUndefined();
    expect(matchShortcut(key("s"))).toBeUndefined();
    expect(matchShortcut(key("q"))).toBeUndefined();
  });

  it("should use a custom shortcut list", () => {
    expect(
      matchShortcut(key("b"), [
        { key: "b", alt: false, action: { type: "save" } },
      ]),
    ).toEqual({
      type: "save",
    });
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
