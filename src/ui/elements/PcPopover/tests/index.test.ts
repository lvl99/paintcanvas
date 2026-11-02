import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcPopover } from "..";
import { events, mount, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-popover", () => {
  it("should take focus when it opens, and ask to close on Escape or a press outside it and its anchor", async () => {
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const popover = await mount<PcPopover>("pc-popover", {
      label: "Brush presets",
      anchor,
    });
    const closes = events(popover, "pc-close");
    const box = shadow(popover, "[role=dialog]");
    expect(box.getAttribute("aria-label")).toBe("Brush presets");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closes).toHaveLength(0);
    popover.open = true;
    await popover.updateComplete;
    expect(popover.shadowRoot!.activeElement).toBe(box);
    box.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    box.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    anchor.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    box.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closes).toHaveLength(2);
    popover.anchor = undefined;
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closes).toHaveLength(3);
    popover.remove();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closes).toHaveLength(3);
  });
});
