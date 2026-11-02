import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcContextMenu } from "..";
import { events, mount } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

const items = [
  { value: "duplicate", label: "Duplicate" },
  { value: "merge", label: "Merge down…", disabled: true },
  { value: "clear", label: "Clear" },
  { value: "delete", label: "Delete", danger: true },
];

/** The menu's item buttons */
const buttons = (menu: PcContextMenu) => [
  ...menu.shadowRoot!.querySelectorAll<HTMLButtonElement>("[role=menuitem]"),
];

/** The focused element inside the menu */
const focused = (menu: PcContextMenu) => menu.shadowRoot!.activeElement;

/** Press a key in the menu */
const press = (menu: PcContextMenu, key: string) =>
  menu
    .shadowRoot!.querySelector("[role=menu]")!
    .dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );

describe("pc-context-menu", () => {
  it("should show its items where asked, focusing the first when it opens", async () => {
    const menu = await mount<PcContextMenu>("pc-context-menu", {
      items,
      label: "Layer actions",
      x: 10,
      y: 20,
    });
    expect([menu.style.left, menu.style.top]).toEqual(["10px", "20px"]);
    expect(
      menu.shadowRoot!.querySelector("[role=menu]")!.getAttribute("aria-label"),
    ).toBe("Layer actions");
    expect(
      buttons(menu).map((b) => [
        b.textContent?.trim(),
        b.disabled,
        b.className,
      ]),
    ).toEqual([
      ["Duplicate", false, ""],
      ["Merge down…", true, ""],
      ["Clear", false, ""],
      ["Delete", false, "danger"],
    ]);
    menu.open = true;
    await menu.updateComplete;
    expect(focused(menu)).toBe(buttons(menu)[0]);
  });

  it("should move focus with the arrow keys, Home and End, skipping disabled items", async () => {
    const menu = await mount<PcContextMenu>("pc-context-menu", {
      items,
      open: true,
    });
    const [duplicate, , clear, remove] = buttons(menu);
    press(menu, "ArrowDown");
    expect(focused(menu)).toBe(clear);
    press(menu, "End");
    expect(focused(menu)).toBe(remove);
    press(menu, "ArrowDown");
    expect(focused(menu)).toBe(duplicate);
    press(menu, "ArrowUp");
    expect(focused(menu)).toBe(remove);
    press(menu, "Home");
    press(menu, "ArrowUp");
    expect(focused(menu)).toBe(remove);
    press(menu, "a");
    expect(focused(menu)).toBe(remove);
  });

  it("should choose an item and close, or close on Escape, Tab or a press outside", async () => {
    const menu = await mount<PcContextMenu>("pc-context-menu", {
      items,
      open: true,
    });
    const chosen = events(menu, "pc-select");
    const closes = events(menu, "pc-close");
    buttons(menu)[2]!.click();
    expect(chosen).toEqual([{ value: "clear" }]);
    press(menu, "Escape");
    press(menu, "Tab");
    menu
      .shadowRoot!.querySelector("button")!
      .dispatchEvent(
        new Event("pointerdown", { bubbles: true, composed: true }),
      );
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closes).toHaveLength(4);
    menu.open = false;
    await menu.updateComplete;
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    menu.remove();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(closes).toHaveLength(4);
  });
});
