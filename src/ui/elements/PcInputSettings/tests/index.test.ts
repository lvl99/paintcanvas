import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcInputSettings } from "..";
import InputSettings from "../../../../lib/classes/InputSettings";
import { DEFAULT_GESTURES } from "../../../../lib/utils/gestures";
import Translations from "../../../../lib/i18n";
import { events, mount, query, queryAll } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

/** Mount the element for some settings on a device with a mouse */
const setup = (properties: Partial<PcInputSettings> = {}) => {
  const settings = new InputSettings();
  return mount<PcInputSettings>("pc-input-settings", {
    settings,
    touch: false,
    modifier: "Cmd",
    ...properties,
  }).then((element) => ({ element, settings }));
};

/** The visible labels of the on/off settings */
const toggleLabels = (element: PcInputSettings) =>
  queryAll(element, "label.toggle").map((label) => label.textContent?.trim());

describe("pc-input-settings", () => {
  it("should show nothing without settings", async () => {
    const element = await mount<PcInputSettings>("pc-input-settings");
    expect(element.shadowRoot?.querySelector("fieldset")).toBeNull();
  });

  it("should show scrolling, pinching, modifier zoom and focus pen mode on a device with a mouse", async () => {
    const { element } = await setup();
    expect(toggleLabels(element)).toEqual([
      "Scroll or two-finger swipe to pan",
      "Pinch to zoom",
      "Cmd + scroll to zoom",
      "Focus pen mode: fingers and palms never draw",
    ]);
    expect(queryAll(element, "select[name^=gesture]")).toHaveLength(0);
  });

  it("should change settings straight away, and follow changes made elsewhere", async () => {
    const { element, settings } = await setup();
    const pinch = query<HTMLInputElement>(element, "input[name=pinchZoom]");
    pinch.click();
    expect(settings.data.pinchZoom).toBe(false);
    settings.update({ focusPen: true });
    await element.updateComplete;
    expect(
      query<HTMLInputElement>(element, "input[name=focusPen]").checked,
    ).toBe(true);
  });

  it("should show touch gestures instead of modifier zoom on touch devices, swapping a gesture another action uses", async () => {
    const { element, settings } = await setup({ touch: true });
    expect(toggleLabels(element)[0]).toBe("Two-finger drag to pan");
    expect(
      element.shadowRoot?.querySelector("input[name=modifierScrollZoom]"),
    ).toBeNull();
    const undo = query<HTMLSelectElement>(element, "select[name=gesture-undo]");
    expect(undo.value).toBe(DEFAULT_GESTURES.undo);
    expect([...undo.options].map((o) => o.textContent?.trim()).at(-1)).toBe(
      "Off",
    );
    undo.value = DEFAULT_GESTURES.redo;
    undo.dispatchEvent(new Event("change"));
    expect(settings.data.gestures.undo).toBe(DEFAULT_GESTURES.redo);
    expect(settings.data.gestures.redo).toBe(DEFAULT_GESTURES.undo);
  });

  it("should hide focus pen mode and the language when asked", async () => {
    const { element } = await setup({ focusPen: false, languages: false });
    expect(toggleLabels(element)).toHaveLength(3);
    expect(
      element.shadowRoot?.querySelector("select[name=language]"),
    ).toBeNull();
  });

  it("should switch the language straight away, and say so", async () => {
    const translations = new Translations();
    const { element } = await setup({ translations });
    const language = query<HTMLSelectElement>(element, "select[name=language]");
    expect([...language.options].map((o) => o.value)).toEqual(
      translations.locales,
    );
    expect(language.value).toBe("en-US");
    const ja = [...language.options].find((o) => o.value === "ja");
    expect([ja?.text.trim(), ja?.lang]).toEqual(["日本語", "ja"]);
    const changes = events(element, "pc-language-change");
    language.value = "ko";
    language.dispatchEvent(new Event("change"));
    await expect.poll(() => changes).toEqual([{ locale: "ko" }]);
    await element.updateComplete;
    expect(toggleLabels(element)[1]).toBe("핀치로 확대/축소");
  });

  it("should detect the device by default", async () => {
    const element = await mount<PcInputSettings>("pc-input-settings");
    expect(typeof element.touch).toBe("boolean");
    expect(["Cmd", "Ctrl"]).toContain(element.modifier);
  });
});
