import { describe, it, expect, vi } from "vitest";
import UiSettings, {
  MAX_LOCALE_LENGTH,
  THEMES,
  isLocaleTag,
  isTheme,
  sanitiseUiSettings,
} from "..";

describe("isTheme", () => {
  it("should accept the themes only", () => {
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
    expect(isTheme("auto")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe("isLocaleTag", () => {
  it("should accept letters, digits and hyphens, up to the longest length", () => {
    expect(isLocaleTag("zh-Hant")).toBe(true);
    expect(isLocaleTag("es-419")).toBe(true);
    expect(isLocaleTag("a".repeat(MAX_LOCALE_LENGTH))).toBe(true);
    expect(isLocaleTag("a".repeat(MAX_LOCALE_LENGTH + 1))).toBe(false);
    expect(isLocaleTag("")).toBe(false);
    expect(isLocaleTag("<script>")).toBe(false);
    expect(isLocaleTag(42)).toBe(false);
  });
});

describe("sanitiseUiSettings", () => {
  it("should use the defaults for anything that isn't an object", () => {
    expect(sanitiseUiSettings(null, { theme: "dark" })).toEqual({
      theme: "dark",
    });
    expect(
      sanitiseUiSettings("dark", { theme: "light", locale: "fr" }),
    ).toEqual({ theme: "light", locale: "fr" });
  });

  it("should keep valid settings, use the defaults for invalid ones and leave out others", () => {
    expect(
      sanitiseUiSettings(
        { theme: "dark", locale: "ja", extra: true },
        { theme: "system" },
      ),
    ).toEqual({ theme: "dark", locale: "ja" });
    expect(
      sanitiseUiSettings(
        { theme: "auto", locale: 42 },
        { theme: "system", locale: "ko" },
      ),
    ).toEqual({ theme: "system", locale: "ko" });
  });
});

describe("UiSettings", () => {
  it("should follow the device's theme and languages by default", () => {
    expect(new UiSettings().data).toEqual({ theme: "system" });
  });

  it("should start from valid initial settings", () => {
    expect(new UiSettings({ theme: "dark", locale: "<b>" }).data).toEqual({
      theme: "dark",
    });
  });

  it("should change settings, telling listeners only when something changed", () => {
    const ui = new UiSettings();
    const change = vi.fn();
    ui.addEventListener("change", change);
    ui.update({ theme: "light" });
    ui.update({ locale: "fr" });
    expect(ui.data).toEqual({ theme: "light", locale: "fr" });
    expect(change).toHaveBeenCalledTimes(2);
    ui.update({ theme: "light", locale: "fr" });
    ui.update({ theme: "sepia" as "light" });
    expect(change).toHaveBeenCalledTimes(2);
  });
});
