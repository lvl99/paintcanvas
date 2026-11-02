import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcSlider } from "..";
import { events, mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-slider", () => {
  it("should show its label and value, and report sliding and letting go", async () => {
    const slider = await mount<PcSlider>("pc-slider", {
      label: "Opacity",
      min: 0,
      max: 100,
      step: 5,
      value: 50,
      unit: "%",
    });
    const input = shadow<HTMLInputElement>(slider, "input");
    expect([input.min, input.max, input.step, input.value]).toEqual([
      "0",
      "100",
      "5",
      "50",
    ]);
    expect(shadow(slider, "output").textContent).toBe("50%");
    const inputs = events(slider, "input");
    const changes = events(slider, "change");
    input.value = "75";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("change"));
    await slider.updateComplete;
    expect([slider.value, inputs.at(-1), changes.at(-1)]).toEqual([
      75,
      { value: 75 },
      { value: 75 },
    ]);
    expect(shadow(slider, "output").textContent).toBe("75%");
  });

  it("should show the value alone without a unit, and be disabled", async () => {
    const slider = await mount<PcSlider>("pc-slider", {
      value: 3,
      disabled: true,
    });
    expect(shadow(slider, "output").textContent).toBe("3");
    expect(shadow<HTMLInputElement>(slider, "input").disabled).toBe(true);
  });
});
