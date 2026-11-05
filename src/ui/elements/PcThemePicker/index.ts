import { css, html, unsafeCSS } from "lit";
import { ICON_CONTROLS_CSS as iconControls } from "../../styles";
import { PcElement, defineElement, emit } from "../../base";
import type { IconName } from "../../icons";
import "../PcButtonGroup";

/** The themes to pick from: light, dark, or following the device's (system) */
export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

/** Each theme's icon */
export const THEME_ICONS: Readonly<Record<Theme, IconName>> = {
  light: "sun",
  dark: "moon",
  system: "star",
};

/**
 * Whether a value is one of the themes.
 *
 * @example
 * isTheme("dark"); // true
 * isTheme(undefined); // false
 */
export const isTheme = (value: unknown): value is Theme =>
  THEMES.includes(value as Theme);

/**
 * Picks the light, dark or system theme (which follows the device's), as a labelled group of three radios joined into
 * one pill (a joined `<pc-button-group>`), each with its icon (sun, moon and star) and name; the picked one is purple.
 * Shows the theme of its `target` (the page's root element by default; system unless it has another), and sets the
 * target's `data-pc-theme` when the user picks one, firing `change` (detail: the theme).
 *
 * @example
 * html`<pc-theme-picker @change=${(e) => save(e.detail)}></pc-theme-picker>`
 */
export class PcThemePicker extends PcElement {
  static override properties = {
    ...PcElement.properties,
    theme: { type: String, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    unsafeCSS(iconControls),
    css`
      :host {
        display: block;
      }
      fieldset {
        margin: 0;
        padding: 0;
        border: 0;
        min-width: 0;
        color: var(--pc-text);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      legend {
        margin-bottom: var(--pc-space-1);
        padding: 0;
      }
      /* As wide as the picker, with the options sharing the width */
      pc-button-group {
        display: flex;
      }
      pc-button-group::part(group) {
        flex: 1;
      }
      /* One pill: the button group gives each option its corners */
      .icon-toggle {
        flex: 1;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 2px var(--pc-space-2);
        border-radius: var(--pc-group-radius, var(--pc-radius-small));
      }
      /* The picked option's border shows over its neighbours' */
      .icon-toggle:has(input:checked) {
        z-index: 1;
        color: var(--pc-accent-text);
      }
      .icon-toggle:has(input:focus-visible) {
        z-index: 2;
      }
    `,
  ];

  /** The theme shown as picked */
  declare theme: Theme;

  /** The element whose `data-pc-theme` is shown and set (the page's root element by default) */
  target?: HTMLElement;

  constructor() {
    super();
    this.theme = "system";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const current = this.themeTarget.dataset.pcTheme;
    if (isTheme(current)) this.theme = current;
  }

  /** The element whose theme is shown and set */
  private get themeTarget(): HTMLElement {
    return this.target ?? document.documentElement;
  }

  /**
   * Pick a theme: show it, set it on the target and tell listeners.
   *
   * @example
   * picker.pick("system");
   */
  pick(theme: Theme): void {
    this.theme = theme;
    this.themeTarget.dataset.pcTheme = theme;
    emit(this, "change", theme);
  }

  override render() {
    return html`<fieldset>
      <legend>${this.t("paintCanvas.theme.label")}</legend>
      <pc-button-group joined>
        ${THEMES.map(
          (theme) =>
            html`<label class="icon-toggle" data-theme=${theme}>
              <input
                type="radio"
                name="theme"
                value=${theme}
                .checked=${this.theme === theme}
                @change=${() => this.pick(theme)}
              />
              <img src=${this.iconUrl(THEME_ICONS[theme])} alt="" />
              <span>${this.t(`paintCanvas.theme.${theme}`)}</span>
            </label>`,
        )}
      </pc-button-group>
    </fieldset>`;
  }
}

defineElement("pc-theme-picker", PcThemePicker);
