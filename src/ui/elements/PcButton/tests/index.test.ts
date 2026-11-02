import { afterEach, describe, it, expect, vi } from "vitest";
import "..";
import type { PcButton } from "..";
import { mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-button", () => {
  it("should be an affirmative button showing its content", async () => {
    const button = await mount<PcButton>("pc-button", {}, "Save");
    const inner = shadow<HTMLButtonElement>(button, "button");
    expect([button.variant, button.textContent, inner.type]).toEqual([
      "accent",
      "Save",
      "button",
    ]);
    expect(inner.hasAttribute("aria-label")).toBe(false);
    expect(inner.hasAttribute("aria-pressed")).toBe(false);
  });

  it("should name an icon button for screen readers and show whether it's pressed", async () => {
    const button = await mount<PcButton>("pc-button", {
      variant: "icon",
      icon: "undo",
      label: "Undo",
      pressed: false,
    });
    const inner = shadow(button, "button");
    expect(inner.getAttribute("aria-label")).toBe("Undo");
    expect(inner.title).toBe("Undo");
    expect(inner.getAttribute("aria-pressed")).toBe("false");
    expect(shadow(button, "pc-icon").getAttribute("name")).toBe("undo");
  });

  it("should be disabled, and move focus to its button", async () => {
    const button = await mount<PcButton>("pc-button", { disabled: true });
    expect(shadow<HTMLButtonElement>(button, "button").disabled).toBe(true);
    const focus = vi.spyOn(shadow(button, "button"), "focus");
    button.focus();
    expect(focus).toHaveBeenCalled();
  });
});
