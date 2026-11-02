import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcIconToggle } from "..";
import { events, mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-icon-toggle", () => {
  it("should show its icon, be named for screen readers, and turn on and off", async () => {
    const toggle = await mount<PcIconToggle>("pc-icon-toggle", {
      icon: "tilt",
      label: "Tilt",
    });
    const changes = events(toggle, "change");
    const input = shadow<HTMLInputElement>(toggle, "input");
    expect([
      input.getAttribute("aria-label"),
      shadow(toggle, "label").title,
    ]).toEqual(["Tilt", "Tilt"]);
    input.click();
    await toggle.updateComplete;
    expect([toggle.checked, toggle.hasAttribute("checked")]).toEqual([
      true,
      true,
    ]);
    expect(changes.at(-1)).toEqual({ checked: true });
    toggle.checked = false;
    await toggle.updateComplete;
    expect(input.checked).toBe(false);
  });

  it("should be disabled", async () => {
    const toggle = await mount<PcIconToggle>("pc-icon-toggle", {
      disabled: true,
    });
    expect(shadow<HTMLInputElement>(toggle, "input").disabled).toBe(true);
  });
});
