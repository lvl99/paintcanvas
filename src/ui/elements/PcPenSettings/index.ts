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
  followsLean,
  readRange,
  setFollowsLean,
  resetSource,
  setSource,
  writeRange,
  writeSourceProfile,
  writeSourceRange,
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

/** Translation keys of each source's range name */
const SOURCE_LABELS: Record<PenSource, string> = {
  pressure: "paintCanvas.brushConfig.penPressure",
  tilt: "paintCanvas.brushConfig.penTilt",
};

/** Translation keys of each source's heading */
const HEADINGS: Record<PenSource, string> = {
  pressure: "paintCanvas.toolSettings.pressureSettings",
  tilt: "paintCanvas.toolSettings.tiltSettings",
};

/**
 * How a brush or eraser varies with pen pressure or tilt (`source`), for the tool settings bar's popovers, as in
 * `<pc-brush-config>`: for the width, height, opacity and rotation, a switch and the source's profile graph button,
 * and while on, the setting's range (in pixels, percent or degrees, shared by its sources) and the source's range
 * (0–100); constrain proportions (the height then follows the width, so its controls are off); with tilt, whether the
 * rotation follows the pen's lean; and "Reset to brush defaults", which puts back the selected preset's. A setting can
 * vary with pressure and tilt (and randomness) at once.
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
      /* The source's range, named, under the setting's */
      .source {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-left: 12px;
        font-size: var(--pc-font-size-small);
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

  /** The setting whose source's profile graph is being edited, if any */
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

  /** Render one setting: its switch and profile graph button, and while on, its range and the source's */
  private renderParam(settings: BrushSettings, param: PenParam) {
    const config = this.config(settings);
    const source = this.source;
    const range = readRange(config, param);
    const { on, min, max, profile } = range.sources[source];
    const label = this.t(PARAM_LABELS[param]);
    const sourceLabel = this.t(SOURCE_LABELS[source]);
    // The height follows the width while proportions are constrained
    const disabled = param === "height" && Boolean(config.constrainProportions);
    const limits = PARAM_LIMITS[param];
    const writeEnds = (event: CustomEvent<RangeDetail>) =>
      this.apply(
        settings,
        writeRange(this.config(settings), param, {
          min: event.detail.low,
          max: event.detail.high,
        }),
      );
    const writeSourceEnds = (event: CustomEvent<RangeDetail>) =>
      this.apply(
        settings,
        writeSourceRange(this.config(settings), param, source, {
          min: event.detail.low / 100,
          max: event.detail.high / 100,
        }),
      );
    const profileLabel = this.t("paintCanvas.profileEditor.sourceButton", {
      param: label,
      source: sourceLabel,
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
              setSource(
                this.config(settings),
                param,
                source,
                event.detail.checked,
              ),
            )}
        >
          ${label}
        </pc-toggle-checkbox>
        <button
          type="button"
          class=${`icon-button profile ${param} ${profile ? "configured" : ""}`}
          title=${profileLabel}
          aria-haspopup="dialog"
          ?disabled=${!on || disabled}
          @click=${() => (this.editingProfile = param)}
        >
          ${iconLabel(this.iconUrl("profileGraph"), profileLabel)}
        </button>
      </div>
      <pc-slider-range
        class=${`${param} range`}
        label=${label}
        min=${limits.min}
        max=${limits.max}
        .low=${live(Math.round(range.min))}
        .high=${live(Math.round(range.max))}
        ?disabled=${!on || disabled}
        @pc-input=${writeEnds}
        @pc-change=${writeEnds}
      ></pc-slider-range>
      ${
        on
          ? html`<div class="source">
              <span>${sourceLabel}</span>
              <pc-slider-range
                class=${`${param} source-range`}
                label=${`${label}: ${sourceLabel}`}
                min="0"
                max="100"
                .low=${live(Math.round(min * 100))}
                .high=${live(Math.round(max * 100))}
                ?disabled=${disabled}
                @pc-input=${writeSourceEnds}
                @pc-change=${writeSourceEnds}
              ></pc-slider-range>
            </div>`
          : nothing
      }
    </div>`;
  }

  /** Render whether the rotation follows the pen's lean, under it in the tilt settings */
  private renderFollowLean(settings: BrushSettings) {
    return html`<pc-toggle-checkbox
      class="follow-lean"
      size="s"
      .checked=${live(followsLean(settings.preset))}
      @change=${(event: CustomEvent<{ checked: boolean }>) =>
        settings.update(setFollowsLean(settings.preset, event.detail.checked))}
    >
      ${this.t("paintCanvas.brushConfig.followLean")}
    </pc-toggle-checkbox>`;
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

  /** The profile graph editor for the source of the setting being edited, while open */
  private renderProfileEditor(settings: BrushSettings) {
    const param = this.editingProfile;
    if (!param || !this.app) return nothing;
    const source = this.source;
    const { profile, profileId } = readRange(settings.preset, param).sources[
      source
    ];
    return html`<pc-profile-editor
      .profiles=${this.app.profiles}
      .author=${this.app.author}
      .points=${profile}
      profile-id=${profileId ?? (profile ? nothing : LINEAR_PROFILE_ID)}
      label=${`${this.t(PARAM_LABELS[param])}: ${this.t(SOURCE_LABELS[source])}`}
      @pc-save=${(event: CustomEvent<ProfileSaveDetail>) => {
        event.stopPropagation();
        const { points, profileId: id } = event.detail;
        // A straight line changes nothing, so it isn't stored
        const linear = isLinear(points);
        this.apply(
          settings,
          writeSourceProfile(
            this.config(settings),
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

  override render() {
    const settings = this.settings;
    if (!settings) return nothing;
    return html`<h2>${this.t(HEADINGS[this.source])}</h2>
      ${this.renderParam(settings, "width")} ${this.renderConstrain(settings)}
      ${this.renderParam(settings, "height")}
      ${this.renderParam(settings, "alpha")}
      ${this.renderParam(settings, "rotation")}
      ${this.source === "tilt" ? this.renderFollowLean(settings) : nothing}
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
