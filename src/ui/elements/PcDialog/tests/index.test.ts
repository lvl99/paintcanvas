import { afterEach, describe, it, expect } from "vitest";
import "..";
import { CANCEL_CHOICE, type PcDialog } from "..";
import { events, mount, queryAll, shadow } from "../../../../testing/elements";

afterEach(() => document.body.replaceChildren());

describe("pc-dialog", () => {
  it("should ask with a heading, message and choices, styling cancelling ones, and focus the first", async () => {
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
    const box = shadow(dialog, "[role=dialog]");
    expect([
      box.getAttribute("aria-modal"),
      box.getAttribute("aria-describedby"),
    ]).toEqual(["true", "message"]);
    expect(shadow(dialog, "h2").textContent).toBe("Delete layer");
    const buttons = [...dialog.shadowRoot!.querySelectorAll("pc-button")];
    expect(buttons.map((b) => b.getAttribute("variant"))).toEqual([
      "cancel",
      "accent",
      "cancel",
    ]);
    await (buttons[0] as unknown as { updateComplete: Promise<boolean> })
      .updateComplete;
    expect(dialog.shadowRoot!.activeElement).toBe(buttons[0]);
    const chosen = events(dialog, "pc-choose");
    (buttons[1] as HTMLElement).click();
    // Escape cancels wherever focus is
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(chosen).toEqual([{ value: "keep" }, { value: CANCEL_CHOICE }]);
    dialog.remove();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(chosen).toHaveLength(2);
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

  it("should leave out an empty message", async () => {
    const dialog = await mount<PcDialog>("pc-dialog", { heading: "Hi" });
    expect(dialog.shadowRoot!.querySelector("p")).toBeNull();
    expect(
      shadow(dialog, "[role=dialog]").hasAttribute("aria-describedby"),
    ).toBe(false);
  });
});
