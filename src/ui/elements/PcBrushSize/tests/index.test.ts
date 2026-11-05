import { describe, it, expect, afterEach } from "vitest";
import "..";
import { sizeText, type PcBrushSize } from "..";
import type { PcNumberSlider } from "../../PcNumberSlider";
import BrushSettings from "../../../../lib/classes/BrushSettings";
import { round } from "../../../../lib/brushes/presets/round";
import { mount, pointerEvent, query } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

/** Press a key on the control */
const press = (control: HTMLElement, key: string) => {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  control.dispatchEvent(event);
  return event;
};

/** A brush at 20 pixels, and a size control for it */
const setup = async () => {
  const settings = new BrushSettings(round);
  settings.select("round20");
  const element = await mount<PcBrushSize>("pc-brush-size", {
    settings,
    label: "Brush size",
  });
  const slider = query<PcNumberSlider>(element, "pc-number-slider");
  return { settings, element, slider, control: query(slider, "[role=slider]") };
};

/** Type a value into the slider and press Enter */
const type = async (slider: PcNumberSlider, value: string) => {
  slider.startEditing();
  const field = query<HTMLInputElement>(slider, "input");
  field.value = value;
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
  );
  await slider.updateComplete;
};

describe("sizeText", () => {
  it("should show one number for equal sides, otherwise both", () => {
    expect(sizeText({ width: 20, height: 20 })).toBe("20");
    expect(sizeText({ width: 30, height: 10 })).toBe("30 × 10");
  });
});

describe("pc-brush-size", () => {
  it("should render nothing without settings", async () => {
    const element = await mount<PcBrushSize>("pc-brush-size");
    expect(element.shadowRoot!.querySelector("pc-number-slider")).toBeNull();
  });

  it("should show the size as a slider for screen readers", async () => {
    const { settings, element, slider, control } = await setup();
    expect(control.textContent?.trim()).toBe("20");
    expect(control.getAttribute("aria-label")).toBe("Brush size");
    expect(control.getAttribute("aria-valuemin")).toBe("1");
    expect(control.getAttribute("aria-valuemax")).toBe("256");
    expect(control.getAttribute("aria-valuenow")).toBe("20");
    settings.update({ constrainProportions: false });
    settings.setSize(10, 30);
    await element.updateComplete;
    await slider.updateComplete;
    expect(control.textContent?.trim()).toBe("10 × 30");
    expect(control.getAttribute("aria-valuenow")).toBe("30");
    expect(control.getAttribute("aria-valuetext")).toBe("10 × 30");
  });

  it("should resize when dragged: right and up bigger, left and down smaller", async () => {
    const { settings, control } = await setup();
    control.dispatchEvent(pointerEvent("pointerdown", 0, 0));
    control.dispatchEvent(pointerEvent("pointermove", 5, -5));
    expect(settings.width).toBe(30);
    control.dispatchEvent(pointerEvent("pointermove", 0, 0));
    expect(settings.width).toBe(20);
    control.dispatchEvent(pointerEvent("pointerup", 0, 0));
  });

  it("should resize with the arrow keys and Page Up and Page Down", async () => {
    const { settings, element, slider, control } = await setup();
    press(control, "ArrowUp");
    press(control, "ArrowRight");
    expect(settings.width).toBe(22);
    press(control, "ArrowDown");
    press(control, "ArrowLeft");
    expect(settings.width).toBe(20);
    press(control, "PageUp");
    expect(settings.width).toBe(22);
    await element.updateComplete;
    await slider.updateComplete;
    press(control, "PageDown");
    expect(settings.width).toBe(20);
  });

  it("should resize to a typed size, keeping the proportions", async () => {
    const { settings, element, slider } = await setup();
    settings.update({ constrainProportions: false });
    settings.setSize(30, 10);
    settings.update({ constrainProportions: true });
    await element.updateComplete;
    await type(slider, "60");
    expect([settings.width, settings.height]).toEqual([60, 20]);
    // The smaller side stops at 1 pixel, and the slider shows the size it got
    await type(slider, "1");
    await element.updateComplete;
    await slider.updateComplete;
    expect([settings.width, settings.height]).toEqual([3, 1]);
    expect(slider.value).toBe(3);
  });
});
