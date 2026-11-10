import { describe, it, expect } from "vitest";
import "..";
import type { PcSliderRange } from "..";

describe("pc-slider-range in a real browser", () => {
  it("should draw its rail over the same area as a fill across the whole range", async () => {
    const slider = document.createElement("pc-slider-range") as PcSliderRange;
    Object.assign(slider, { min: 0, max: 100, low: 0, high: 100 });
    slider.style.width = "300px";
    document.body.append(slider);
    await slider.updateComplete;
    const box = (selector: string) =>
      slider.shadowRoot!.querySelector(selector)!.getBoundingClientRect();
    const rail = box(".rail");
    const fill = box(".fill");
    expect([rail.left, rail.right]).toEqual([fill.left, fill.right]);
    slider.remove();
  });
});
