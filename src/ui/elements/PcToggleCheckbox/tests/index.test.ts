import { afterEach, describe, it, expect } from "vitest";
import "..";
import { PcToggleCheckbox } from "..";
import { events, mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-toggle-checkbox", () => {
  it("should be a switch with its text, turning on and off", async () => {
    const toggle = await mount<PcToggleCheckbox>(
      "pc-toggle-checkbox",
      {},
      "Pinch to zoom",
    );
    const changes = events(toggle, "change");
    const input = shadow<HTMLInputElement>(toggle, "input");
    expect(input.getAttribute("role")).toBe("switch");
    expect(toggle.textContent).toBe("Pinch to zoom");
    input.click();
    expect([toggle.checked, changes.at(-1)]).toEqual([true, { checked: true }]);
  });

  it("should be 20px high by default, or 16px when small, pressable over 24px", async () => {
    const toggle = await mount<PcToggleCheckbox>(
      "pc-toggle-checkbox",
      {},
      "Show points",
    );
    expect(toggle.size).toBe("m");
    expect(toggle.getAttribute("size")).toBe("m");
    toggle.size = "s";
    await toggle.updateComplete;
    expect(toggle.getAttribute("size")).toBe("s");
    const styles = PcToggleCheckbox.styles.map(String).join("");
    expect(styles).toContain("--pc-toggle-height: 20px");
    expect(styles).toContain(':host([size="s"])');
    expect(styles).toContain("--pc-toggle-height: 16px");
    expect(styles).toContain("min-height: 24px");
  });

  it("should be disabled", async () => {
    const toggle = await mount<PcToggleCheckbox>("pc-toggle-checkbox", {
      disabled: true,
    });
    expect(shadow<HTMLInputElement>(toggle, "input").disabled).toBe(true);
  });
});
