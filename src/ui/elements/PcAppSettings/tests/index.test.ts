import { describe, it, expect, afterEach, vi } from "vitest";
import "..";
import { PcAppSettings } from "..";
import type { PcShortcutSettings } from "../../PcShortcutSettings";
import type { PcDialogWindow } from "../../PcDialogWindow";
import type { PcToggleCheckbox } from "../../PcToggleCheckbox";
import { events, mount, query } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";
import {
  SETTINGS_FILE_FORMAT,
  collectSettings,
  exportSettingsFile,
} from "../../../../lib/settings";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** App settings for a new canvas */
const setup = async () => {
  const app = createApp();
  const element = await mount<PcAppSettings>("pc-app-settings", { app });
  const toasts = events<{ message: string; kind: string }>(element, "pc-toast");
  const dialog = () => query<PcDialogWindow>(element, "pc-dialog-window");
  return { app, element, toasts, dialog };
};

describe("pc-app-settings", () => {
  it("should render nothing without an app", async () => {
    const element = await mount<PcAppSettings>("pc-app-settings");
    expect(element.shadowRoot!.querySelector("button")).toBeNull();
    element.shortcutsOpen = true;
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector("pc-dialog-window")).toBeNull();
    await element.importFile(new File(["{}"], "x.json"));
    await element.exportFile();
  });

  it("should switch drawing with the GPU, saying when the page needs reloading", async () => {
    const { app, element } = await setup();
    const toggle = query<PcToggleCheckbox>(element, "pc-toggle-checkbox.gpu");
    const hint = () => query(element, ".gpu .hint");
    expect(toggle.checked).toBe(false);
    expect(hint().textContent).toContain("Try this if drawing is slow");
    toggle.dispatchEvent(
      new CustomEvent("change", { detail: { checked: true } }),
    );
    await element.updateComplete;
    expect(app.ui.data.rendering).toBe("gpu");
    expect(toggle.checked).toBe(true);
    expect(hint().textContent).toContain("Reload the page");
    expect(hint().classList.contains("pending")).toBe(true);
    toggle.dispatchEvent(
      new CustomEvent("change", { detail: { checked: false } }),
    );
    await element.updateComplete;
    expect(app.ui.data.rendering).toBe("cpu");
    expect(hint().textContent).toContain("Try this if drawing is slow");
    // Imported or restored choices show too
    app.ui.update({ rendering: "gpu" });
    await element.updateComplete;
    expect(toggle.checked).toBe(true);
  });

  it("should show its buttons at the usual pill size, each on its own full-width row", async () => {
    const { element } = await setup();
    const buttons = [".shortcuts", ".import", ".export"].map((selector) =>
      query(element, selector),
    );
    for (const button of buttons) expect(button.classList).toContain("pill");
    const styles = PcAppSettings.styles.map(String).join("");
    expect(styles).toMatch(/\.actions \{[^}]*flex-direction: column/);
    expect(styles).toMatch(/\.actions button \{[^}]*width: 100%/);
  });

  it("should open the keyboard shortcuts in a shaded window", async () => {
    const { app, element, dialog } = await setup();
    expect(dialog().open).toBe(false);
    expect(
      element.shadowRoot!.querySelector("pc-shortcut-settings"),
    ).toBeNull();
    const button = query<HTMLButtonElement>(element, "button.shortcuts");
    expect([
      button.textContent?.trim(),
      button.getAttribute("aria-haspopup"),
    ]).toEqual(["Keyboard shortcuts", "dialog"]);
    button.click();
    await element.updateComplete;
    expect([dialog().open, dialog().shaded]).toEqual([true, true]);
    const heading = query(element, "h2");
    expect([heading.slot, heading.textContent?.trim()]).toEqual([
      "header-middle",
      "Keyboard shortcuts",
    ]);
    const settings = query<PcShortcutSettings>(element, "pc-shortcut-settings");
    expect([settings.slot, settings.settings]).toEqual(["body", app.shortcuts]);
  });

  it("should close when its window asks (⨉, Escape or a press outside)", async () => {
    const { element, dialog } = await setup();
    element.shortcutsOpen = true;
    await element.updateComplete;
    dialog().requestClose("outside");
    await element.updateComplete;
    expect([element.shortcutsOpen, dialog().open]).toEqual([false, false]);
    expect(
      element.shadowRoot!.querySelector("pc-shortcut-settings"),
    ).toBeNull();
  });

  it("should import a settings file, using its settings", async () => {
    const { app, element, toasts } = await setup();
    const source = createApp();
    source.palette.set(["#123456"]);
    source.shortcuts.set("tool-brush", { key: "p" });
    await element.importFile(
      new File([exportSettingsFile(collectSettings(source))], "s.json"),
    );
    expect(app.palette.colours).toEqual(["#123456"]);
    expect(app.shortcuts.combo("tool-brush")).toEqual({ key: "p" });
    expect(toasts).toEqual([{ message: "Settings imported", kind: "success" }]);
  });

  it("should import the implementer's own settings file format", async () => {
    const { app, element } = await setup();
    Object.assign(app.names, { settingsFileFormat: "myapp-settings" });
    await element.importFile(
      new File(
        [exportSettingsFile({ palette: [] }, "myapp-settings")],
        "s.json",
      ),
    );
    expect(app.palette.colours).toEqual([]);
    await element.importFile(
      new File(
        [exportSettingsFile({ palette: ["#000000"] }, SETTINGS_FILE_FORMAT)],
        "s.json",
      ),
    );
    expect(app.palette.colours).toEqual(["#000000"]);
  });

  it("should show an error for files that can't be read or aren't settings files", async () => {
    const { app, element, toasts } = await setup();
    await element.importFile(new File(["{"], "bad.json"));
    const unreadable = new File(["x"], "x.json");
    vi.spyOn(unreadable, "text").mockRejectedValue(new Error("No"));
    await element.importFile(unreadable);
    vi.spyOn(app.palette, "set").mockImplementation(() => {
      throw new Error("Unexpected");
    });
    await element.importFile(
      new File([exportSettingsFile({ palette: [] })], "s.json"),
    );
    expect(toasts).toEqual([
      { message: "Settings JSON file not compatible", kind: "error" },
      { message: "Failed to read settings JSON file", kind: "error" },
      { message: "Failed to read settings JSON file", kind: "error" },
    ]);
  });

  it("should import a file chosen with the Import settings button", async () => {
    const { element } = await setup();
    const input = query<HTMLInputElement>(element, ".import-file");
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);
    query<HTMLButtonElement>(element, "button.import").click();
    expect(click).toHaveBeenCalledOnce();
    const importFile = vi
      .spyOn(element, "importFile")
      .mockResolvedValue(undefined);
    const file = new File(["{}"], "s.json");
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    input.dispatchEvent(new Event("change"));
    expect(importFile).toHaveBeenCalledWith(file);
    Object.defineProperty(input, "files", { value: [], configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(importFile).toHaveBeenCalledOnce();
  });

  it("should export the settings as a settings file, showing an error when it fails", async () => {
    const { app, element, toasts } = await setup();
    const saved: { blob: Blob; name: string }[] = [];
    element.saveFile = vi.fn(async (blob: Blob, name: string) => {
      saved.push({ blob, name });
      return "download" as const;
    });
    query<HTMLButtonElement>(element, "button.export").click();
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toMatch(/^paintcanvas-settings-.*\.json$/);
    expect(JSON.parse(await saved[0]!.blob.text()).settings).toEqual(
      collectSettings(app),
    );
    vi.mocked(element.saveFile).mockRejectedValueOnce(new Error("denied"));
    await element.exportFile();
    expect(toasts).toEqual([
      { message: "Error exporting settings JSON file", kind: "error" },
    ]);
  });

  it("should save to a JSON file by default", async () => {
    const { element } = await setup();
    const picker = vi.fn(async () => ({
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    }));
    Object.assign(window, { showSaveFilePicker: picker });
    expect(await element.saveFile(new Blob(["{}"]), "s.json")).toBe("picker");
    expect(picker).toHaveBeenCalledWith({
      suggestedName: "s.json",
      types: [
        { description: "JSON file", accept: { "application/json": [".json"] } },
      ],
    });
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
});
