import { describe, it, expect } from "vitest";
import { userEvent } from "vitest/browser";
import "..";
import type { PcDialogWindow } from "..";
import { askConfirm } from "../../../ask";

describe("dialog windows in a real browser", () => {
  it("should close one window at a time with Escape, giving focus back to what had it", async () => {
    const element = document.createElement(
      "pc-dialog-window",
    ) as PcDialogWindow;
    element.innerHTML = '<button slot="body" class="ask">Ask</button>';
    const dismissed: string[] = [];
    element.addEventListener("pc-dismiss", (event) =>
      dismissed.push((event as CustomEvent<{ reason: string }>).detail.reason),
    );
    document.body.append(element);
    element.open = true;
    await element.updateComplete;
    const dialog = element.shadowRoot!.querySelector("dialog")!;
    expect(dialog.matches(":modal")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    const ask = element.querySelector<HTMLButtonElement>("button.ask")!;
    ask.focus();

    // A question over the window: Escape answers it, and focus goes back to the button that asked
    const answer = askConfirm(element, {
      heading: "Sure?",
      confirm: "Yes",
      cancel: "No",
    });
    await expect
      .poll(() => element.querySelector("pc-dialog")?.shadowRoot?.activeElement)
      .toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(await answer).toBe(false);
    expect(element.querySelector("pc-dialog")).toBeNull();
    expect(document.activeElement).toBe(ask);
    expect(element.open).toBe(true);
    expect(dismissed).toEqual([]);

    // Then Escape closes the window
    await userEvent.keyboard("{Escape}");
    expect(dismissed).toEqual(["escape"]);
    expect(element.open).toBe(false);
    await element.updateComplete;
    expect(dialog.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    element.remove();
  });
});
