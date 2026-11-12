import { css, html, nothing, unsafeCSS } from "lit";
import {
  PILLS_CSS as pills,
  WINDOWS_CSS as windows,
  ICON_CONTROLS_CSS as iconControls,
} from "../../styles";
import { PcElement, defineElement, emit } from "../../base";
import ChangeController from "../../ChangeController";
import "../PcShortcutSettings";
import "../PcToggleCheckbox";
import "../PcDialogWindow";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import { AssetFileError } from "../../../lib/assets";
import {
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

/** Translation keys of the messages shown when importing a settings file fails, by reason */
const IMPORT_ERROR_KEYS: Record<string, string> = {
  invalid: "paintCanvas.settings.fileIncompatible",
  unsupported: "paintCanvas.settings.fileUnsupported",
};

/**
 * The user's app settings: a "Draw with the GPU" switch (the user's `ui.data.rendering`, used from the next start, so it
 * says when the page needs reloading), and buttons: "Keyboard shortcuts", which opens a window to change them (see
 * `pc-shortcut-settings`), and "Import settings" and "Export settings", which read and write a settings JSON file (input
 * settings, keyboard shortcuts, colours, the user's colour palettes, profile graphs and brush presets, theme, language,
 * rendering, and settings wrapper apps added). The window is a shaded `<pc-dialog-window>` over the whole page; it closes with its ⨉ button, Escape or a press outside it, and focus goes
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
      /* One full-width button per row */
      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-2);
      }
      .actions button {
        width: 100%;
      }
      .hint {
        display: block;
        color: var(--pc-text-muted);
        font-size: 0.85em;
      }
      .pending {
        color: var(--pc-text);
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

  // Show the user's choices as they change (e.g. when settings are imported)
  private changes = new ChangeController(this, () => [this.app?.ui]);

  constructor() {
    super();
    this.shortcutsOpen = false;
  }

  /** Close the keyboard shortcuts window */
  closeShortcuts(): void {
    this.shortcutsOpen = false;
  }

  /**
   * Import the settings in a settings file, using the parts it has (the user's colour palettes, profile graphs and brush
   * presets are added to theirs).
   */
  async importFile(file: File): Promise<void> {
    const app = this.app;
    if (!app) return;
    try {
      await applySettings(app, parseSettingsFile(await file.text()));
      emit(this, "pc-toast", {
        message: this.t("paintCanvas.settings.imported"),
        kind: "success",
      });
    } catch (error) {
      emit(this, "pc-toast", {
        message: this.t(
          (error instanceof AssetFileError &&
            IMPORT_ERROR_KEYS[error.reason]) ||
            "paintCanvas.settings.fileReadFailed",
        ),
        kind: "error",
      });
    }
  }

  /**
   * Export the settings, with the user's colour palettes, profile graphs and brush presets, as a settings file.
   */
  async exportFile(): Promise<void> {
    const app = this.app;
    if (!app) return;
    try {
      await this.saveFile(
        new Blob([exportSettingsFile(collectSettings(app))], {
          type: "application/json",
        }),
        settingsFileName(undefined, app.names.filePrefix),
      );
    } catch {
      emit(this, "pc-toast", {
        message: this.t("paintCanvas.settings.exportFailed"),
        kind: "error",
      });
    }
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

  /**
   * The switch that draws with the GPU (or the CPU) from the next start, saying when the page needs reloading to use
   * the choice (see `PaintCanvas.rendering`).
   */
  private renderRendering(app: PaintCanvas) {
    const chosen = app.ui.data.rendering;
    const pending = chosen !== app.rendering;
    return html`<pc-toggle-checkbox
      class="gpu"
      .checked=${chosen === "gpu"}
      @change=${(e: CustomEvent<{ checked: boolean }>) =>
        app.ui.update({ rendering: e.detail.checked ? "gpu" : "cpu" })}
    >
      ${this.t("paintCanvas.settings.gpu")}
      <span class="hint ${pending ? "pending" : ""}" aria-live="polite">
        ${this.t(
          pending
            ? "paintCanvas.settings.reloadToApply"
            : "paintCanvas.settings.gpuHint",
        )}
      </span>
    </pc-toggle-checkbox>`;
  }

  override render() {
    const app = this.app;
    if (!app) return nothing;
    return html`${this.renderRendering(app)}
      <div class="actions">
        <button
          type="button"
          class="pill shortcuts"
          aria-haspopup="dialog"
          @click=${() => (this.shortcutsOpen = true)}
        >
          ${this.t("paintCanvas.shortcuts.title")}
        </button>
        <button
          type="button"
          class="pill import"
          @click=${() =>
            this.renderRoot
              .querySelector<HTMLInputElement>(".import-file")
              ?.click()}
        >
          ${this.t("paintCanvas.settings.import")}
        </button>
        <button
          type="button"
          class="pill export"
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
