import { describe, it, expect, afterEach } from "vitest";
import { askConfirm, askText, OK_CHOICE } from "..";
import type { PcDialog } from "../../elements/PcDialog";
import { CANCEL_CHOICE } from "../../elements/PcDialog";

afterEach(() => document.body.replaceChildren());

/** The dialog being shown, once it has rendered */
const shown = async () => {
  const dialog = document.querySelector("pc-dialog") as PcDialog;
  await dialog.updateComplete;
  return dialog;
};

describe("askConfirm", () => {
  it("should ask in a dialog, resolving true if the user agrees, then remove it", async () => {
    const chosen: unknown[] = [];
    document.body.addEventListener("pc-choose", (event) => chosen.push(event));
    const answer = askConfirm(document.body, {
      heading: "Delete preset",
      message: 'Delete "Ink"?',
      confirm: "Delete",
      cancel: "Cancel",
      cancelling: true,
    });
    const dialog = await shown();
    expect([dialog.heading, dialog.message]).toEqual([
      "Delete preset",
      'Delete "Ink"?',
    ]);
    expect(dialog.choices).toEqual([
      { value: OK_CHOICE, label: "Delete", cancelling: true },
      { value: CANCEL_CHOICE, label: "Cancel", variant: "dismiss" },
    ]);
    dialog.choose(OK_CHOICE);
    await expect(answer).resolves.toBe(true);
    expect(document.querySelector("pc-dialog")).toBeNull();
    // The choice doesn't reach the parent
    expect(chosen).toHaveLength(0);
  });

  it("should resolve false when cancelled", async () => {
    const answer = askConfirm(document.body, {
      heading: "Replace preset",
      confirm: "Replace",
      cancel: "Cancel",
    });
    const dialog = await shown();
    expect(dialog.message).toBe("");
    dialog.choose(CANCEL_CHOICE);
    await expect(answer).resolves.toBe(false);
  });
});

describe("askText", () => {
  it("should ask for text in a dialog, resolving with what the user typed, or null if they cancel", async () => {
    const answer = askText(document.body, {
      heading: "Add to presets",
      label: "Name",
      value: "Ink",
      confirm: "Save",
      cancel: "Cancel",
    });
    const dialog = await shown();
    expect(dialog.field).toEqual({ label: "Name", value: "Ink" });
    (dialog.shadowRoot?.querySelector("input") as HTMLInputElement).value =
      "Ink 2";
    dialog.choose(OK_CHOICE);
    await expect(answer).resolves.toBe("Ink 2");

    const cancelled = askText(document.body, {
      heading: "Add to presets",
      label: "Name",
      value: "",
      confirm: "Save",
      cancel: "Cancel",
    });
    (await shown()).choose(CANCEL_CHOICE);
    await expect(cancelled).resolves.toBeNull();
  });
});
