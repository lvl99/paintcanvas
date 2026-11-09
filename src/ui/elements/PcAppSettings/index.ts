import { css, html, nothing, unsafeCSS } from "lit";
import {
  PILLS_CSS as pills,
  WINDOWS_CSS as windows,
  ICON_CONTROLS_CSS as iconControls,
} from "../../styles";
import { PcElement, defineElement, emit } from "../../base";
import "../PcShortcutSettings";
import "../PcDialogWindow";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import {
  SETTINGS_FILE_ERRORS,
  SETTINGS_FILE_FORMAT,
  SettingsFileError,
  applySettings,
  collectSettings,
  exportSettingsFile,
  parseSettingsFile,
  settingsFileName,
} from "../../../lib/settings";
import {
  JSON_FILE_TYPE,
  saveFile,
  type SaveMethod,
} from "../../../lib/rendering/screenshot";

/** Translation keys of the settings file error messages */
const SETTINGS_FILE_ERROR_KEYS: Record<string, string> = {
  [SETTINGS_FILE_ERRORS.incompatible]: "paintCanvas.settings.fileIncompatible",
  [SETTINGS_FILE_ERRORS.read]: "paintCanvas.settings.fileReadFailed",
};

/**
 * Buttons for the user's app settings: "Keyboard shortcuts", which opens a window to change them (see
 * `pc-shortcut-settings`), and "Import settings" and "Export settings", which read and write a settings JSON file (input
 * settings, keyboard shortcuts, colour palette, colours, profile graphs, theme and language). The window is a shaded
 * `<pc-dialog-window>` over the whole page; it closes with its ⨉ button, Escape or a press outside it, and focus goes
 * back to the button. Fires `pc-toast` after importing, or when importing or exporting fails.
 *
 * @example
 * html`<pc-app-settings .app=${canvas}></pc-app-settings>`
 */
export class PcAppSettings extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    shortcutsOpen: { type: Boolean, attribute: "shortcuts-open" },
  };

  static override styles = [
    PcElement.styles,
    unsafeCSS(windows),
    unsafeCSS(iconControls),
    unsafeCSS(pills),
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-2);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--pc-space-2);
      }
      pc-dialog-window {
        --pc-dialog-width: 480px;
      }
      h2 {
        margin: 0;
        font-size: 1.2em;
      }
    `,
  ];

  declare app?: PaintCanvas;

  /** Whether the keyboard shortcuts window is open */
  declare shortcutsOpen: boolean;

  /** Saves exported files (replaceable for tests) */
  saveFile: (blob: Blob, name: string) => Promise<SaveMethod | undefined> = (
    blob,
    name,
  ) => saveFile(blob, name, undefined, JSON_FILE_TYPE);

  constructor() {
    super();
    this.shortcutsOpen = false;
  }

  /** Close the keyboard shortcuts window */
  closeShortcuts(): void {
    this.shortcutsOpen = false;
  }

  /**
   * Import the settings in a settings file, using the parts it has.
   */
  async importFile(file: File): Promise<void> {
    const app = this.app;
    if (!app) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.toastError(SETTINGS_FILE_ERRORS.read);
      return;
    }
    try {
      applySettings(
        app,
        parseSettingsFile(text, [
          app.names.settingsFileFormat,
          SETTINGS_FILE_FORMAT,
        ]),
      );
      emit(this, "pc-toast", {
        message: this.t("paintCanvas.settings.imported"),
        kind: "success",
      });
    } catch (error) {
      this.toastError(
        error instanceof SettingsFileError
          ? error.message
          : SETTINGS_FILE_ERRORS.read,
      );
    }
  }

  /**
   * Export the settings as a settings file.
   */
  async exportFile(): Promise<void> {
    const app = this.app;
    if (!app) return;
    try {
      await this.saveFile(
        new Blob(
          [
            exportSettingsFile(
              collectSettings(app),
              app.names.settingsFileFormat,
            ),
          ],
          { type: "application/json" },
        ),
        settingsFileName(undefined, app.names.filePrefix),
      );
    } catch {
      emit(this, "pc-toast", {
        message: this.t("paintCanvas.settings.exportFailed"),
        kind: "error",
      });
    }
  }

  /** Show a settings file error (one of `SETTINGS_FILE_ERRORS`) in the chosen language */
  private toastError(message: string): void {
    emit(this, "pc-toast", {
      message: this.t(SETTINGS_FILE_ERROR_KEYS[message] as string),
      kind: "error",
    });
  }

  /** The keyboard shortcuts window, with its contents only while open */
  private renderShortcuts(app: PaintCanvas) {
    return html`<pc-dialog-window
      class="shortcuts-window"
      shaded
      ?open=${this.shortcutsOpen}
      @pc-dismiss=${() => this.closeShortcuts()}
    >
      <h2 slot="header-middle">${this.t("paintCanvas.shortcuts.title")}</h2>
      ${
        this.shortcutsOpen
          ? html`<pc-shortcut-settings
              slot="body"
              .settings=${app.shortcuts}
            ></pc-shortcut-settings>`
          : nothing
      }
    </pc-dialog-window>`;
  }

  override render() {
    const app = this.app;
    if (!app) return nothing;
    return html`<div class="actions">
        <button
          type="button"
          class="pill-s shortcuts"
          aria-haspopup="dialog"
          @click=${() => (this.shortcutsOpen = true)}
        >
          ${this.t("paintCanvas.shortcuts.title")}
        </button>
        <button
          type="button"
          class="pill-s import"
          @click=${() =>
            this.renderRoot
              .querySelector<HTMLInputElement>(".import-file")
              ?.click()}
        >
          ${this.t("paintCanvas.settings.import")}
        </button>
        <button
          type="button"
          class="pill-s export"
          @click=${() => void this.exportFile()}
        >
          ${this.t("paintCanvas.settings.export")}
        </button>
        <!-- Chosen through "Import settings" -->
        <label class="visually-hidden">
          ${this.t("paintCanvas.settings.importFile")}
          <input
            type="file"
            class="import-file"
            tabindex="-1"
            accept="application/json,.json"
            @change=${(e: Event) => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              input.value = "";
              if (file) void this.importFile(file);
            }}
          />
        </label>
      </div>
      ${this.renderShortcuts(app)}`;
  }
}

defineElement("pc-app-settings", PcAppSettings);
