import { describe, it, expect } from "vitest";
import { userEvent } from "vitest/browser";
import "..";
import type { PcAppSettings } from "..";
import PaintCanvas, { Tool } from "../../../../lib/classes/PaintCanvas";
import KeyboardShortcuts from "../../../../lib/classes/KeyboardShortcuts";

describe("app settings in a real browser", () => {
  it("should show the keyboard shortcuts in a modal window that Escape closes, without running shortcuts", async () => {
    const app = new PaintCanvas({ width: 20, height: 10 });
    const keys = new KeyboardShortcuts(app);
    keys.attach(window);
    const element = document.createElement("pc-app-settings") as PcAppSettings;
    element.app = app;
    document.body.append(element);
    await element.updateComplete;
    const root = element.shadowRoot!;
    const button = root.querySelector<HTMLButtonElement>("button.shortcuts")!;
    button.focus();
    button.click();
    await element.updateComplete;
    const dialog = root.querySelector("dialog")!;
    expect(dialog.matches(":modal")).toBe(true);
    expect(root.activeElement).toBe(root.querySelector("button.close"));
    // Shortcuts don't run inside the window
    await userEvent.keyboard("e");
    expect(app.tool).toBe(Tool.Brush);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => element.shortcutsOpen).toBe(false);
    expect(dialog.open).toBe(false);
    expect(root.activeElement).toBe(button);
    // Outside it they run again
    await userEvent.keyboard("e");
    expect(app.tool).toBe(Tool.Eraser);
    keys.detach();
    element.remove();
  });
});
