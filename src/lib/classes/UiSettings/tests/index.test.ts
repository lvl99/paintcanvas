import { describe, it, expect, vi } from "vitest";
import UiSettings, {
  MAX_LOCALE_LENGTH,
  RENDERINGS,
  THEMES,
  isLocaleTag,
  isRendering,
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

describe("isRendering", () => {
  it("should accept the renderings only", () => {
    for (const rendering of RENDERINGS)
      expect(isRendering(rendering)).toBe(true);
    expect(isRendering("webgl")).toBe(false);
    expect(isRendering(undefined)).toBe(false);
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
    expect(
      sanitiseUiSettings(null, { theme: "dark", rendering: "cpu" }),
    ).toEqual({ theme: "dark", rendering: "cpu" });
    expect(
      sanitiseUiSettings("dark", {
        theme: "light",
        locale: "fr",
        rendering: "gpu",
      }),
    ).toEqual({ theme: "light", locale: "fr", rendering: "gpu" });
  });

  it("should keep valid settings, use the defaults for invalid ones and leave out others", () => {
    expect(
      sanitiseUiSettings(
        { theme: "dark", locale: "ja", rendering: "gpu", extra: true },
        { theme: "system", rendering: "cpu" },
      ),
    ).toEqual({ theme: "dark", locale: "ja", rendering: "gpu" });
    expect(
      sanitiseUiSettings(
        { theme: "auto", locale: 42, rendering: "webgl" },
        { theme: "system", locale: "ko", rendering: "cpu" },
      ),
    ).toEqual({ theme: "system", locale: "ko", rendering: "cpu" });
  });
});

describe("UiSettings", () => {
  it("should follow the device's theme and languages, and draw on the CPU, by default", () => {
    expect(new UiSettings().data).toEqual({
      theme: "system",
      rendering: "cpu",
    });
  });

  it("should start from valid initial settings", () => {
    expect(
      new UiSettings({ theme: "dark", locale: "<b>", rendering: "gpu" }).data,
    ).toEqual({ theme: "dark", rendering: "gpu" });
  });

  it("should change settings, telling listeners only when something changed", () => {
    const ui = new UiSettings();
    const change = vi.fn();
    ui.addEventListener("change", change);
    ui.update({ theme: "light" });
    ui.update({ locale: "fr" });
    ui.update({ rendering: "gpu" });
    expect(ui.data).toEqual({ theme: "light", locale: "fr", rendering: "gpu" });
    expect(change).toHaveBeenCalledTimes(3);
    ui.update({ theme: "light", locale: "fr", rendering: "gpu" });
    ui.update({ theme: "sepia" as "light", rendering: "webgl" as "gpu" });
    expect(change).toHaveBeenCalledTimes(3);
  });
});
