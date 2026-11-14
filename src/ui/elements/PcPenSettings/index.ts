import { css, html, nothing, unsafeCSS } from "lit";
import { live } from "lit/directives/live.js";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import {
  ICON_CONTROLS_CSS as iconToggle,
  PILLS_CSS as pill,
} from "../../styles";
import { iconLabel } from "../../icons";
import "../PcToggleCheckbox";
import "../PcSliderRange";
import "../PcProfileEditor";
import type { ProfileSaveDetail } from "../PcProfileEditor";
import type { RangeDetail } from "../PcSliderRange";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import type BrushSettings from "../../../lib/classes/BrushSettings";
import type { BrushConfig } from "../../../lib/brushes/types";
import { isLinear, LINEAR_PROFILE_ID } from "../../../lib/profiles";
import {
  PARAM_LIMITS,
  PEN_PARAMS,
  configKey,
  readRange,
  resetSource,
  selectSource,
  writeRange,
  type PenSource,
} from "../../../lib/brushes/configRanges";

/** A setting the pen settings vary */
type PenParam = (typeof PEN_PARAMS)[number];

/** Translation keys of the settings' names */
const PARAM_LABELS: Record<PenParam, string> = {
  width: "paintCanvas.common.width",
  height: "paintCanvas.common.height",
  alpha: "paintCanvas.common.opacity",
  rotation: "paintCanvas.brushConfig.rotation",
};

/** Translation keys of each source's heading */
const HEADINGS: Record<PenSource, string> = {
  pressure: "paintCanvas.toolSettings.pressureSettings",
  tilt: "paintCanvas.toolSettings.tiltSettings",
};

/**
 * How a brush or eraser varies with pen pressure or tilt (`source`), for the tool settings bar's popovers: for the
 * width, height, opacity and rotation, a switch, a range (in pixels, percent or degrees, as in `<pc-brush-config>`)
 * and a profile graph button; constrain proportions (the height then follows the width, so its controls are off); and
 * "Reset to brush defaults", which puts back the selected preset's. A setting varies with one source at a time, so
 * switching it on here switches its other source off. With tilt, the rotation follows the pen's lean, so it has no
 * range.
 *
 * Changes are to the current settings (`settings.update`), not the preset, and aren't saved.
 *
 * @example
 * html`<pc-pen-settings .app=${app} .settings=${app.brush} source="pressure"></pc-pen-settings>`
 */
export class PcPenSettings extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    settings: { attribute: false },
    source: { type: String },
    editingProfile: { state: true },
  };

  static override styles = [
    PcElement.styles,
    unsafeCSS(iconToggle),
    unsafeCSS(pill),
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 260px;
        max-width: 100%;
      }
      h2 {
        margin: 0;
        font-size: inherit;
        font-weight: 600;
        text-align: center;
      }
      .param {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .constrain {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      /* A profile graph that isn't a straight line */
      .profile.configured {
        border-color: var(--pc-accent);
        background: var(--pc-accent);
      }
      .icon-toggle:has(input:checked) {
        border-color: var(--pc-accent);
        background: var(--pc-accent);
        color: var(--pc-accent-text);
      }
      .reset {
        align-self: stretch;
      }
    `,
  ];

  declare app?: PaintCanvas;

  /** The brush or eraser's settings */
  declare settings?: BrushSettings;

  /** What the settings vary with: pen pressure or tilt */
  declare source: PenSource;

  /** The setting whose profile graph is being edited, if any */
  declare editingProfile?: PenParam;

  private changes = new ChangeController(this, () => [this.settings]);

  constructor() {
    super();
    this.source = "pressure";
  }

  /** The current settings, with the size the brush has (which ranges of width and height go up to) */
  private config(settings: BrushSettings): BrushConfig {
    return {
      ...settings.preset,
      width: settings.width,
      height: settings.height,
    };
  }

  /** Apply config changes: the size with the brush's size, the rest to its current settings */
  private apply(settings: BrushSettings, changes: Partial<BrushConfig>): void {
    const { width, height, ...rest } = changes;
    settings.update(rest);
    if (width !== undefined) settings.setSize(width, settings.height);
    if (height !== undefined) settings.setHeight(height);
  }

  /** Render one setting: its switch, profile graph button and range */
  private renderParam(settings: BrushSettings, param: PenParam) {
    const config = this.config(settings);
    const source = this.source;
    const range = readRange(config, param);
    const on = range.sources[source];
    const label = this.t(PARAM_LABELS[param]);
    // The height follows the width while proportions are constrained
    const disabled = param === "height" && Boolean(config.constrainProportions);
    // The rotation follows the pen's lean, so it has no range
    const ranged = !(source === "tilt" && param === "rotation");
    const limits = PARAM_LIMITS[param];
    const writeEnds = (event: CustomEvent<RangeDetail>) =>
      this.apply(
        settings,
        writeRange(this.config(settings), param, {
          min: event.detail.low,
          max: event.detail.high,
        }),
      );
    const profileLabel = this.t("paintCanvas.profileEditor.button", {
      param: label,
    });
    return html`<div class="param" data-param=${param}>
      <div class="heading">
        <pc-toggle-checkbox
          class=${`${param} switch`}
          .checked=${live(on)}
          ?disabled=${disabled}
          @change=${(event: CustomEvent<{ checked: boolean }>) =>
            this.apply(
              settings,
              selectSource(
                this.config(settings),
                param,
                event.detail.checked ? source : undefined,
              ),
            )}
        >
          ${label}
        </pc-toggle-checkbox>
        <button
          type="button"
          class=${`icon-button profile ${param} ${config[configKey(param)]?.profile ? "configured" : ""}`}
          title=${profileLabel}
          aria-haspopup="dialog"
          ?disabled=${!on || disabled}
          @click=${() => (this.editingProfile = param)}
        >
          ${iconLabel(this.iconUrl("profileGraph"), profileLabel)}
        </button>
      </div>
      ${
        ranged
          ? html`<pc-slider-range
              class=${`${param} range`}
              label=${label}
              min=${limits.min}
              max=${limits.max}
              .low=${live(Math.round(range.min))}
              .high=${live(Math.round(range.max))}
              ?disabled=${!on || disabled}
              @pc-input=${writeEnds}
              @pc-change=${writeEnds}
            ></pc-slider-range>`
          : nothing
      }
    </div>`;
  }

  /** Render constrain proportions, between the width and height */
  private renderConstrain(settings: BrushSettings) {
    const on = settings.preset.constrainProportions ?? false;
    const label = this.t("paintCanvas.toolSettings.constrainProportions");
    return html`<div class="constrain">
      <label class="icon-toggle" title=${label}>
        <input
          type="checkbox"
          class="constrain"
          .checked=${live(on)}
          @change=${(event: Event) =>
            settings.update({
              constrainProportions: (event.target as HTMLInputElement).checked,
            })}
        />
        ${iconLabel(this.iconUrl(on ? "linked" : "unlinked"), label)}
      </label>
      <span aria-hidden="true">${label}</span>
    </div>`;
  }

  /** The profile graph editor for the setting being edited, while open */
  private renderProfileEditor(settings: BrushSettings) {
    const param = this.editingProfile;
    if (!param || !this.app) return nothing;
    const key = configKey(param);
    const variation = settings.preset[key] ?? {};
    return html`<pc-profile-editor
      .profiles=${this.app.profiles}
      .author=${this.app.author}
      .points=${variation.profile}
      profile-id=${
        variation.profileId ?? (variation.profile ? nothing : LINEAR_PROFILE_ID)
      }
      label=${this.t(PARAM_LABELS[param])}
      @pc-save=${(event: CustomEvent<ProfileSaveDetail>) => {
        event.stopPropagation();
        const { points, profileId } = event.detail;
        // A straight line changes nothing, so it isn't stored
        const linear = isLinear(points);
        settings.update({
          [key]: {
            ...settings.preset[key],
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

  override render() {
    const settings = this.settings;
    if (!settings) return nothing;
    return html`<h2>${this.t(HEADINGS[this.source])}</h2>
      ${this.renderParam(settings, "width")} ${this.renderConstrain(settings)}
      ${this.renderParam(settings, "height")}
      ${this.renderParam(settings, "alpha")}
      ${this.renderParam(settings, "rotation")}
      <button
        type="button"
        class="pill reset"
        ?disabled=${!settings.selectedPreset}
        @click=${() => {
          const preset = settings.selectedPreset;
          if (preset)
            settings.update(
              resetSource(settings.preset, preset.content, this.source),
            );
        }}
      >
        ${this.t("paintCanvas.toolSettings.resetToBrush")}
      </button>
      ${this.renderProfileEditor(settings)}`;
  }
}

defineElement("pc-pen-settings", PcPenSettings);
