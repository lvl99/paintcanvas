import { describe, it, expect } from "vitest";
import "..";
import type { PcNumberSlider } from "..";

/** Press a key on an element */
const press = (target: Element, key: string) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

describe("pc-number-slider in a real browser", () => {
  it("should give focus back to the slider when typing ends with Enter or Escape", async () => {
    const slider = document.createElement("pc-number-slider") as PcNumberSlider;
    slider.value = 20;
    document.body.append(slider);
    await slider.updateComplete;
    const root = slider.shadowRoot!;
    for (const key of ["Enter", "Escape"]) {
      slider.startEditing();
      const field = root.querySelector("input")!;
      expect(root.activeElement).toBe(field);
      field.value = "30";
      // Removing the focused field blurs it in browsers, which mustn't count as leaving it
      press(field, key);
      await slider.updateComplete;
      expect(slider.editing).toBe(false);
      expect(root.activeElement).toBe(root.querySelector("[role=slider]"));
    }
    expect(slider.value).toBe(30);
    slider.remove();
  });
});
