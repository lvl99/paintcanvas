import { describe, it, expect, afterEach } from "vitest";
import "..";
import { fitNumber, type PcNumberSlider } from "..";
import {
  events,
  mount,
  pointerEvent,
  query,
} from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

/** Press a key on an element */
const press = (target: Element, key: string) => {
  const event = new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    bubbles: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
};

/** A slider from 1 to 256 at 20, and its changes */
const setup = async (properties: Partial<PcNumberSlider> = {}) => {
  const element = await mount<PcNumberSlider>("pc-number-slider", {
    min: 1,
    max: 256,
    value: 20,
    label: "Width",
    ...properties,
  });
  const changes = events<{ value: number }>(element, "pc-change");
  return {
    element,
    changes,
    control: () => query(element, "[role=slider]"),
    field: () => query<HTMLInputElement>(element, "input"),
  };
};

/** Tap the control: press and let go without moving */
const tap = (control: Element) => {
  control.dispatchEvent(pointerEvent("pointerdown", 0, 0));
  control.dispatchEvent(pointerEvent("pointermove", 2, 1));
  control.dispatchEvent(pointerEvent("pointerup", 2, 1));
};

describe("fitNumber", () => {
  it("should keep a number within its range, at a multiple of the step", () => {
    expect(fitNumber(300, 1, 256, 1)).toBe(256);
    expect(fitNumber(-5, 1, 256, 1)).toBe(1);
    expect(fitNumber(12.4, 0, 100, 5)).toBe(10);
    expect(fitNumber(20.6, 1, 256, 1)).toBe(21);
  });
});

describe("pc-number-slider", () => {
  it("should have defaults", async () => {
    const element = await mount<PcNumberSlider>("pc-number-slider");
    expect([element.value, element.min, element.max, element.step]).toEqual([
      0, 0, 100, 1,
    ]);
    const control = query(element, "[role=slider]");
    expect(control.hasAttribute("aria-label")).toBe(false);
    expect(control.textContent?.trim()).toBe("0");
    element.startEditing();
    expect(query(element, "input").hasAttribute("aria-label")).toBe(false);
  });

  it("should show its value, unit or text as a slider for screen readers", async () => {
    const { element, control } = await setup({ unit: "%" });
    expect(control().textContent?.trim()).toBe("20%");
    expect(control().getAttribute("aria-label")).toBe("Width");
    expect(control().getAttribute("aria-valuemin")).toBe("1");
    expect(control().getAttribute("aria-valuemax")).toBe("256");
    expect(control().getAttribute("aria-valuenow")).toBe("20");
    expect(control().getAttribute("aria-valuetext")).toBe("20%");
    expect(control().title).toBe("Drag sideways to change, or tap to type");
    expect(control().tabIndex).toBe(0);
    element.text = "30 × 10";
    await element.updateComplete;
    expect(control().textContent?.trim()).toBe("30 × 10");
    expect(control().getAttribute("aria-valuetext")).toBe("30 × 10");
  });

  it("should change when dragged: right and up more, left and down less", async () => {
    const { element, changes, control } = await setup();
    control().dispatchEvent(pointerEvent("pointerdown", 0, 0));
    control().dispatchEvent(pointerEvent("pointermove", 3, 0));
    expect(element.value).toBe(20);
    control().dispatchEvent(pointerEvent("pointermove", 5, -5));
    expect(element.value).toBe(30);
    control().dispatchEvent(pointerEvent("pointermove", -300, 0));
    expect(element.value).toBe(1);
    control().dispatchEvent(pointerEvent("pointermove", -400, 0));
    control().dispatchEvent(pointerEvent("pointerup", -400, 0));
    expect(changes).toEqual([{ value: 30 }, { value: 1 }]);
    // A drag isn't a tap
    expect(element.editing).toBe(false);
  });

  it("should drag by its step", async () => {
    const { element, control } = await setup({ min: 0, max: 100, step: 5 });
    control().dispatchEvent(pointerEvent("pointerdown", 0, 0));
    control().dispatchEvent(pointerEvent("pointermove", 4, 0));
    expect(element.value).toBe(40);
    control().dispatchEvent(pointerEvent("pointercancel", 4, 0));
    control().dispatchEvent(pointerEvent("pointermove", 50, 0));
    expect(element.value).toBe(40);
  });

  it("should change with the arrow keys, Page Up and Down, Home and End", async () => {
    const { element, control } = await setup();
    for (const key of ["ArrowUp", "ArrowRight"])
      expect(press(control(), key).defaultPrevented).toBe(true);
    expect(element.value).toBe(22);
    press(control(), "ArrowDown");
    press(control(), "ArrowLeft");
    expect(element.value).toBe(20);
    press(control(), "PageUp");
    expect(element.value).toBe(30);
    element.pageStep = 2;
    press(control(), "PageDown");
    expect(element.value).toBe(28);
    press(control(), "End");
    expect(element.value).toBe(256);
    press(control(), "Home");
    expect(element.value).toBe(1);
    expect(press(control(), "a").defaultPrevented).toBe(false);
  });

  it("should turn into a field to type in when tapped, keeping the value with Enter", async () => {
    const { element, changes, control, field } = await setup();
    tap(control());
    expect(element.editing).toBe(true);
    expect(element.shadowRoot!.activeElement).toBe(field());
    expect(field().value).toBe("20");
    expect(field().getAttribute("aria-label")).toBe("Width");
    const typed = field();
    typed.value = " 300 ";
    const enter = press(typed, "Enter");
    expect(enter.defaultPrevented).toBe(true);
    await element.updateComplete;
    expect(element.editing).toBe(false);
    expect(element.value).toBe(256);
    expect(changes).toEqual([{ value: 256 }]);
    // The removed field losing focus afterwards changes nothing
    typed.dispatchEvent(new FocusEvent("blur"));
    expect(changes).toHaveLength(1);
    // Focus returns to the slider
    expect(element.shadowRoot!.activeElement).toBe(control());
  });

  it("should cancel typing with Escape, and ignore other keys and values that aren't numbers", async () => {
    const { element, changes, control, field } = await setup();
    const reachedPage: string[] = [];
    document.body.addEventListener("keydown", (e) => reachedPage.push(e.key));
    press(control(), "Enter");
    expect(element.editing).toBe(true);
    field().value = "50";
    expect(press(field(), "a").defaultPrevented).toBe(false);
    press(field(), "Escape");
    expect(reachedPage).not.toContain("Escape");
    await element.updateComplete;
    expect(element.value).toBe(20);
    press(control(), "F2");
    field().value = "abc";
    press(field(), "Enter");
    await element.updateComplete;
    press(control(), "F2");
    field().value = "";
    press(field(), "Enter");
    await element.updateComplete;
    expect(element.value).toBe(20);
    expect(changes).toEqual([]);
  });

  it("should keep the typed value when the field loses focus, leaving focus there", async () => {
    const { element, control, field } = await setup();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    tap(control());
    field().value = "42";
    elsewhere.focus();
    await element.updateComplete;
    expect(element.value).toBe(42);
    expect(element.editing).toBe(false);
    expect(document.activeElement).toBe(elsewhere);
  });

  it("should do nothing while disabled, and stop typing when disabled", async () => {
    const { element, changes, control } = await setup();
    tap(control());
    element.disabled = true;
    await element.updateComplete;
    expect(element.editing).toBe(false);
    expect(control().tabIndex).toBe(-1);
    expect(control().getAttribute("aria-disabled")).toBe("true");
    tap(control());
    control().dispatchEvent(pointerEvent("pointerdown", 0, 0));
    control().dispatchEvent(pointerEvent("pointermove", 50, 0));
    control().dispatchEvent(pointerEvent("pointerup", 50, 0));
    press(control(), "ArrowUp");
    element.startEditing();
    expect(element.editing).toBe(false);
    expect(element.value).toBe(20);
    expect(changes).toEqual([]);
  });
});
