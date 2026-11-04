import { afterEach, describe, it, expect } from "vitest";
import "..";
import type { PcContextMenu } from "..";
import { events, mount } from "../../../../testing/elements";
import {
  ariaKeyShortcut,
  shortcutLabel,
} from "../../../../lib/utils/shortcuts";

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

describe("pc-context-menu item extras", () => {
  const extras = [
    { value: "save", label: "Save", shortcut: { key: "s", cmd: true } },
    { value: "grid", label: "Show grid", checked: true },
    { value: "rulers", label: "Show rulers", checked: false },
    { value: "brush", label: "Brush", icon: "brush" },
    {
      value: "fill",
      label: "Fill with background colour",
      shortcut: { key: "backspace", alt: true },
    },
    {
      value: "long",
      label: "Long shortcut",
      shortcut: { key: "z", ctrl: true, alt: true, shift: true, cmd: true },
    },
  ];

  /** Each button's left text, label and right text */
  const parts = (menu: PcContextMenu) =>
    [...menu.shadowRoot!.querySelectorAll("button")].map((button) => [
      button.querySelector(".start")?.textContent?.trim() ??
        button.querySelector(".start pc-icon")?.getAttribute("name"),
      button.querySelector(".label")!.textContent,
      button.querySelector(".end")?.textContent ?? null,
    ]);

  it("should show checkmarks and icons on the left, and short shortcuts on the right", async () => {
    const menu = await mount<PcContextMenu>("pc-context-menu", {
      items: extras,
    });
    const cmd = shortcutLabel({ key: "s", cmd: true });
    expect(parts(menu)).toEqual([
      ["", "Save", cmd],
      ["✔", "Show grid", null],
      ["", "Show rulers", null],
      ["", "Brush", null],
      ["", "Fill with background colour", "⌥⌫"],
      // ^⌥⇧⌘Z is longer than 3 characters
      ["", "Long shortcut", null],
    ]);
    const brush = menu.shadowRoot!.querySelector('[data-value="brush"]')!;
    expect(brush.querySelector(".start pc-icon")!.getAttribute("name")).toBe(
      "brush",
    );
  });

  it("should mark toggles and shortcuts for screen readers", async () => {
    const menu = await mount<PcContextMenu>("pc-context-menu", {
      items: extras,
    });
    const button = (value: string) =>
      menu.shadowRoot!.querySelector(`[data-value="${value}"]`)!;
    expect(button("grid").getAttribute("role")).toBe("menuitemcheckbox");
    expect(button("grid").getAttribute("aria-checked")).toBe("true");
    expect(button("rulers").getAttribute("aria-checked")).toBe("false");
    expect(button("save").getAttribute("role")).toBe("menuitem");
    expect(button("save").hasAttribute("aria-checked")).toBe(false);
    expect(button("save").getAttribute("aria-keyshortcuts")).toBe(
      ariaKeyShortcut({ key: "s", cmd: true }),
    );
    expect(button("grid").hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(
      button("save").querySelector(".end")!.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("should leave out the left space when no item uses it", async () => {
    const menu = await mount<PcContextMenu>("pc-context-menu", {
      items: extras.slice(0, 1),
    });
    expect(menu.shadowRoot!.querySelector(".start")).toBeNull();
  });
});
