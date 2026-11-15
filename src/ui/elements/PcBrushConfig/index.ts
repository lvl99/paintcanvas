import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { WINDOWS_CSS as theme } from "../../styles";
import { PILLS_CSS as pill } from "../../styles";
import { ICON_CONTROLS_CSS as iconToggle } from "../../styles";
import { iconLabel } from "../../icons";
import {
  askChoice,
  askConfirm,
  askText,
  deletePresetQuestion,
  type ChooseFn,
  type ConfirmFn,
  type PromptFn,
} from "../../ask";
import { CANCEL_CHOICE } from "../PcDialog";
import "../PcContextMenu";
import type { MenuItem } from "../PcMenu";
import { live } from "lit/directives/live.js";
import { styleMap } from "lit/directives/style-map.js";
import { PcElement, defineElement } from "../../base";
import "../PcBrushTest";
import "../PcToggleCheckbox";
import "../PcDialogWindow";
import "../PcSliderRange";
import "../PcProfileEditor";
import type { ProfileSaveDetail } from "../PcProfileEditor";
import ProfileGraphs from "../../../lib/classes/ProfileGraphs";
import { isLinear, LINEAR_PROFILE_ID } from "../../../lib/profiles";
import type { RangeDetail } from "../PcSliderRange";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import { createMemoryCanvas } from "../../../lib/classes/Layer";
import { SmoothingType, type BrushConfig } from "../../../lib/brushes/types";
import {
  PARAM_LIMITS,
  VARIATION_SOURCES,
  followsLean,
  readRange,
  setFollowsLean,
  setSource,
  writeRange,
  writeSourceProfile,
  writeSourceRange,
  type VariationSource,
  type VaryingParam,
} from "../../../lib/brushes/configRanges";
import {
  readClipboardShape,
  readShapeImage,
  SHAPE_ERRORS,
  ShapeImageError,
  type ShapeImage,
} from "../../../lib/brushes/shapeImage";
import { BUILT_IN_SHAPES, builtInShapeId } from "../../../lib/brushes/shapes";
import {
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
} from "../../../lib/brushes/StrokeSampler";

export type { ChooseFn, ConfirmFn, PromptFn } from "../../ask";

/** The smoothing choices, in the order shown: value, translation key of the name, and icon name */
export const SMOOTHING_CHOICES = [
  {
    value: SmoothingType.Linear,
    label: "paintCanvas.brushConfig.smoothingLinear",
    icon: "smoothingLinear",
  },
  {
    value: SmoothingType.BezierQuad,
    label: "paintCanvas.brushConfig.smoothingQuadratic",
    icon: "smoothingBezierQuad",
  },
  {
    value: SmoothingType.BezierCubic,
    label: "paintCanvas.brushConfig.smoothingCubic",
    icon: "smoothingBezierCubic",
  },
] as const;

/** Icon names of the variation sources */
const SOURCE_ICONS: Record<VariationSource, string> = {
  pressure: "pressure",
  tilt: "tilt",
  randomise: "randomise",
};

/** Translation keys of the varying settings' names */
const PARAM_LABELS: Record<VaryingParam, string> = {
  width: "paintCanvas.common.width",
  height: "paintCanvas.common.height",
  alpha: "paintCanvas.common.opacity",
  rotation: "paintCanvas.brushConfig.rotation",
  offsetX: "paintCanvas.brushConfig.offsetX",
  offsetY: "paintCanvas.brushConfig.offsetY",
};

/** Translation keys of the variation sources' names */
const SOURCE_LABELS: Record<VariationSource, string> = {
  pressure: "paintCanvas.toolSettings.pressure",
  tilt: "paintCanvas.toolSettings.tilt",
  randomise: "paintCanvas.brushConfig.randomise",
};

/** Translation keys of each source's row name */
const SOURCE_ROW_LABELS: Record<VariationSource, string> = {
  pressure: "paintCanvas.brushConfig.penPressure",
  tilt: "paintCanvas.brushConfig.penTilt",
  randomise: "paintCanvas.brushConfig.randomise",
};

/** The choices of the question asked when closing with unsaved changes */
const SAVE_CHOICE = "save";
const ADD_CHOICE = "add";
const DISCARD_CHOICE = "discard";

/** Translation keys of the brush shape error messages */
const SHAPE_ERROR_KEYS: Record<string, string> = {
  [SHAPE_ERRORS.type]: "paintCanvas.shape.notPng",
  [SHAPE_ERRORS.size]: "paintCanvas.shape.tooLarge",
  [SHAPE_ERRORS.decode]: "paintCanvas.shape.readFailed",
  [SHAPE_ERRORS.noImage]: "paintCanvas.shape.noPngToPaste",
};

/** Largest stamp spacing in pixels */
const MAX_SPACING = 200;

/** What the window's `pc-save` gives: the saved settings and their name, to apply to the current tool */
export interface BrushConfigSaveDetail {
  config: BrushConfig;
  name: string;
}

/**
 * The brush (or eraser) configuration window: a testing area, the shape (pressing it opens a menu of the built-in
 * shapes; or upload or paste one), smoothing, width, height, opacity, rotation (and whether it follows the pen's lean),
 * offsets, sample rate, spacing and snapping to the pixel grid (see `BrushParamConfig`).
 *
 * Width, height, opacity, rotation and the offsets can vary with pressure, tilt and randomness, several at once. A
 * setting that doesn't vary has one slider (its value, the highest for sizes and opacity); one that varies has a range
 * (`<pc-slider-range>`, in pixels, percent or degrees), and under it a row for each source turned on, with the
 * source's own range (0–100) and profile graph. Each source's share, through its graph and within its range, multiply
 * to set the value within the setting's range.
 *
 * The name shows an asterisk while there are unsaved changes. "Save" saves them to the user's own preset being edited
 * (`editingId`; not built-in presets, for which it's off), selects it and fires `pc-save` (see
 * `BrushConfigSaveDetail`) to apply them to the current tool. "Add to presets" saves them as a new preset of the
 * user's (asking for its name, and before replacing one with the same name), selects it, and later saves go to it.
 * "Delete preset…" shows when editing one of the user's presets. It's a shaded `<pc-dialog-window>`, closed with its ⨉
 * button or Escape (not a press outside it, which would lose the changes); with unsaved changes, it asks whether to save
 * them first. Fires `pc-close` when closed, and `pc-toast` with a message after saving, adding or deleting a preset, or
 * when a shape can't be used.
 *
 * @example
 * html`<pc-brush-config .app=${app} kind="brush" .config=${app.brush.preset} .presetName=${app.brush.name}
 *   @pc-save=${apply}></pc-brush-config>`
 */
export class PcBrushConfig extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    kind: { type: String },
    config: { attribute: false },
    presetName: { attribute: false },
    editingId: { type: String },
    draft: { state: true },
    draftName: { state: true },
    busy: { state: true },
    editingProfile: { state: true },
  };

  static override styles = [
    PcElement.styles,

    unsafeCSS(styles),
    unsafeCSS(theme),
    unsafeCSS(iconToggle),
    unsafeCSS(pill),
  ];

  declare app?: PaintCanvas;

  /** Which tool's settings are configured */
  declare kind: "brush" | "eraser";

  /** The settings to start from */
  declare config?: BrushConfig;

  /** The settings' name to start from */
  declare presetName?: string;

  /** The ID of the user's own preset being edited, if any (shows "Delete preset…") */
  declare editingId?: string;

  /** The settings as changed in the window */
  declare draft?: BrushConfig;

  /** The settings' name as changed in the window */
  declare draftName: string;

  /** Whether a preset is being saved or deleted */
  declare busy: boolean;

  /** The setting and source whose profile graph is being edited, if any */
  declare editingProfile?: { param: VaryingParam; source: VariationSource };

  /** The settings and name as last saved (or opened), to tell whether there are unsaved changes */
  private saved = "";

  /** Asks the user to confirm, in a dialog (replaceable for tests) */
  confirm: ConfirmFn = (options) => askConfirm(this.renderRoot, options);

  /** Asks the user to choose, in a dialog (replaceable for tests) */
  choose: ChooseFn = (options) => askChoice(this.renderRoot, options);

  /** Asks the user for text, in a dialog (replaceable for tests) */
  prompt: PromptFn = (options) => askText(this.renderRoot, options);

  /** Turns files into brush shapes (replaceable for tests) */
  readShape: (file: File) => Promise<ShapeImage> = (file) =>
    readShapeImage(file, { createCanvas: this.app?.createCanvas });

  /**
   * Reads a brush shape from the clipboard, or else from image data copied on the canvas (replaceable for tests)
   */
  readClipboard: () => Promise<ShapeImage> = () =>
    readClipboardShape(
      navigator.clipboard,
      { createCanvas: this.app?.createCanvas },
      async () => this.app?.copiedPng(),
    );

  constructor() {
    super();
    this.kind = "brush";
    this.busy = false;
    this.draftName = "";
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has("config") && this.config)
      this.draft = structuredClone(this.config);
    if (changed.has("presetName")) this.draftName = this.presetName ?? "";
    if (changed.has("config") || changed.has("presetName")) this.markSaved();
  }

  /** The settings and name as they are now, to compare */
  private snapshot(): string {
    return JSON.stringify([this.draft, this.draftName]);
  }

  /** Note the settings and name as saved */
  private markSaved(): void {
    this.saved = this.snapshot();
  }

  /** Whether there are changes since the settings were last saved (or opened) */
  get unsaved(): boolean {
    return this.snapshot() !== this.saved;
  }

  /** Fire an event that crosses shadow DOM boundaries */
  private emit(type: string, detail?: unknown): void {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true }),
    );
  }

  /** Change the draft settings (only shown, and so only changed, once there is a draft) */
  private change(changes: Partial<BrushConfig>): void {
    this.draft = { ...(this.draft as BrushConfig), ...changes };
  }

  /**
   * Change the width; with constrained proportions, the height and its variation follow.
   */
  private changeWidth(changes: Partial<BrushConfig>): void {
    const draft = this.draft as BrushConfig;
    if (!draft.constrainProportions) {
      this.change(changes);
      return;
    }
    const ratio = (draft.height ?? draft.width ?? 1) / (draft.width ?? 1);
    const width = changes.width ?? draft.width ?? 1;
    this.change({
      ...changes,
      height: Math.max(1, Math.round(width * ratio)),
      heightConfig: changes.widthConfig ?? draft.widthConfig,
    });
  }

  /** Apply changes to a setting */
  private changeParam(param: VaryingParam, changes: Partial<BrushConfig>) {
    if (param === "width") this.changeWidth(changes);
    else this.change(changes);
  }

  /**
   * Close the window without applying anything.
   */
  close(): void {
    this.emit("pc-close");
  }

  /**
   * Close the window (its ⨉ button or Escape), first asking whether to save unsaved changes: "Save" (to the preset
   * being edited) or "Add to presets…" (for others), "Don't save", or cancel (staying open).
   */
  async requestClose(): Promise<void> {
    if (!this.unsaved) {
      this.close();
      return;
    }
    const choice = await this.choose({
      heading: this.t("paintCanvas.brushConfig.unsavedHeading"),
      message: this.t("paintCanvas.brushConfig.unsavedMessage", {
        name: this.draftName,
      }),
      choices: [
        this.editingId
          ? { value: SAVE_CHOICE, label: this.t("paintCanvas.common.save") }
          : {
              value: ADD_CHOICE,
              label: this.t("paintCanvas.brushConfig.addToPresetsAsk"),
            },
        {
          value: DISCARD_CHOICE,
          label: this.t("paintCanvas.brushConfig.discard"),
          cancelling: true,
        },
      ],
      cancel: this.t("paintCanvas.common.cancel"),
    });
    if (choice === CANCEL_CHOICE) return;
    if (choice === SAVE_CHOICE) await this.save();
    if (choice === ADD_CHOICE) await this.addToPresets();
    // Closed unless saving didn't happen (e.g. it failed, or adding was cancelled)
    if (choice === DISCARD_CHOICE || !this.unsaved) this.close();
  }

  /** The tool's settings */
  private toolSettings(app: PaintCanvas) {
    return this.kind === "eraser" ? app.eraser : app.brush;
  }

  /**
   * Save a preset of the user's with the settings and name, select it on the tool, and tell the layout to apply them
   * (`pc-save`). Returns whether it was saved.
   */
  private async savePreset(
    app: PaintCanvas,
    draft: BrushConfig,
    name: string,
    id?: string,
  ): Promise<boolean> {
    const preset = { ...app.newPreset(draft, name), ...(id ? { id } : {}) };
    this.busy = true;
    try {
      await app.customPresets.save(preset);
      this.toolSettings(app).select(preset.id);
      this.editingId = preset.id;
      this.draftName = name;
      this.markSaved();
      this.emit("pc-save", {
        config: draft,
        name,
      } satisfies BrushConfigSaveDetail);
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.saved", { name }),
        kind: "success",
      });
      return true;
    } catch {
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.saveFailed", { name }),
        kind: "error",
      });
      return false;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Save the changes to the user's own preset being edited (`editingId`), and select it. Does nothing for others (e.g.
   * built-in presets, which can't change).
   */
  async save(): Promise<void> {
    const { app, draft, editingId } = this;
    if (!app || !draft || !editingId) return;
    await this.savePreset(app, draft, this.draftName.trim(), editingId);
  }

  /** Use a shape, showing why if it can't be used */
  private async useShape(read: () => Promise<ShapeImage>): Promise<void> {
    try {
      const shape = await read();
      const width = this.draft?.width ?? shape.width;
      this.change({
        image: shape.image,
        height: Math.max(1, Math.round((width * shape.height) / shape.width)),
      });
    } catch (error) {
      this.emit("pc-toast", {
        message: this.t(
          (error instanceof ShapeImageError &&
            SHAPE_ERROR_KEYS[error.message]) ||
            "paintCanvas.brushConfig.shapeFailed",
        ),
        kind: "error",
      });
    }
  }

  /**
   * Save the settings as one of the user's presets, asking for its name, and before replacing one of theirs with the
   * same name. The new preset is selected, and later saves go to it.
   */
  async addToPresets(): Promise<void> {
    const app = this.app;
    const draft = this.draft;
    if (!app || !draft) return;
    const name = (
      await this.prompt({
        heading: this.t("paintCanvas.brushConfig.addToPresets"),
        label: this.t("paintCanvas.brushConfig.presetName"),
        value: this.draftName,
        confirm: this.t("paintCanvas.common.save"),
        cancel: this.t("paintCanvas.common.cancel"),
      })
    )?.trim();
    if (!name) return;
    const existing = app.customPresets.findOwn(
      name,
      app.authorHandle,
      app.names.unknownAuthor,
    );
    if (
      existing &&
      !(await this.confirm({
        heading: this.t("paintCanvas.presets.replaceHeading"),
        message: this.t("paintCanvas.presets.replaceConfirm", { name }),
        confirm: this.t("paintCanvas.presets.replace"),
        cancel: this.t("paintCanvas.common.cancel"),
        cancelling: true,
      }))
    )
      return;
    await this.savePreset(app, draft, name, existing?.id);
  }

  /**
   * Delete the preset being edited, after confirming.
   */
  async deletePreset(): Promise<void> {
    const app = this.app;
    const id = this.editingId;
    if (!app || !id) return;
    const name = app.customPresets.get(id)?.name ?? "this preset";
    if (!(await this.confirm(deletePresetQuestion(this.translations, name))))
      return;
    this.busy = true;
    try {
      await app.customPresets.remove(id);
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.deleted", { name }),
        kind: "success",
      });
      this.close();
    } catch {
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.deleteFailed", { name }),
        kind: "error",
      });
    } finally {
      this.busy = false;
    }
  }

  /**
   * Render a slider for one value (a single `<pc-slider-range>`), the same as the ranges of settings that vary.
   */
  private single(
    className: string,
    label: string,
    value: number,
    limits: { min: number; max: number },
    onChange: (value: number) => void,
    disabled = false,
  ) {
    const changed = (event: CustomEvent<RangeDetail>) =>
      onChange(event.detail.value);
    return html`<pc-slider-range
      single
      class=${className}
      label=${label}
      min=${limits.min}
      max=${limits.max}
      .value=${live(Math.round(value))}
      ?disabled=${disabled || this.busy}
      @pc-input=${changed}
      @pc-change=${changed}
    ></pc-slider-range>`;
  }

  /**
   * Render a setting that can vary: its value (or range), its pressure, tilt and randomise toggles (several can be on),
   * and a row for each source turned on, with its range (0–100) and profile graph button
   */
  private renderParam(
    draft: BrushConfig,
    param: VaryingParam,
    label: string,
    disabled = false,
  ) {
    const range = readRange(draft, param);
    const limits = PARAM_LIMITS[param];
    const isOffset = param === "offsetX" || param === "offsetY";
    const off = disabled || this.busy;
    const write = (values: { value?: number; min?: number; max?: number }) =>
      this.changeParam(param, writeRange(draft, param, values));
    const writeEnds = (event: CustomEvent<RangeDetail>) =>
      write({ min: event.detail.low, max: event.detail.high });
    const values = range.varies
      ? html`<pc-slider-range
          class=${`${param} range`}
          label=${label}
          min=${limits.min}
          max=${limits.max}
          .low=${live(Math.round(range.min))}
          .high=${live(Math.round(range.max))}
          ?disabled=${off}
          @pc-input=${writeEnds}
          @pc-change=${writeEnds}
        ></pc-slider-range>`
      : this.single(
          param,
          label,
          isOffset ? 0 : range.value,
          isOffset ? { min: 0, max: limits.max } : limits,
          (value) => write({ value }),
          disabled || isOffset,
        );
    return html`<div class="param" data-param=${param}>
      <div class="row">
        <span class="label">${label}</span>
        ${values}
        <fieldset class="sources" ?disabled=${off}>
          <legend class="visually-hidden">
            ${this.t("paintCanvas.brushConfig.varyWith", { param: label })}
          </legend>
          ${VARIATION_SOURCES.map(
            (source) =>
              html`<label
                class="icon-toggle"
                title=${this.t(SOURCE_LABELS[source])}
              >
                <input
                  type="checkbox"
                  class=${`${param} ${source}`}
                  aria-label=${this.t("paintCanvas.brushConfig.variation", { param: label, source: this.t(SOURCE_LABELS[source]) })}
                  .checked=${live(range.sources[source].on)}
                  @change=${(e: Event) =>
                    this.changeParam(
                      param,
                      setSource(
                        draft,
                        param,
                        source,
                        (e.target as HTMLInputElement).checked,
                      ),
                    )}
                />
                ${iconLabel(this.iconUrl(SOURCE_ICONS[source]), this.t(SOURCE_LABELS[source]))}
              </label>`,
          )}
        </fieldset>
      </div>
      ${VARIATION_SOURCES.filter((source) => range.sources[source].on).map(
        (source) => this.renderSource(draft, param, label, source, off),
      )}
    </div>`;
  }

  /** Render a source's row under its setting: its range (0–100) and its profile graph button */
  private renderSource(
    draft: BrushConfig,
    param: VaryingParam,
    paramLabel: string,
    source: VariationSource,
    disabled: boolean,
  ) {
    const { min, max, profile } = readRange(draft, param).sources[source];
    const label = this.t(SOURCE_ROW_LABELS[source]);
    const writeEnds = (event: CustomEvent<RangeDetail>) =>
      this.changeParam(
        param,
        writeSourceRange(draft, param, source, {
          min: event.detail.low / 100,
          max: event.detail.high / 100,
        }),
      );
    const profileLabel = this.t("paintCanvas.profileEditor.sourceButton", {
      param: paramLabel,
      source: label,
    });
    return html`<div class="row source" data-source=${source}>
      <span class="label">${label}</span>
      <pc-slider-range
        class=${`${param} ${source} source-range`}
        label=${`${paramLabel}: ${label}`}
        min="0"
        max="100"
        .low=${live(Math.round(min * 100))}
        .high=${live(Math.round(max * 100))}
        ?disabled=${disabled}
        @pc-input=${writeEnds}
        @pc-change=${writeEnds}
      ></pc-slider-range>
      <button
        type="button"
        class=${`icon-button profile ${param} ${source} ${profile ? "configured" : ""}`}
        title=${profileLabel}
        aria-haspopup="dialog"
        ?disabled=${disabled}
        @click=${() => (this.editingProfile = { param, source })}
      >
        ${iconLabel(this.iconUrl("profileGraph"), profileLabel)}
      </button>
    </div>`;
  }

  /**
   * Use a built-in shape (see `BUILT_IN_SHAPES`), keeping the width; they're all square, so the height is the same.
   */
  private useBuiltInShape(id: string): void {
    const shape = BUILT_IN_SHAPES.find((built) => built.id === id);
    if (!shape) return;
    const width = this.draft?.width ?? 1;
    this.change({ image: shape.image, height: width });
  }

  /** Render the shape and smoothing row */
  private renderShape(draft: BrushConfig) {
    const shapeId = builtInShapeId(draft.image);
    const smoothing =
      draft.smoothingType === SmoothingType.None ||
      draft.smoothingType === undefined
        ? SmoothingType.Linear
        : draft.smoothingType;
    return html`<div class="row shape-row">
      <span class="label">${this.t("paintCanvas.brushConfig.shape")}</span>
      <pc-context-menu
        class="shape-menu"
        label=${this.t("paintCanvas.brushConfig.chooseShape")}
        .items=${BUILT_IN_SHAPES.map((shape): MenuItem => ({
          value: shape.id,
          label: shape.name,
          image: shape.image,
          selected: shape.id === shapeId,
        }))}
        ?disabled=${this.busy}
        @pc-select=${(e: CustomEvent<{ value: string }>) =>
          this.useBuiltInShape(e.detail.value)}
      >
        <span
          slot="icon"
          class=${draft.image ? "shape-preview image" : "shape-preview"}
          title=${this.t("paintCanvas.brushConfig.chooseShape")}
          style=${styleMap({
            maskImage:
              typeof draft.image === "string"
                ? `url("${draft.image}")`
                : undefined,
          })}
        ></span>
      </pc-context-menu>
      <button
        type="button"
        class="pill upload"
        ?disabled=${this.busy}
        @click=${() =>
          this.renderRoot
            .querySelector<HTMLInputElement>("input.shape")
            ?.click()}
      >
        ${this.t("paintCanvas.brushConfig.upload")}
      </button>
      <!-- Chosen through "Upload" -->
      <label class="visually-hidden">
        Upload a shape (PNG)
        <input
          type="file"
          class="shape"
          tabindex="-1"
          accept="image/png"
          ?disabled=${this.busy}
          @change=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = "";
            if (file) void this.useShape(() => this.readShape(file));
          }}
        />
      </label>
      <button
        type="button"
        class="icon-button paste"
        title=${this.t("paintCanvas.brushConfig.paste")}
        ?disabled=${this.busy}
        @click=${() => void this.useShape(this.readClipboard)}
      >
        ${iconLabel(this.iconUrl("clipboard"), this.t("paintCanvas.brushConfig.paste"))}
      </button>
      <fieldset class="smoothing">
        <legend>${this.t("paintCanvas.brushConfig.smoothing")}</legend>
        ${SMOOTHING_CHOICES.map(
          (choice) =>
            html`<label class="icon-toggle" title=${this.t(choice.label)}>
              <input
                type="radio"
                name="smoothing"
                .value=${String(choice.value)}
                .checked=${smoothing === choice.value}
                ?disabled=${this.busy}
                @change=${() => this.change({ smoothingType: choice.value })}
              />
              ${iconLabel(this.iconUrl(choice.icon), this.t(choice.label))}
            </label>`,
        )}
      </fieldset>
    </div>`;
  }

  override render() {
    const draft = this.draft;
    if (!draft) return nothing;
    const constrained = draft.constrainProportions ?? false;
    const sampleLimits = { min: MIN_SAMPLE_RATE, max: MAX_SAMPLE_RATE };
    const spacingLimits = { min: 0, max: MAX_SPACING };
    // Not closed by a press outside it, which would lose the changes
    return html`<pc-dialog-window
        open
        shaded
        dismissible="false"
        label=${this.t(this.kind === "eraser" ? "paintCanvas.brushConfig.eraserTitle" : "paintCanvas.brushConfig.brushTitle")}
        @pc-dismiss=${(event: Event) => {
          event.preventDefault();
          void this.requestClose();
        }}
      >
        <label slot="header-start" class="name-field">
          ${this.t("paintCanvas.brushConfig.name")}
          <span class="name-input">
            <input
              class="name"
              .value=${this.draftName}
              ?disabled=${this.busy}
              @input=${(e: Event) =>
                (this.draftName = (e.target as HTMLInputElement).value)}
            />
            ${
              this.unsaved
                ? html`<span
                    class="unsaved"
                    role="img"
                    aria-label=${this.t("paintCanvas.brushConfig.unsaved")}
                    title=${this.t("paintCanvas.brushConfig.unsaved")}
                    >*</span
                  >`
                : nothing
            }
          </span>
        </label>
        <div slot="body" class="settings">
          <pc-brush-test
            .config=${draft}
            .tips=${this.app?.tips}
            .createCanvas=${this.app?.createCanvas ?? createMemoryCanvas}
          ></pc-brush-test>
          ${this.renderShape(draft)}
          ${this.renderParam(draft, "width", this.t(PARAM_LABELS.width))}
          <div class="row">
            <span class="label"></span>
            <label
              class="icon-toggle"
              title=${this.t("paintCanvas.toolSettings.constrainProportions")}
            >
              <input
                type="checkbox"
                class="constrain"
                .checked=${constrained}
                ?disabled=${this.busy}
                @change=${(e: Event) =>
                  this.change({
                    constrainProportions: (e.target as HTMLInputElement)
                      .checked,
                  })}
              />
              ${iconLabel(this.iconUrl(constrained ? "linked" : "unlinked"), this.t("paintCanvas.toolSettings.constrainProportions"))}
            </label>
          </div>
          ${this.renderParam(draft, "height", this.t(PARAM_LABELS.height), constrained)}
          ${this.renderParam(draft, "alpha", this.t(PARAM_LABELS.alpha))}
          ${this.renderParam(draft, "rotation", this.t(PARAM_LABELS.rotation))}
          <div class="row">
            <span class="label"></span>
            <pc-toggle-checkbox
              class="follow-lean"
              .checked=${live(followsLean(draft))}
              ?disabled=${this.busy}
              @change=${(e: CustomEvent<{ checked: boolean }>) =>
                this.change(setFollowsLean(draft, e.detail.checked))}
            >
              ${this.t("paintCanvas.brushConfig.followLean")}
            </pc-toggle-checkbox>
          </div>
          ${this.renderParam(draft, "offsetX", this.t(PARAM_LABELS.offsetX))}
          ${this.renderParam(draft, "offsetY", this.t(PARAM_LABELS.offsetY))}
          <div class="row">
            <span class="label"
              >${this.t("paintCanvas.brushConfig.sampleRate")}</span
            >
            ${this.single("sample-rate", this.t("paintCanvas.brushConfig.sampleRate"), draft.sampleRate ?? MIN_SAMPLE_RATE, sampleLimits, (sampleRate) => this.change({ sampleRate }))}
          </div>
          <div class="row">
            <span class="label"
              >${this.t("paintCanvas.brushConfig.spacing")}</span
            >
            ${this.single("spacing", this.t("paintCanvas.brushConfig.spacing"), draft.spacing ?? 5, spacingLimits, (spacing) => this.change({ spacing }))}
          </div>
          <pc-toggle-checkbox
            class="snap"
            .checked=${draft.snapToPixelGrid ?? false}
            ?disabled=${this.busy}
            @change=${(e: CustomEvent<{ checked: boolean }>) =>
              this.change({ snapToPixelGrid: e.detail.checked })}
          >
            ${this.t("paintCanvas.brushConfig.snapToPixelGrid")}
          </pc-toggle-checkbox>
        </div>
        ${
          this.editingId
            ? html`<button
                slot="footer-start"
                type="button"
                class="cancel delete"
                ?disabled=${this.busy}
                @click=${() => void this.deletePreset()}
              >
                ${this.t("paintCanvas.brushConfig.deletePreset")}
              </button>`
            : nothing
        }
        <div slot="footer-end" class="actions">
          <button
            type="button"
            class="add affirmative"
            ?disabled=${this.busy}
            @click=${() => void this.addToPresets()}
          >
            ${this.t("paintCanvas.brushConfig.addToPresets")}
          </button>
          <button
            type="button"
            class="save affirmative"
            title=${this.editingId ? nothing : this.t("paintCanvas.brushConfig.saveBuiltIn")}
            ?disabled=${this.busy || !this.editingId}
            @click=${() => void this.save()}
          >
            ${this.t("paintCanvas.common.save")}
          </button>
        </div>
      </pc-dialog-window>
      ${this.renderProfileEditor(draft)}`;
  }

  /** The profile graph editor for the source being edited, while open */
  private renderProfileEditor(draft: BrushConfig) {
    const editing = this.editingProfile;
    if (!editing) return nothing;
    const { param, source } = editing;
    const { profile, profileId } = readRange(draft, param).sources[source];
    return html`<pc-profile-editor
      .profiles=${this.app?.profiles ?? this.profiles}
      .author=${this.app?.author}
      .points=${profile}
      profile-id=${profileId ?? (profile ? nothing : LINEAR_PROFILE_ID)}
      label=${`${this.t(PARAM_LABELS[param])}: ${this.t(SOURCE_ROW_LABELS[source])}`}
      @pc-save=${(event: CustomEvent<ProfileSaveDetail>) => {
        event.stopPropagation();
        const { points, profileId: id } = event.detail;
        // A straight line changes nothing, so it isn't stored
        const linear = isLinear(points);
        this.changeParam(
          param,
          writeSourceProfile(
            draft,
            param,
            source,
            linear ? undefined : points,
            id,
          ),
        );
        this.editingProfile = undefined;
      }}
      @pc-close=${(event: Event) => {
        event.stopPropagation();
        this.editingProfile = undefined;
      }}
    ></pc-profile-editor>`;
  }

  /** Profile graphs, when there's no canvas to keep them */
  private readonly profiles = new ProfileGraphs();
}

defineElement("pc-brush-config", PcBrushConfig);
