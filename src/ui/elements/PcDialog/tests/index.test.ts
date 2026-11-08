import { afterEach, describe, it, expect, vi } from "vitest";
import "..";
import { CANCEL_CHOICE, type DialogChoiceDetail, type PcDialog } from "..";
import type { PcDialogWindow } from "../../PcDialogWindow";
import { events, mount, queryAll, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

/** The window a dialog is shown in */
const windowOf = (dialog: PcDialog) =>
  shadow<PcDialogWindow>(dialog, "pc-dialog-window");

describe("pc-dialog", () => {
  it("should ask in a shaded modal window with a heading, message and choices, styling cancelling ones, and focus the first", async () => {
    const dialog = await mount<PcDialog>(
      "pc-dialog",
      {
        heading: "Delete layer",
        message: 'Delete "Sketch"?',
        choices: [
          { value: "delete", label: "Delete", cancelling: true },
          { value: "keep", label: "Keep" },
          { value: CANCEL_CHOICE, label: "Cancel" },
        ],
      },
      "<img alt='Preview' />",
    );
    const window = windowOf(dialog);
    await window.updateComplete;
    expect([
      window.open,
      window.shaded,
      window.closable,
      window.dismissible,
      window.inline,
      window.description,
    ]).toEqual([true, true, false, true, false, 'Delete "Sketch"?']);
    expect(shadow(dialog, "h2").slot).toBe("header-middle");
    expect(shadow(dialog, "h2").textContent).toBe("Delete layer");
    expect(shadow(dialog, "p").textContent).toBe('Delete "Sketch"?');
    expect(shadow(dialog, ".choices").slot).toBe("footer-middle");
    const buttons = queryAll(dialog, "pc-button");
    expect(buttons.map((b) => b.getAttribute("variant"))).toEqual([
      "cancel",
      "accent",
      "cancel",
    ]);
    await vi.waitFor(() =>
      expect(dialog.shadowRoot!.activeElement).toBe(buttons[0]),
    );
    const chosen = events<DialogChoiceDetail>(dialog, "pc-choose");
    (buttons[1] as HTMLElement).click();
    // Escape and presses outside cancel, and leave it showing for whoever showed it to remove
    window.requestClose("escape");
    window.requestClose("outside");
    expect(chosen).toEqual([
      { value: "keep" },
      { value: CANCEL_CHOICE },
      { value: CANCEL_CHOICE },
    ]);
    expect(window.open).toBe(true);
  });

  it("should style a choice as it asks", async () => {
    const dialog = await mount<PcDialog>("pc-dialog", {
      heading: "Clear layer",
      choices: [
        { value: "clear", label: "Clear" },
        { value: "cancel", label: "Dismiss", variant: "dismiss" },
      ],
    });
    expect(
      queryAll(dialog, "pc-button").map((button) =>
        button.getAttribute("variant"),
      ),
    ).toEqual(["accent", "dismiss"]);
  });

  it("should focus nothing without choices", async () => {
    const dialog = await mount<PcDialog>("pc-dialog", { heading: "Wait" });
    await windowOf(dialog).updateComplete;
    expect(dialog.shadowRoot!.activeElement).toBeNull();
  });

  it("should leave out an empty message", async () => {
    const dialog = await mount<PcDialog>("pc-dialog", { heading: "Hi" });
    expect(queryAll(dialog, "p")).toHaveLength(0);
    expect(windowOf(dialog).description).toBeUndefined();
  });

  it("should ask for text in a field, focused and selected, giving it with the choice", async () => {
    const dialog = await mount<PcDialog>("pc-dialog", {
      heading: "Add to presets",
      field: { label: "Name", value: "Ink" },
      choices: [
        { value: CANCEL_CHOICE, label: "Cancel" },
        { value: "remove", label: "Remove", cancelling: true },
        { value: "save", label: "Save" },
      ],
    });
    const input = shadow<HTMLInputElement>(dialog, "input");
    expect(shadow(dialog, "label").textContent?.trim()).toBe("Name");
    expect(input.value).toBe("Ink");
    await vi.waitFor(() =>
      expect(dialog.shadowRoot!.activeElement).toBe(input),
    );
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
    const chosen = events<DialogChoiceDetail>(dialog, "pc-choose");
    input.value = "Ink 2";
    // Other keys type; Enter chooses the first choice that isn't cancelling
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    dialog.choose(CANCEL_CHOICE);
    expect(chosen).toEqual([
      { value: "save", text: "Ink 2" },
      { value: CANCEL_CHOICE, text: "Ink 2" },
    ]);
  });

  it("should do nothing on Enter in the field without a choice that agrees", async () => {
    const dialog = await mount<PcDialog>("pc-dialog", {
      heading: "Name",
      field: { label: "Name", value: "" },
      choices: [{ value: CANCEL_CHOICE, label: "Cancel" }],
    });
    const chosen = events(dialog, "pc-choose");
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    shadow(dialog, "input").dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(chosen).toHaveLength(0);
  });

  it("should stay put when not dismissible, and cover only its positioned ancestor while inline", async () => {
    const dialog = await mount<PcDialog>("pc-dialog", {
      heading: "Elsewhere",
      dismissible: false,
      inline: true,
    });
    const window = windowOf(dialog);
    expect([window.dismissible, window.inline]).toEqual([false, true]);
  });
});
