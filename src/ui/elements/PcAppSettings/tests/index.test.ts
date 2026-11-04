import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import "..";
import type { PcAppSettings } from "..";
import type { PcShortcutSettings } from "../../PcShortcutSettings";
import { events, mount, query } from "../../../../testing/elements";
import { createApp } from "../../../../testing/app";
import {
  SETTINGS_FILE_FORMAT,
  collectSettings,
  exportSettingsFile,
} from "../../../../lib/settings";

// jsdom has no modal dialogs: opening and closing one sets `open`, and closing fires `close` like browsers do
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** App settings for a new canvas */
const setup = async () => {
  const app = createApp();
  const element = await mount<PcAppSettings>("pc-app-settings", { app });
  const toasts = events<{ message: string; kind: string }>(element, "pc-toast");
  const dialog = () => query<HTMLDialogElement>(element, "dialog");
  return { app, element, toasts, dialog };
};

describe("pc-app-settings", () => {
  it("should render nothing without an app", async () => {
    const element = await mount<PcAppSettings>("pc-app-settings");
    expect(element.shadowRoot!.querySelector("button")).toBeNull();
    element.shortcutsOpen = true;
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector("dialog")).toBeNull();
    await element.importFile(new File(["{}"], "x.json"));
    await element.exportFile();
  });

  it("should open the keyboard shortcuts in a modal window", async () => {
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
    expect(dialog().showModal).toHaveBeenCalledOnce();
    expect(dialog().open).toBe(true);
    expect(dialog().getAttribute("aria-labelledby")).toBe("shortcuts-title");
    expect(query(element, "#shortcuts-title").textContent?.trim()).toBe(
      "Keyboard shortcuts",
    );
    expect(
      query<PcShortcutSettings>(element, "pc-shortcut-settings").settings,
    ).toBe(app.shortcuts);
    expect(query(element, "button.close").hasAttribute("autofocus")).toBe(true);
    // Updating while open doesn't open it again
    element.requestUpdate("shortcutsOpen");
    await element.updateComplete;
    element.requestUpdate();
    await element.updateComplete;
    expect(dialog().showModal).toHaveBeenCalledOnce();
  });

  it("should close with its Close button, when the browser closes it (Escape), or on a press on the backdrop", async () => {
    const { element, dialog } = await setup();
    const open = async () => {
      element.shortcutsOpen = true;
      await element.updateComplete;
    };
    await open();
    query<HTMLButtonElement>(element, "button.close").click();
    await element.updateComplete;
    expect([element.shortcutsOpen, dialog().open]).toEqual([false, false]);
    expect(
      element.shadowRoot!.querySelector("pc-shortcut-settings"),
    ).toBeNull();
    await open();
    dialog().close();
    await element.updateComplete;
    expect(element.shortcutsOpen).toBe(false);
    await open();
    // A press inside the window doesn't close it; one on the backdrop (the dialog itself) does
    query(element, ".window").click();
    expect(element.shortcutsOpen).toBe(true);
    dialog().click();
    await element.updateComplete;
    expect(element.shortcutsOpen).toBe(false);
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
