import { describe, it, expect, vi } from "vitest";
import ShortcutSettings from "..";
import { Tool } from "../../PaintCanvas/tool";
import { defaultShortcutBindings } from "../../../utils/shortcuts";

/** Settings with a change listener */
const setup = (initial?: unknown) => {
  const settings = new ShortcutSettings(initial);
  const listener = vi.fn();
  settings.addEventListener("change", listener);
  return { settings, listener };
};

describe("ShortcutSettings", () => {
  it("should start with the default key combinations, or valid given ones", () => {
    expect(new ShortcutSettings().bindings).toEqual(defaultShortcutBindings());
    const settings = new ShortcutSettings({ "tool-brush": { key: "p" } });
    expect(settings.combo("tool-brush")).toEqual({ key: "p" });
    expect(settings.combo("tool-eraser")).toEqual({ key: "e" });
    expect(settings.combo("unknown")).toBeNull();
  });

  it("should list the shortcuts to match and the hold-to-pan key", () => {
    const settings = new ShortcutSettings();
    expect(settings.holdToPan).toEqual({ key: " " });
    expect(settings.shortcuts).toContainEqual({
      key: "b",
      action: { type: "tool", tool: Tool.Brush },
    });
    settings.set("pan", null);
    expect(settings.holdToPan).toBeNull();
  });

  it("should set a key combination, dispatching a change and updating the shortcuts", () => {
    const { settings, listener } = setup();
    expect(settings.set("tool-brush", { key: "p", shift: false })).toEqual({
      changed: true,
    });
    expect(settings.combo("tool-brush")).toEqual({ key: "p" });
    expect(settings.shortcuts).toContainEqual({
      key: "p",
      action: { type: "tool", tool: Tool.Brush },
    });
    expect(settings.shortcuts.some((s) => s.key === "b")).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should move a key combination from the action that had it", () => {
    const { settings } = setup();
    expect(settings.set("tool-brush", { key: "e" })).toEqual({
      changed: true,
      movedFrom: "tool-eraser",
    });
    expect(settings.combo("tool-brush")).toEqual({ key: "e" });
    expect(settings.combo("tool-eraser")).toBeNull();
  });

  it("should not set a key combination a fixed action uses", () => {
    const { settings, listener } = setup();
    expect(settings.set("deselect", { key: "z", cmd: true })).toEqual({
      changed: false,
      fixed: "undo",
    });
    expect(settings.combo("deselect")).toEqual({ key: "d", cmd: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it("should remove a key combination", () => {
    const { settings, listener } = setup();
    expect(settings.set("deselect", null)).toEqual({ changed: true });
    expect(settings.combo("deselect")).toBeNull();
    expect(settings.shortcuts.some((s) => s.action.type === "deselect")).toBe(
      false,
    );
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should change nothing for the same key combination, removing none, or unknown and fixed actions", () => {
    const { settings, listener } = setup({ deselect: null });
    expect(settings.set("tool-brush", { key: "b" })).toEqual({
      changed: false,
    });
    expect(settings.set("deselect", null)).toEqual({ changed: false });
    expect(settings.set("unknown", { key: "q" })).toEqual({ changed: false });
    expect(settings.set("undo", { key: "q" })).toEqual({ changed: false });
    expect(listener).not.toHaveBeenCalled();
  });

  it("should load saved key combinations, only dispatching a change when they differ", () => {
    const { settings, listener } = setup();
    settings.load(defaultShortcutBindings());
    expect(listener).not.toHaveBeenCalled();
    settings.load({ "tool-brush": { key: "p" }, deselect: null });
    expect(settings.combo("tool-brush")).toEqual({ key: "p" });
    expect(settings.combo("deselect")).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    // Removed and changed in the other direction
    settings.load({ "tool-brush": null });
    expect(settings.combo("tool-brush")).toBeNull();
    expect(settings.combo("deselect")).toEqual({ key: "d", cmd: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should go back to the default key combinations", () => {
    const { settings } = setup({ "tool-brush": { key: "p" } });
    settings.reset();
    expect(settings.bindings).toEqual(defaultShortcutBindings());
  });
});
