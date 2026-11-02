import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcInfoTip } from "..";
import { mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-info-tip", () => {
  it("should show and hide its explanation, closing on Escape, blur or a press outside", async () => {
    const tip = await mount<PcInfoTip>("pc-info-tip", {}, "Explained");
    const button = shadow<HTMLButtonElement>(tip, "button");
    expect(button.getAttribute("aria-label")).toBe("More information");
    expect(tip.shadowRoot!.querySelector("[role=tooltip]")).toBeNull();
    const reopen = async () => {
      tip.open = true;
      await tip.updateComplete;
    };
    button.click();
    await tip.updateComplete;
    expect([
      button.getAttribute("aria-expanded"),
      button.getAttribute("aria-describedby"),
    ]).toEqual(["true", "tip"]);
    button.click();
    expect(tip.open).toBe(false);
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await reopen();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(tip.open).toBe(true);
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(tip.open).toBe(false);
    await reopen();
    button.dispatchEvent(new Event("blur"));
    expect(tip.open).toBe(false);
    await reopen();
    button.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    expect(tip.open).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(tip.open).toBe(false);
    tip.remove();
  });

  it("should use the label given", async () => {
    const tip = await mount<PcInfoTip>("pc-info-tip", {
      label: "About focus pen",
    });
    expect(shadow(tip, "button").getAttribute("aria-label")).toBe(
      "About focus pen",
    );
  });
});
