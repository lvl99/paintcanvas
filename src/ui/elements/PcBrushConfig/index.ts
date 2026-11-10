import { html, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { WINDOWS_CSS as theme } from "../../styles";
import { PILLS_CSS as pill } from "../../styles";
import { ICON_CONTROLS_CSS as iconToggle } from "../../styles";
import { iconLabel } from "../../icons";
import {
  askConfirm,
  askText,
  deletePresetQuestion,
  type ConfirmFn,
  type PromptFn,
} from "../../ask";
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
import {
  SmoothingType,
  type BrushConfig,
  type BrushParamConfig,
} from "../../../lib/brushes/types";
import {
  PARAM_LIMITS,
  VARIATION_SOURCES,
  configKey,
  readRange,
  selectSource,
  writeRange,
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

export type { ConfirmFn, PromptFn } from "../../ask";

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

/** The shape picker's value for a shape the user uploaded or pasted */
const CUSTOM_SHAPE = "custom";

/** Translation keys of the brush shape error messages */
const SHAPE_ERROR_KEYS: Record<string, string> = {
  [SHAPE_ERRORS.type]: "paintCanvas.shape.notPng",
  [SHAPE_ERRORS.size]: "paintCanvas.shape.tooLarge",
  [SHAPE_ERRORS.decode]: "paintCanvas.shape.readFailed",
  [SHAPE_ERRORS.noImage]: "paintCanvas.shape.noPngToPaste",
};

/** Largest stamp spacing in pixels */
const MAX_SPACING = 200;

/**
 * The brush (or eraser) configuration window: a testing area, the shape (pressing it picks a built-in shape from the
 * device's own list, which says "Custom" for an uploaded or pasted one; or upload or paste one), smoothing, width, height,
 * opacity, rotation, offsets, sample rate, spacing and snapping to the pixel grid. Width, height, opacity, rotation and the offsets can vary with
 * pressure, tilt and randomness; when any is on, the setting has a min and max, set with a `<pc-slider-range>`.
 *
 * Changes stay in the window until "Save" (fires `pc-save` with the settings, to apply to the current tool) or "Add to
 * presets" (saves them as one of the user's presets, asking before replacing one with the same name, and selects it).
 * "Delete preset…" shows when editing one of the user's presets. It's a shaded `<pc-dialog-window>`, closed with its ⨉
 * button or Escape (not a press outside it, which would lose the changes). Fires `pc-close` when closed, and `pc-toast`
 * with a message after adding or deleting a preset, or when a shape can't be used.
 *
 * @example
 * html`<pc-brush-config .app=${app} kind="brush" .config=${app.brush.preset} @pc-save=${apply}></pc-brush-config>`
 */
export class PcBrushConfig extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    kind: { type: String },
    config: { attribute: false },
    editingId: { type: String },
    draft: { state: true },
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

  /** The ID of the user's own preset being edited, if any (shows "Delete preset…") */
  declare editingId?: string;

  /** The settings as changed in the window */
  declare draft?: BrushConfig;

  /** Whether a preset is being saved or deleted */
  declare busy: boolean;

  /** The setting whose profile graph is being edited, if any */
  declare editingProfile?: VaryingParam;

  /** Asks the user to confirm, in a dialog (replaceable for tests) */
  confirm: ConfirmFn = (options) => askConfirm(this.renderRoot, options);

  /** Asks the user for text, in a dialog (replaceable for tests) */
  prompt: PromptFn = (options) => askText(this.renderRoot, options);

  /** Turns files into brush shapes (replaceable for tests) */
  readShape: (file: File) => Promise<ShapeImage> = readShapeImage;

  /**
   * Reads a brush shape from the clipboard, or else from image data copied on the canvas (replaceable for tests)
   */
  readClipboard: () => Promise<ShapeImage> = () =>
    readClipboardShape(navigator.clipboard, {}, async () =>
      this.app?.copiedPng(),
    );

  constructor() {
    super();
    this.kind = "brush";
    this.busy = false;
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (changed.has("config") && this.config)
      this.draft = structuredClone(this.config);
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
   * Apply the settings to the current tool.
   */
  save(): void {
    if (this.draft) this.emit("pc-save", this.draft);
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
   * same name. The new preset is selected.
   */
  async addToPresets(): Promise<void> {
    const app = this.app;
    const draft = this.draft;
    if (!app || !draft) return;
    const name = (
      await this.prompt({
        heading: this.t("paintCanvas.brushConfig.addToPresets"),
        label: this.t("paintCanvas.brushConfig.presetName"),
        value: draft.name ?? "",
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
    const preset = {
      ...app.newPreset(draft, name),
      ...(existing ? { id: existing.id } : {}),
    };
    this.busy = true;
    try {
      await app.customPresets.save(preset);
      (this.kind === "eraser" ? app.eraser : app.brush).select(preset.id);
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.saved", { name }),
        kind: "success",
      });
      this.close();
    } catch {
      this.emit("pc-toast", {
        message: this.t("paintCanvas.presets.saveFailed", { name }),
        kind: "error",
      });
    } finally {
      this.busy = false;
    }
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

  /** Render a setting that can vary: its value (or min and max), and its pressure, tilt and randomise icon toggles */
  private renderParam(
    draft: BrushConfig,
    param: VaryingParam,
    label: string,
    disabled = false,
  ) {
    const range = readRange(draft, param);
    const limits = PARAM_LIMITS[param];
    const isOffset = param === "offsetX" || param === "offsetY";
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
          ?disabled=${disabled || this.busy}
          @pc-input=${writeEnds}
          @pc-change=${writeEnds}
        ></pc-slider-range>`
      : this.single(
          param,
          label,
          range.value,
          limits,
          (value) => write({ value }),
          disabled || isOffset,
        );
    // One source at a time: pressing the chosen one again turns variation off
    const active = VARIATION_SOURCES.find((source) => range.sources[source]);
    const select = (source: VariationSource | undefined) =>
      this.changeParam(param, selectSource(draft, param, source));
    return html`<div class="row" data-param=${param}>
      <span class="label">${label}</span>
      ${values}
      <fieldset class="sources" ?disabled=${disabled || this.busy}>
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
                type="radio"
                name=${`${param}-source`}
                class=${`${param} ${source}`}
                aria-label=${this.t("paintCanvas.brushConfig.variation", { param: label, source: this.t(SOURCE_LABELS[source]) })}
                .checked=${live(active === source)}
                @change=${() => select(source)}
                @click=${() => {
                  if (active === source) select(undefined);
                }}
              />
              ${iconLabel(this.iconUrl(SOURCE_ICONS[source]), this.t(SOURCE_LABELS[source]))}
            </label>`,
        )}
      </fieldset>
      <button
        type="button"
        class=${`icon-button profile ${param} ${draft[configKey(param)]?.profile ? "configured" : ""}`}
        title=${this.t("paintCanvas.profileEditor.button", { param: label })}
        aria-haspopup="dialog"
        ?disabled=${!active || disabled || this.busy}
        @click=${() => (this.editingProfile = param)}
      >
        ${iconLabel(this.iconUrl("profileGraph"), this.t("paintCanvas.profileEditor.button", { param: label }))}
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
      <span class="shape-picker">
        <span
          class=${draft.image ? "shape-preview image" : "shape-preview"}
          style=${styleMap({
            maskImage:
              typeof draft.image === "string"
                ? `url("${draft.image}")`
                : undefined,
          })}
        ></span>
        <!-- Over the shape, so pressing it opens the device's own list -->
        <select
          class="shape-select"
          aria-label=${this.t("paintCanvas.brushConfig.shape")}
          title=${this.t("paintCanvas.brushConfig.chooseShape")}
          ?disabled=${this.busy}
          @change=${(e: Event) =>
            this.useBuiltInShape((e.target as HTMLSelectElement).value)}
        >
          ${
            shapeId === undefined
              ? html`<option value=${CUSTOM_SHAPE} .selected=${true}>
                  ${this.t("paintCanvas.brushConfig.customShape")}
                </option>`
              : nothing
          }
          ${BUILT_IN_SHAPES.map(
            (shape) =>
              html`<option
                value=${shape.id}
                .selected=${live(shape.id === shapeId)}
              >
                ${shape.name}
              </option>`,
          )}
        </select>
      </span>
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
          this.close();
        }}
      >
        <label slot="header-start" class="name-field">
          ${this.t("paintCanvas.brushConfig.name")}
          <input
            class="name"
            .value=${draft.name ?? ""}
            ?disabled=${this.busy}
            @input=${(e: Event) =>
              this.change({ name: (e.target as HTMLInputElement).value })}
          />
        </label>
        <div slot="body" class="settings">
          <pc-brush-test
            .config=${draft}
            .tips=${this.app?.tips}
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
            ?disabled=${this.busy}
            @click=${() => this.save()}
          >
            ${this.t("paintCanvas.common.save")}
          </button>
        </div>
      </pc-dialog-window>
      ${this.renderProfileEditor(draft)}`;
  }

  /** The profile graph editor for the setting being edited, while open */
  private renderProfileEditor(draft: BrushConfig) {
    const param = this.editingProfile;
    if (!param) return nothing;
    const key = configKey(param);
    // Only open for a setting that varies, so it has a variation
    const variation = draft[key] as BrushParamConfig;
    return html`<pc-profile-editor
      .profiles=${this.app?.profiles ?? this.profiles}
      .points=${variation.profile}
      profile-id=${variation.profileId ?? (variation.profile ? nothing : LINEAR_PROFILE_ID)}
      label=${this.t(PARAM_LABELS[param])}
      @pc-save=${(event: CustomEvent<ProfileSaveDetail>) => {
        event.stopPropagation();
        const { points, profileId } = event.detail;
        // A straight line changes nothing, so it isn't stored
        const linear = isLinear(points);
        this.changeParam(param, {
          [key]: {
            ...variation,
            profile: linear ? undefined : points,
            profileId: linear ? undefined : profileId,
          },
        });
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
