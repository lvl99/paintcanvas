import { css, html, nothing } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import ChangeController from "../../ChangeController";
import {
  isTouchDevice,
  zoomModifierName,
  type InputSettingsData,
} from "../../../lib/classes/InputSettings";
import {
  GESTURE_ACTIONS,
  TOUCH_GESTURES,
  assignGesture,
  type GestureAction,
  type TouchGesture,
} from "../../../lib/utils/gestures";

/** Settings `pc-input-settings` can change: PaintCanvas's `InputSettings`, or anything with the same data and `update` */
export interface InputSettingsLike extends EventTarget {
  readonly data: Readonly<InputSettingsData>;
  update(changes: Partial<InputSettingsData>): void;
}

/** The on/off settings shown, by name */
type ToggleSetting =
  "scrollPan" | "pinchZoom" | "modifierScrollZoom" | "focusPen";

/** Translation keys of the gesture actions' names */
const ACTION_KEYS: Record<GestureAction, string> = {
  undo: "common.undo",
  redo: "common.redo",
  copy: "common.copy",
  paste: "common.paste",
};

/**
 * How the user's input devices control the canvas: scrolling and pinching (with Cmd/Ctrl + scroll to zoom on devices
 * with a mouse or trackpad), focus pen mode, which touch gesture undoes, redoes, copies and pastes (on touch devices),
 * and the language. Changes apply straight away. Hide focus pen mode or the language with `focusPen` and `languages`
 * set to false. Fires `pc-language-change` (with the locale) when the user picks a language.
 *
 * @example
 * html`<pc-input-settings .settings=${canvas.input}></pc-input-settings>`
 */
export class PcInputSettings extends PcElement {
  static override properties = {
    ...PcElement.properties,
    settings: { attribute: false },
    focusPen: { type: Boolean },
    languages: { type: Boolean },
    touch: { type: Boolean },
    modifier: { type: String },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-2);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      fieldset {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--pc-space-1) var(--pc-space-2);
        align-items: center;
        margin: 0;
        padding: var(--pc-space-2);
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius);
      }
      legend {
        padding: 0 var(--pc-space-1);
        font-weight: bold;
      }
      .toggle {
        display: flex;
        grid-column: 1 / -1;
        gap: var(--pc-space-2);
        align-items: center;
      }
      input[type="checkbox"] {
        accent-color: var(--pc-accent);
      }
      input:focus-visible,
      select:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 2px;
      }
    `,
  ];

  /** The settings shown and changed */
  declare settings?: InputSettingsLike;

  /** Whether to show focus pen mode (default true) */
  declare focusPen: boolean;

  /** Whether to show the language (default true) */
  declare languages: boolean;

  /** Whether the device is a phone or tablet: shows touch gestures, hides Cmd/Ctrl + scroll (detected by default) */
  declare touch: boolean;

  /** Name of the zoom modifier key ("Cmd" or "Ctrl", detected by default) */
  declare modifier: string;

  private changes = new ChangeController(this, () => [this.settings]);

  constructor() {
    super();
    this.focusPen = true;
    this.languages = true;
    this.touch = isTouchDevice();
    this.modifier = zoomModifierName();
  }

  /** A checkbox for an on/off setting */
  private toggle(
    data: Readonly<InputSettingsData>,
    key: ToggleSetting,
    label: string,
  ) {
    return html`<label class="toggle">
      <input
        type="checkbox"
        name=${key}
        .checked=${data[key]}
        @change=${(e: Event) =>
          this.settings?.update({
            [key]: (e.target as HTMLInputElement).checked,
          })}
      />
      ${label}
    </label>`;
  }

  /**
   * The touch gestures: which gesture undoes, redoes, copies and pastes. Choosing a gesture another action uses swaps
   * them.
   */
  private renderGestures(data: Readonly<InputSettingsData>) {
    return html`<fieldset part="gestures">
      <legend>${this.t("inputSettings.gestures")}</legend>
      ${GESTURE_ACTIONS.map(
        (action) =>
          html`<label for="gesture-${action}"
              >${this.t(ACTION_KEYS[action])}</label
            >
            <select
              id="gesture-${action}"
              name="gesture-${action}"
              @change=${(e: Event) =>
                this.settings?.update({
                  gestures: assignGesture(
                    data.gestures,
                    action,
                    (e.target as HTMLSelectElement).value as
                      TouchGesture | "off",
                  ),
                })}
            >
              ${[...TOUCH_GESTURES, "off" as const].map(
                (gesture) =>
                  html`<option
                    value=${gesture}
                    ?selected=${data.gestures[action] === gesture}
                  >
                    ${this.t(gesture === "off" ? "common.off" : `gesture.${gesture}`)}
                  </option>`,
              )}
            </select>`,
      )}
    </fieldset>`;
  }

  /** The language picker */
  private renderLanguage() {
    const translations = this.translations;
    return html`<fieldset part="language">
      <label for="language">${this.t("inputSettings.language")}</label>
      <select
        id="language"
        name="language"
        @change=${(e: Event) => {
          const locale = (e.target as HTMLSelectElement).value;
          void translations
            .setLocale(locale)
            .then(() => emit(this, "pc-language-change", { locale }));
        }}
      >
        ${translations.locales.map(
          (locale) =>
            html`<option
              value=${locale}
              ?selected=${translations.locale === locale}
            >
              ${this.t(`language.${locale}`)}
            </option>`,
        )}
      </select>
    </fieldset>`;
  }

  override render() {
    const data = this.settings?.data;
    if (!data) return nothing;
    return html`<fieldset part="controls">
        <legend>${this.t("inputSettings.title")}</legend>
        ${this.toggle(
          data,
          "scrollPan",
          this.t(
            this.touch ? "inputSettings.touchPan" : "inputSettings.scrollPan",
          ),
        )}
        ${this.toggle(data, "pinchZoom", this.t("inputSettings.pinchZoom"))}
        ${
          this.touch
            ? nothing
            : this.toggle(
                data,
                "modifierScrollZoom",
                this.t("inputSettings.modifierScrollZoom", {
                  key: this.modifier,
                }),
              )
        }
        ${
          this.focusPen
            ? this.toggle(data, "focusPen", this.t("inputSettings.focusPen"))
            : nothing
        }
      </fieldset>
      ${this.touch ? this.renderGestures(data) : nothing}
      ${this.languages ? this.renderLanguage() : nothing}`;
  }
}

defineElement("pc-input-settings", PcInputSettings);
