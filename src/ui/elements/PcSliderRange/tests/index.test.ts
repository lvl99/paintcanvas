import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { rangeFraction, type PcSliderRange, type RangeDetail } from "..";
import type { PcNumberSlider } from "../../PcNumberSlider";
import {
  events,
  mount,
  pointerEvent,
  query,
  queryAll,
} from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

/** A range from 0 to 100 with its track 100px wide from x = 0, so a pixel is a value */
const setup = async (properties: Partial<PcSliderRange> = {}) => {
  const element = await mount<PcSliderRange>("pc-slider-range", {
    label: "Width",
    low: 20,
    high: 60,
    ...properties,
  });
  const track = query(element, ".track");
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 100,
  } as DOMRect);
  const inputs = events<RangeDetail>(element, "pc-input");
  const changes = events<RangeDetail>(element, "pc-change");
  const handle = (end: string) => query(element, `.handle.${end}`);
  const number = (end: string) =>
    query<PcNumberSlider>(element, `pc-number-slider.${end}`);
  return { element, track, inputs, changes, handle, number };
};

describe("rangeFraction", () => {
  it("should give where a value sits between two others, from 0 to 1", () => {
    expect(rangeFraction(25, 0, 100)).toBe(0.25);
    expect(rangeFraction(-5, 0, 100)).toBe(0);
    expect(rangeFraction(150, 0, 100)).toBe(1);
    expect(rangeFraction(5, 5, 5)).toBe(0);
  });
});

describe("pc-slider-range", () => {
  it("should show both ends as handles on a track and as number sliders that can't pass each other", async () => {
    const { element, handle, number } = await setup({ unit: "px" });
    const low = handle("low");
    expect([
      low.getAttribute("role"),
      low.getAttribute("aria-label"),
      low.getAttribute("aria-valuemin"),
      low.getAttribute("aria-valuemax"),
      low.getAttribute("aria-valuenow"),
      low.getAttribute("aria-valuetext"),
      low.style.left,
    ]).toEqual(["slider", "Width (min)", "0", "60", "20", "20px", "20%"]);
    const high = handle("high");
    expect([
      high.getAttribute("aria-label"),
      high.getAttribute("aria-valuemin"),
      high.getAttribute("aria-valuemax"),
      high.style.left,
    ]).toEqual(["Width (max)", "20", "100", "60%"]);
    const fill = query(element, ".fill");
    expect([fill.style.left, fill.style.right]).toEqual(["20%", "40%"]);
    expect([number("low").min, number("low").max, number("low").value]).toEqual(
      [0, 60, 20],
    );
    expect([
      number("high").min,
      number("high").max,
      number("high").value,
      number("high").label,
    ]).toEqual([20, 100, 60, "Width (max)"]);
  });

  it("should move the nearest handle to a press on the track and drag it, telling listeners once let go", async () => {
    const { element, track, inputs, changes, handle } = await setup();
    track.setPointerCapture = vi.fn();
    track.dispatchEvent(pointerEvent("pointerdown", 70, 5));
    await element.updateComplete;
    expect(element.high).toBe(70);
    expect(handle("high").classList).toContain("active");
    expect(element.shadowRoot!.activeElement).toBe(handle("high"));
    expect(track.setPointerCapture).toHaveBeenCalledWith(1);
    // Dragged past the other end, it stops there
    track.dispatchEvent(pointerEvent("pointermove", 10, 5));
    expect([element.low, element.high]).toEqual([20, 20]);
    track.dispatchEvent(pointerEvent("pointerup", 10, 5));
    // Moves after letting go don't drag
    track.dispatchEvent(pointerEvent("pointermove", 90, 5));
    track.dispatchEvent(pointerEvent("pointerup", 90, 5));
    expect(inputs).toEqual([
      { low: 20, high: 70, value: 70 },
      { low: 20, high: 20, value: 20 },
    ]);
    expect(changes).toEqual([{ low: 20, high: 20, value: 20 }]);

    // Below both ends, the low one; off the track, its end
    track.dispatchEvent(pointerEvent("pointerdown", -30, 5));
    track.dispatchEvent(pointerEvent("pointercancel", -30, 5));
    expect(element.low).toBe(0);
    // Above both, the high one; where they meet, the low one
    track.dispatchEvent(pointerEvent("pointerdown", 0, 5));
    track.dispatchEvent(pointerEvent("pointerup", 0, 5));
    expect([element.low, element.high]).toEqual([0, 20]);
    track.dispatchEvent(pointerEvent("pointerdown", 150, 5));
    track.dispatchEvent(pointerEvent("pointerup", 150, 5));
    expect(element.high).toBe(100);
  });

  it("should pick the nearer end inside the range", async () => {
    const { element, track } = await setup();
    track.dispatchEvent(pointerEvent("pointerdown", 30, 5));
    track.dispatchEvent(pointerEvent("pointerup", 30, 5));
    track.dispatchEvent(pointerEvent("pointerdown", 50, 5));
    track.dispatchEvent(pointerEvent("pointerup", 50, 5));
    expect([element.low, element.high]).toEqual([30, 50]);
  });

  it("should ignore presses while disabled, other buttons, and a track with no width", async () => {
    const { element, track, inputs } = await setup({ disabled: true });
    track.dispatchEvent(pointerEvent("pointerdown", 70, 5));
    element.disabled = false;
    await element.updateComplete;
    track.dispatchEvent(pointerEvent("pointerdown", 70, 5, { button: 2 }));
    expect(inputs).toHaveLength(0);
    vi.mocked(track.getBoundingClientRect).mockReturnValue({
      left: 0,
      width: 0,
    } as DOMRect);
    track.dispatchEvent(pointerEvent("pointerdown", 70, 5));
    expect(element.low).toBe(0);
  });

  it("should move a focused handle with the keyboard", async () => {
    const { element, handle, changes } = await setup({ step: 2 });
    const press = (end: string, key: string) => {
      const event = new KeyboardEvent("keydown", { key, cancelable: true });
      handle(end).dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press("low", "ArrowRight")).toBe(true);
    press("low", "ArrowUp");
    expect(element.low).toBe(24);
    press("low", "ArrowLeft");
    press("low", "ArrowDown");
    expect(element.low).toBe(20);
    press("low", "PageUp");
    expect(element.low).toBe(40);
    press("low", "PageDown");
    press("low", "Home");
    expect(element.low).toBe(0);
    // As far as it can go: not past the other end
    press("low", "End");
    expect(element.low).toBe(60);
    press("high", "Home");
    expect(element.high).toBe(60);
    press("high", "End");
    expect(element.high).toBe(100);
    expect(press("high", "a")).toBe(false);
    element.pageStep = 6;
    press("high", "PageDown");
    expect(element.high).toBe(94);
    expect(changes.at(-1)).toEqual({ low: 60, high: 94, value: 94 });
    // Nothing while disabled
    element.disabled = true;
    await element.updateComplete;
    expect(handle("low").getAttribute("tabindex")).toBe("-1");
    expect(handle("low").getAttribute("aria-disabled")).toBe("true");
    expect(press("low", "Home")).toBe(false);
  });

  it("should change an end from its number slider, without passing on the slider's own event", async () => {
    const { element, number, changes } = await setup();
    const values: unknown[] = [];
    element.addEventListener("pc-change", (event) =>
      values.push((event as CustomEvent).detail),
    );
    number("high").dispatchEvent(
      new CustomEvent("pc-change", {
        detail: { value: 45 },
        bubbles: true,
        composed: true,
      }),
    );
    expect(element.high).toBe(45);
    expect(changes).toEqual([{ low: 20, high: 45, value: 45 }]);
    expect(values).toEqual([{ low: 20, high: 45, value: 45 }]);
  });

  it("should round values to the step, keep them within the limits, and not tell listeners when nothing changed", async () => {
    const { element, changes } = await setup({ step: 5 });
    element.setEnd("low", 23);
    expect(element.low).toBe(25);
    element.setEnd("low", 26);
    expect(changes).toHaveLength(1);
    element.setEnd("high", 500);
    expect(element.high).toBe(100);
  });

  it("should be a slider for one value, from the minimum, with its number slider before or after the track", async () => {
    const { element, track, handle, number, changes } = await setup({
      single: true,
      value: 30,
      unit: "%",
    });
    expect(element.high).toBe(30);
    expect(queryAll(element, ".handle")).toHaveLength(1);
    expect(queryAll(element, "pc-number-slider")).toHaveLength(1);
    const high = handle("high");
    expect([
      high.getAttribute("aria-label"),
      high.getAttribute("aria-valuemin"),
      high.getAttribute("aria-valuemax"),
    ]).toEqual(["Width", "0", "100"]);
    expect([number("high").label, number("high").min]).toEqual(["Width", 0]);
    const fill = query(element, ".fill");
    expect([fill.style.left, fill.style.right]).toEqual(["0%", "70%"]);
    // The number slider comes first by default
    const order = () =>
      [...element.shadowRoot!.children]
        .map((child) => child.localName)
        .filter((name) => name !== "style");
    expect(order()).toEqual(["pc-number-slider", "div"]);
    element.numberPosition = "end";
    await element.updateComplete;
    expect(order()).toEqual(["div", "pc-number-slider"]);
    // Below the old low end: the one handle moves, as far as the minimum
    track.dispatchEvent(pointerEvent("pointerdown", 5, 5));
    track.dispatchEvent(pointerEvent("pointerup", 5, 5));
    expect(element.value).toBe(5);
    expect(changes.at(-1)).toEqual({ low: 20, high: 5, value: 5 });
    element.setEnd("high", -10);
    expect(element.value).toBe(0);
  });
});
