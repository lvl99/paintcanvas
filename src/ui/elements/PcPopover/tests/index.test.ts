import { afterEach, describe, it, expect } from "vitest";
import "..";
import { popoverBelow, type PcPopover } from "..";
import { events, mount, shadow } from "../../../../testing/elements";
import { isDismissingPress } from "../../../dismiss";

afterEach(() => document.body.replaceChildren());

describe("popoverBelow", () => {
  it("should centre the popover under its anchor, in the window, with its arrow at the anchor's centre", () => {
    const anchor = { left: 100, bottom: 40, width: 40 };
    expect(popoverBelow(anchor, 200, 1000)).toEqual({
      left: 20,
      top: 48,
      arrowX: 100,
    });
    expect(popoverBelow({ ...anchor, left: 0 }, 200, 1000)).toEqual({
      left: 8,
      top: 48,
      arrowX: 12,
    });
    expect(popoverBelow({ ...anchor, left: 960 }, 200, 1000)).toEqual({
      left: 792,
      top: 48,
      arrowX: 188,
    });
  });
});

describe("pc-popover", () => {
  it("should be placed under its anchor, with its arrow pointing at it", async () => {
    const popover = await mount<PcPopover>("pc-popover", { arrow: true });
    expect(popover.hasAttribute("arrow")).toBe(true);
    // Without an anchor, it stays where it is
    popover.placeBelow();
    expect(popover.style.position).toBe("");
    const anchor = document.createElement("button");
    anchor.getBoundingClientRect = () =>
      ({ left: 100, bottom: 40, width: 40 }) as DOMRect;
    popover.anchor = anchor;
    popover.placeBelow();
    expect(popover.style.position).toBe("fixed");
    expect(popover.style.left).toBe("120px");
    expect(popover.style.top).toBe("48px");
    expect(popover.style.getPropertyValue("--pc-popover-arrow-x")).toBe("0px");
  });

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
    const outside = new Event("pointerdown", { bubbles: true });
    document.body.dispatchEvent(outside);
    expect(closes).toHaveLength(2);
    expect(isDismissingPress(outside)).toBe(true);
    popover.anchor = undefined;
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closes).toHaveLength(3);
    popover.remove();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closes).toHaveLength(3);
  });
});
