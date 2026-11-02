import { describe, it, expect, vi } from "vitest";
import InputSettings, {
  INPUT_SETTING_KEYS,
  defaultInputSettings,
  isTouchDevice,
  sanitiseInputSettings,
  zoomModifierName,
} from "..";
import { DEFAULT_GESTURES } from "../../../utils/gestures";

describe("defaultInputSettings", () => {
  it("should turn all navigation on, use the default gestures and turn focus pen mode off", () => {
    expect(defaultInputSettings()).toEqual({
      scrollPan: true,
      pinchZoom: true,
      modifierScrollZoom: true,
      gestures: DEFAULT_GESTURES,
      focusPen: false,
    });
  });

  it("should give a new gestures object each time", () => {
    expect(defaultInputSettings().gestures).not.toBe(DEFAULT_GESTURES);
  });
});

describe("INPUT_SETTING_KEYS", () => {
  it("should name every input setting", () => {
    expect([...INPUT_SETTING_KEYS].sort()).toEqual(
      Object.keys(defaultInputSettings()).sort(),
    );
  });
});

describe("sanitiseInputSettings", () => {
  const defaults = defaultInputSettings();

  it("should use the defaults for anything that isn't an object", () => {
    expect(sanitiseInputSettings(null, defaults)).toEqual(defaults);
    expect(sanitiseInputSettings("focusPen", defaults)).toEqual(defaults);
  });

  it("should keep valid values and ignore invalid ones and other properties", () => {
    expect(
      sanitiseInputSettings(
        { focusPen: true, scrollPan: "no", volume: 1 },
        defaults,
      ),
    ).toEqual({ ...defaults, focusPen: true });
  });

  it("should sanitise gestures", () => {
    const gestures = { ...DEFAULT_GESTURES, undo: "off" };
    expect(sanitiseInputSettings({ gestures }, defaults).gestures).toEqual(
      gestures,
    );
  });

  it("should not share the defaults' gestures object", () => {
    expect(sanitiseInputSettings({}, defaults).gestures).not.toBe(
      defaults.gestures,
    );
  });
});

describe("isTouchDevice", () => {
  it("should be a touch device without a fine pointer", () => {
    expect(isTouchDevice(() => ({ matches: false }))).toBe(true);
    expect(isTouchDevice(() => ({ matches: true }))).toBe(false);
  });

  it("should be a desktop without matchMedia", () => {
    expect(isTouchDevice(undefined)).toBe(false);
    expect(isTouchDevice()).toBe(false);
  });

  it("should use window.matchMedia by default", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal("matchMedia", matchMedia);
    expect(isTouchDevice()).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith("(any-pointer: fine)");
    vi.unstubAllGlobals();
  });
});

describe("zoomModifierName", () => {
  it("should be Cmd on Apple devices and Ctrl elsewhere", () => {
    expect(zoomModifierName("MacIntel")).toBe("Cmd");
    expect(zoomModifierName("iPad")).toBe("Cmd");
    expect(zoomModifierName("Win32")).toBe("Ctrl");
    expect(zoomModifierName()).toBe(
      /Mac/.test(navigator.platform) ? "Cmd" : "Ctrl",
    );
  });
});

describe("InputSettings", () => {
  it("should start with the defaults, or the valid parts of initial settings", () => {
    expect(new InputSettings().data).toEqual(defaultInputSettings());
    expect(
      new InputSettings({ pinchZoom: false, colour: "#000000" }).data,
    ).toEqual({ ...defaultInputSettings(), pinchZoom: false });
  });

  it("should change settings and dispatch change", () => {
    const input = new InputSettings();
    const onChange = vi.fn();
    input.addEventListener("change", onChange);
    input.update({ focusPen: true });
    expect(input.data.focusPen).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("should not dispatch change when nothing changed", () => {
    const input = new InputSettings();
    const onChange = vi.fn();
    input.addEventListener("change", onChange);
    input.update({ focusPen: false, gestures: { ...DEFAULT_GESTURES } });
    input.update({ scrollPan: "off" as unknown as boolean });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should dispatch change when a gesture changes", () => {
    const input = new InputSettings();
    const onChange = vi.fn();
    input.addEventListener("change", onChange);
    input.update({ gestures: { ...DEFAULT_GESTURES, redo: "off" } });
    expect(input.data.gestures.redo).toBe("off");
    expect(onChange).toHaveBeenCalledOnce();
  });
});
