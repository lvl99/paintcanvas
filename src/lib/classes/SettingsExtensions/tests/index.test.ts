import { describe, it, expect, vi } from "vitest";
import SettingsExtensions, {
  RESERVED_SETTINGS_KEYS,
  type SettingsExtension,
} from "..";

/** An extension keeping one setting, `sound`, telling listeners when it changes */
const createExtension = (key = "livecanvas") => {
  const target = new EventTarget();
  const state = { sound: false };
  const extension: SettingsExtension<{ sound: boolean }> = {
    key,
    validate: (value): value is { sound: boolean } =>
      typeof (value as { sound?: unknown })?.sound === "boolean",
    collect: () => ({ ...state }),
    apply: (value) => {
      state.sound = value.sound;
    },
    target,
  };
  return { extension, state, target };
};

describe("SettingsExtensions", () => {
  it("should collect and apply each extension's settings, telling listeners when they change", () => {
    const extensions = new SettingsExtensions();
    const change = vi.fn();
    extensions.addEventListener("change", change);
    const { extension, state, target } = createExtension();
    extensions.add(extension);
    expect(extensions.items).toEqual([extension]);
    expect(change).toHaveBeenCalledOnce();
    extensions.apply({ livecanvas: { sound: true }, ui: { theme: "dark" } });
    expect(state.sound).toBe(true);
    expect(extensions.collect()).toEqual({ livecanvas: { sound: true } });
    extensions.apply({ livecanvas: { sound: "loud" } });
    expect(state.sound).toBe(true);
    target.dispatchEvent(new Event("change"));
    expect(change).toHaveBeenCalledTimes(2);
    expect(extensions.remove("livecanvas")).toBe(true);
    expect(extensions.remove("livecanvas")).toBe(false);
    target.dispatchEvent(new Event("change"));
    expect(change).toHaveBeenCalledTimes(3);
    expect(extensions.collect()).toEqual({});
  });

  it("should keep settings read for an extension not added yet, using them when it's added if valid", () => {
    const extensions = new SettingsExtensions();
    extensions.apply({
      livecanvas: { sound: true },
      other: { a: 1 },
      gone: undefined,
    });
    expect(extensions.collect()).toEqual({
      livecanvas: { sound: true },
      other: { a: 1 },
    });
    const { extension, state } = createExtension();
    extensions.add(extension);
    expect(state.sound).toBe(true);
    const invalid = createExtension("other");
    extensions.add(invalid.extension);
    expect(invalid.state.sound).toBe(false);
    expect(extensions.collect()).toEqual({
      livecanvas: { sound: true },
      other: { sound: false },
    });
  });

  it("should refuse keys PaintCanvas or another extension uses, and work without a target", () => {
    const extensions = new SettingsExtensions();
    expect(RESERVED_SETTINGS_KEYS).toContain("brushes");
    expect(() => extensions.add(createExtension("ui").extension)).toThrow(
      'Settings key "ui" is already used',
    );
    const { extension } = createExtension();
    extensions.add({ ...extension, target: undefined });
    expect(() => extensions.add(extension)).toThrow("already used");
    expect(extensions.remove("livecanvas")).toBe(true);
  });
});
