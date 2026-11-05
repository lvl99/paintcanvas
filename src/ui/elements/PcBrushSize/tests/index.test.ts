import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { sizeText, type PcBrushSize } from "..";
import BrushSettings from "../../../../lib/classes/BrushSettings";
import { round } from "../../../../lib/brushes/presets/round";
import { mount, query } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

/** Create a pointer-like event (jsdom has no PointerEvent) */
const pointer = (type: string, clientX: number, clientY: number) =>
  new MouseEvent(type, { clientX, clientY, bubbles: true });

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
  return { settings, element, control: query(element, "[role=slider]") };
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
    expect(element.shadowRoot!.querySelector("[role=slider]")).toBeNull();
  });

  it("should show the size as a slider for screen readers", async () => {
    const { settings, element, control } = await setup();
    expect(control.textContent?.trim()).toBe("20");
    expect(control.getAttribute("aria-label")).toBe("Brush size");
    expect(control.getAttribute("aria-valuemin")).toBe("1");
    expect(control.getAttribute("aria-valuemax")).toBe("256");
    expect(control.getAttribute("aria-valuenow")).toBe("20");
    expect(control.tabIndex).toBe(0);
    settings.update({ constrainProportions: false });
    settings.setSize(10, 30);
    await element.updateComplete;
    expect(control.textContent?.trim()).toBe("10 × 30");
    expect(control.getAttribute("aria-valuenow")).toBe("30");
    expect(control.getAttribute("aria-valuetext")).toBe("10 × 30");
  });

  it("should resize when dragged: right and up bigger, left and down smaller", async () => {
    const { settings, control } = await setup();
    control.dispatchEvent(pointer("pointermove", 50, 0));
    expect(settings.width).toBe(20);
    control.dispatchEvent(pointer("pointerdown", 0, 0));
    control.dispatchEvent(pointer("pointermove", 5, -5));
    expect(settings.width).toBe(30);
    control.dispatchEvent(pointer("pointermove", 0, 0));
    expect(settings.width).toBe(20);
    control.dispatchEvent(pointer("pointerup", 0, 0));
    control.dispatchEvent(pointer("pointermove", 50, 0));
    expect(settings.width).toBe(20);
    control.dispatchEvent(pointer("pointerdown", 0, 0));
    control.dispatchEvent(pointer("pointercancel", 0, 0));
    control.dispatchEvent(pointer("pointermove", 50, 0));
    expect(settings.width).toBe(20);
  });

  it("should resize with the arrow keys and Page Up and Page Down", async () => {
    const { settings, control } = await setup();
    const resize = vi.spyOn(settings, "resize");
    for (const key of ["ArrowUp", "ArrowRight"])
      expect(press(control, key).defaultPrevented).toBe(true);
    expect(settings.width).toBe(22);
    press(control, "ArrowDown");
    press(control, "ArrowLeft");
    expect(settings.width).toBe(20);
    press(control, "PageUp");
    expect(settings.width).toBe(22);
    press(control, "PageDown");
    expect(settings.width).toBe(20);
    resize.mockClear();
    expect(press(control, "a").defaultPrevented).toBe(false);
    expect(resize).not.toHaveBeenCalled();
  });
});
