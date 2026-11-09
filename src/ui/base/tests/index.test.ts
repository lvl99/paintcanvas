import { afterEach, describe, it, expect, vi } from "vitest";
import { html } from "lit";
import {
  PcElement,
  TOUCH_FIELD_FONT_SIZE,
  defineElement,
  emit,
  touchFields,
} from "..";
import Translations, { translations } from "../../../lib/i18n";
import { IconRegistry, icons } from "../../icons";
import { mount, shadow } from "../../../testing/elements";

class PcSample extends PcElement {
  override render() {
    return html`<p>
        ${this.t("paintCanvas.tool.brush")} ${this.iconUrl("brush")}
      </p>
      <i>${this.iconUrl("missing")}</i>`;
  }
}
defineElement("pc-sample", PcSample);

afterEach(() => document.body.replaceChildren());

describe("defineElement", () => {
  it("should register an element once", () => {
    const define = vi.spyOn(customElements, "define");
    defineElement("pc-sample", PcSample);
    expect(define).not.toHaveBeenCalled();
    define.mockRestore();
  });
});

describe("emit", () => {
  it("should fire a bubbling, composed, cancellable event with details", () => {
    const target = document.createElement("div");
    const listener = vi.fn((event: Event) => event.preventDefault());
    target.addEventListener("pc-thing", listener);
    expect(emit(target, "pc-thing", { a: 1 })).toBe(false);
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect([event.bubbles, event.composed, event.detail]).toEqual([
      true,
      true,
      { a: 1 },
    ]);
  });
});

describe("PcElement", () => {
  it("should use the shared translations and icons, and re-render when they change", async () => {
    const element = await mount<PcSample>("pc-sample");
    expect(element.translations).toBe(translations);
    expect(element.icons).toBe(icons);
    translations.addStrings("en-US", {
      "paintCanvas.tool.brush": "Paintbrush",
    });
    await element.updateComplete;
    expect(shadow(element, "p").textContent).toContain("Paintbrush");
    expect(() => shadow(element, "nothing")).toThrow("No nothing in PC-SAMPLE");
    expect(shadow(element, "i").textContent).toBe("");
    translations.addStrings("en-US", { "paintCanvas.tool.brush": "Brush" });
  });

  it("should follow translations and icons it's given, and stop listening when removed", async () => {
    const own = new Translations({
      locales: {},
      fallbackStrings: { "paintCanvas.tool.brush": "Pinsel" },
    });
    const ownIcons = new IconRegistry({ brush: "/b.svg" });
    const element = await mount<PcSample>("pc-sample", {
      translations: own,
      icons: ownIcons,
    });
    expect(shadow(element, "p").textContent).toContain("Pinsel /b.svg");
    ownIcons.register({ brush: "/c.svg" });
    await element.updateComplete;
    expect(shadow(element, "p").textContent).toContain("/c.svg");
    element.remove();
    const update = vi.spyOn(element, "requestUpdate");
    ownIcons.register({ brush: "/d.svg" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("touchFields", () => {
  it("should make form fields' text at least 16px on touch screens, in every element", () => {
    expect(TOUCH_FIELD_FONT_SIZE).toBe("16px");
    expect(touchFields.cssText).toContain("@media (pointer: coarse)");
    expect(touchFields.cssText).toContain("max(16px, 1em) !important");
    expect(PcElement.styles).toContain(touchFields);
  });
});
