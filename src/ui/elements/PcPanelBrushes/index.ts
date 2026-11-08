import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { PILLS_CSS as pill } from "../../styles";
import { WINDOWS_CSS as theme } from "../../styles";
import { styleMap } from "lit/directives/style-map.js";
import { NO_TEXT_SELECTION_CSS as noTextSelection } from "../../styles";
import { defineElement } from "../../base";
import { PcPanel } from "../PcPanel";
import { askConfirm, deletePresetQuestion, type ConfirmFn } from "../../ask";
import "../PcBrushSize";
import ChangeController from "../../ChangeController";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import type BrushSettings from "../../../lib/classes/BrushSettings";
import type { BrushConfig } from "../../../lib/brushes/types";
import {
  MY_PRESETS,
  UNKNOWN_AUTHOR,
  groupPresetsByAuthor,
} from "../../../lib/brushes/authors";
import { BRUSH_PRESET_FILE_FORMAT as PAINTCANVAS_BRUSH_PRESET_FILE_FORMAT } from "../../../lib/presets";
import {
  PRESET_FILE_ERRORS,
  PresetFileError,
  exportPresetFile,
  parsePresetFile,
  presetFileName,
} from "../../../lib/brushes/presetFile";
import { DELETE_CURSOR } from "../../../lib/rendering/cursors";
import {
  JSON_FILE_TYPE,
  saveFile,
  type SaveMethod,
} from "../../../lib/rendering/screenshot";

/** Translation keys of the preset file error messages */
const PRESET_FILE_ERROR_KEYS: Record<string, string> = {
  [PRESET_FILE_ERRORS.incompatible]: "paintCanvas.presets.fileIncompatible",
  [PRESET_FILE_ERRORS.read]: "paintCanvas.presets.fileReadFailed",
  [PRESET_FILE_ERRORS.export]: "paintCanvas.presets.exportFailed",
  [PRESET_FILE_ERRORS.empty]: "paintCanvas.presets.nothingToExport",
};

/** Cursor over a preset that a click deletes (Alt/Option held): the `--pc-delete-cursor` token's default */
export { DELETE_CURSOR };

/** Size the previews of presets without a family are measured against, so a 50px preset fills its tile */
const UNGROUPED_FULL_SIZE = 50;

export type { ConfirmFn } from "../../ask";

/** Largest shape preview in a preset tile, in CSS pixels */
export const MAX_PREVIEW_SIZE = 30;

/** Smallest shape preview in a preset tile, in CSS pixels */
export const MIN_PREVIEW_SIZE = 3;

/**
 * The size of each preset's shape preview, relative to the largest preset of its family (`group`), so a family's sizes
 * are easy to tell apart (the largest fills the tile). Presets without a family fill the tile from 50 pixels.
 *
 * @example
 * previewSizes([{ id: "a", group: "Round", width: 10, height: 10 }, { id: "b", group: "Round", width: 50, height: 50 }]);
 * // Map { "a" => { width: 6, height: 6 }, "b" => { width: 30, height: 30 } }
 */
export const previewSizes = (
  presets: BrushConfig[],
): Map<string, { width: number; height: number }> => {
  const largest = new Map<string, number>();
  for (const preset of presets) {
    const group = preset.group ?? preset.id;
    const size = Math.max(preset.width ?? 1, preset.height ?? 1);
    largest.set(
      group,
      Math.max(
        largest.get(group) ?? (preset.group ? 0 : UNGROUPED_FULL_SIZE),
        size,
      ),
    );
  }
  return new Map(
    presets.map((preset) => {
      const scale =
        MAX_PREVIEW_SIZE / (largest.get(preset.group ?? preset.id) as number);
      const size = (value = 1) =>
        Math.max(MIN_PREVIEW_SIZE, Math.round(value * scale));
      return [
        preset.id,
        { width: size(preset.width), height: size(preset.height) },
      ];
    }),
  );
};

/**
 * Brush or eraser menu: current size, a drag control to change size, a scrollable grid of presets grouped by author
 * ("My presets", "PaintCanvas", then other authors), and "New preset", "Import" and "Export" buttons. Each preset is a
 * tile showing its shape at its size relative to the rest of its family, five to a row. Picking a preset closes the
 * menu; holding Alt/Option shows an "X" over custom presets, and clicking one asks before deleting it.
 *
 * Dragging the size control (`pc-brush-size`) up or right makes the brush bigger; down or left makes it smaller.
 *
 * Fires `pc-new-preset` (detail: "brush" or "eraser") for "New preset", and `pc-toast` (detail: the message) after
 * importing, exporting or deleting presets, or when that fails.
 *
 * @example
 * html`<pc-panel-brushes kind="eraser" .app=${app}></pc-panel-brushes>`
 */
export class PcPanelBrushes extends PcPanel {
  static override properties = {
    ...PcPanel.properties,
    app: { attribute: false },
    kind: { type: String },
  };

  static override styles = [
    ...PcPanel.styles,

    unsafeCSS(noTextSelection),
    unsafeCSS(styles),
    unsafeCSS(theme),
    unsafeCSS(pill),
  ];

  declare app?: PaintCanvas;

  /** Which settings this menu controls */
  declare kind: "brush" | "eraser";

  /** Asks the user to confirm, in a dialog (replaceable for tests) */
  confirm: ConfirmFn = (options) => askConfirm(this.renderRoot, options);

  /** Saves exported presets (replaceable for tests) */
  saveFile: (blob: Blob, name: string) => Promise<SaveMethod | undefined> = (
    blob,
    name,
  ) => saveFile(blob, name, undefined, JSON_FILE_TYPE);

  private changes = new ChangeController(this, () => [this.app, this.settings]);

  // Holding Alt/Option shows the delete cursor over custom presets
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === "Alt")
      this.toggleAttribute("deleting", event.type === "keydown");
  };

  private readonly onBlur = () => this.removeAttribute("deleting");

  constructor() {
    super();
    this.kind = "brush";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.onBlur);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
  }

  /** Fire an event that crosses shadow DOM boundaries */
  private emit(type: string, detail?: unknown): void {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true }),
    );
  }

  /**
   * Select a preset, or with Alt/Option held, delete a custom preset after confirming.
   */
  private onPresetClick(event: MouseEvent, preset: BrushConfig): void {
    const app = this.app as PaintCanvas;
    if (event.altKey && !app.isBuiltInPreset(preset.id)) {
      void this.deletePreset(preset);
      return;
    }
    this.selectPreset(preset.id);
  }

  /**
   * Delete a custom preset after confirming.
   */
  async deletePreset(preset: BrushConfig): Promise<void> {
    const app = this.app;
    if (!app) return;
    const name = preset.name ?? preset.id;
    if (!(await this.confirm(deletePresetQuestion(this.translations, name))))
      return;
    try {
      await app.customPresets.remove(preset.id);
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.deleted", { name }),
        kind: "success",
      });
    } catch {
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.deleteFailed", { name }),
        kind: "error",
      });
    }
  }

  /**
   * Import the presets in a brush preset file, adding them to the custom presets (replacing any with the same ID).
   */
  async importFile(file: File): Promise<void> {
    const app = this.app;
    if (!app) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.emit("pc-toast", {
        message: this.presetFileError(undefined, PRESET_FILE_ERRORS.read),
        kind: "error",
      });
      return;
    }
    try {
      const presets = parsePresetFile(text, [
        app.names.presetFileFormat,
        PAINTCANVAS_BRUSH_PRESET_FILE_FORMAT,
      ]);
      await app.customPresets.save(...presets);
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.imported", {
          count: presets.length,
        }),
        kind: "success",
      });
    } catch (error) {
      this.emit("pc-toast", {
        message: this.presetFileError(error, PRESET_FILE_ERRORS.read),
        kind: "error",
      });
    }
  }

  /**
   * Export the custom presets (not the built-in ones) as a brush preset file.
   */
  async exportFile(): Promise<void> {
    const app = this.app;
    if (!app) return;
    try {
      const json = exportPresetFile(
        app.customPresets.presets,
        app.names.presetFileFormat,
      );
      await this.saveFile(
        new Blob([json], { type: "application/json" }),
        presetFileName(undefined, app.names.filePrefix),
      );
    } catch (error) {
      this.emit("pc-toast", {
        message: this.presetFileError(error, PRESET_FILE_ERRORS.export),
        kind: "error",
      });
    }
  }

  /**
   * A preset file error's message in the chosen language (or the fallback's, for any other error).
   */
  private presetFileError(error: unknown, fallback: string): string {
    const message = error instanceof PresetFileError ? error.message : fallback;
    const key = PRESET_FILE_ERROR_KEYS[message];
    return key ? this.t(key) : message;
  }

  /**
   * A preset group's heading in the chosen language ("My presets" and "Unknown" are translated; author names aren't).
   */
  private groupLabel(label: string): string {
    if (label === MY_PRESETS) return this.t("paintCanvas.presets.myPresets");
    if (label === UNKNOWN_AUTHOR)
      return this.t("paintCanvas.presets.unknownAuthor");
    return label;
  }

  /** The brush or eraser settings this menu controls */
  get settings(): BrushSettings | undefined {
    return this.kind === "eraser" ? this.app?.eraser : this.app?.brush;
  }

  /**
   * Select a preset and close the menu.
   */
  selectPreset(id: string): void {
    this.settings?.select(id);
    this.app?.closePanel();
  }

  /** Render a preset's tile */
  private renderTile(
    settings: BrushSettings,
    preset: BrushConfig,
    sizes: Map<string, { width: number; height: number }>,
  ) {
    const size = sizes.get(preset.id) as { width: number; height: number };
    const custom = !this.app?.isBuiltInPreset(preset.id);
    return html`<li>
      <button
        type="button"
        class=${custom ? "custom" : nothing}
        data-preset=${preset.id}
        title=${preset.name ?? preset.id}
        aria-label=${preset.name ?? preset.id}
        aria-pressed=${settings.presetId === preset.id}
        @click=${(e: MouseEvent) => this.onPresetClick(e, preset)}
      >
        <span
          class=${preset.image ? "shape image" : "shape"}
          style=${styleMap({
            width: `${size.width}px`,
            height: `${size.height}px`,
            // Only the shape image's alpha shows, as the brush uses it
            maskImage:
              typeof preset.image === "string"
                ? `url("${preset.image}")`
                : undefined,
            transform: preset.rotation
              ? `rotate(${preset.rotation}deg)`
              : undefined,
          })}
        ></span>
      </button>
    </li>`;
  }

  protected override get defaultIcon(): string {
    return this.kind === "eraser" ? "eraser" : "brush";
  }

  protected override get defaultLabel(): string {
    return this.t(
      this.kind === "eraser"
        ? "paintCanvas.tool.eraser"
        : "paintCanvas.tool.brush",
    );
  }

  protected override renderBody() {
    const settings = this.settings;
    if (!settings) return nothing;
    const title = this.t(
      this.kind === "eraser"
        ? "paintCanvas.tool.eraser"
        : "paintCanvas.tool.brush",
    );
    const presets = Object.values(settings.presets);
    const sizes = previewSizes(presets);
    // Settings only exist with an app
    const app = this.app as PaintCanvas;
    const groups = groupPresetsByAuthor(
      presets,
      (id) => app.isBuiltInPreset(id),
      app.authorHandle,
      { builtIn: app.names.app, unknown: app.names.unknownAuthor },
    );
    const preset = settings.preset;
    return html`
      <h2 class="visually-hidden">${title}</h2>
      <!-- The current preset: its shape, name and size (drag sideways to resize) -->
      <div class="current">
        <span
          class=${preset.image ? "current-shape image" : "current-shape"}
          style=${styleMap({
            maskImage:
              typeof preset.image === "string"
                ? `url("${preset.image}")`
                : undefined,
          })}
        ></span>
        <span class="name">${preset.name ?? preset.id}</span>
        <pc-brush-size
          class="size"
          .settings=${settings}
          label=${this.t("paintCanvas.brushMenu.size", { tool: title })}
        ></pc-brush-size>
      </div>
      <div
        class="presets"
        aria-label=${this.t("paintCanvas.brushMenu.presets", { tool: title })}
      >
        ${groups.map(
          (group) => html`
            <h3>${this.groupLabel(group.label)}</h3>
            <ul aria-label=${this.groupLabel(group.label)}>
              ${group.presets.map((preset) =>
                this.renderTile(settings, preset, sizes),
              )}
            </ul>
          `,
        )}
      </div>
      <div class="actions">
        <button
          type="button"
          class="pill-s new-preset"
          @click=${() => this.emit("pc-new-preset", this.kind)}
        >
          ${this.t("paintCanvas.brushMenu.create")}
        </button>
        <button
          type="button"
          class="pill-s import"
          @click=${() =>
            this.renderRoot
              .querySelector<HTMLInputElement>(".import-file")
              ?.click()}
        >
          ${this.t("paintCanvas.brushMenu.import")}
        </button>
        <!-- Chosen through "Import" -->
        <label class="visually-hidden">
          ${this.t("paintCanvas.brushMenu.importFile")}
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
        <button
          type="button"
          class="pill-s export"
          @click=${() => void this.exportFile()}
        >
          ${this.t("paintCanvas.brushMenu.export")}
        </button>
      </div>
    `;
  }
}

defineElement("pc-panel-brushes", PcPanelBrushes);
