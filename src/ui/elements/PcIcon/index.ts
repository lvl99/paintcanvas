import { css, html, nothing } from "lit";
import { PcElement, defineElement } from "../../base";

/**
 * An icon from the icon registry (see `icons`), by name. With a `label`, screen readers read it; without one, it's
 * decorative and hidden from them. Sized by `--pc-icon-size`.
 *
 * @example
 * html`<pc-icon name="brush" label="Brush"></pc-icon>`
 */
export class PcIcon extends PcElement {
  static override properties = {
    ...PcElement.properties,
    name: { type: String },
    label: { type: String },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: inline-flex;
        width: var(--pc-icon-size);
        height: var(--pc-icon-size);
        flex: none;
      }
      img {
        display: block;
        width: 100%;
        height: 100%;
        filter: var(--pc-icon-filter);
      }
    `,
  ];

  /** The icon's name in the registry */
  declare name: string;

  /** What the icon means, for screen readers (empty for a decorative icon) */
  declare label: string;

  constructor() {
    super();
    this.name = "";
    this.label = "";
  }

  override render() {
    const url = this.icons.get(this.name);
    if (!url) return nothing;
    return this.label
      ? html`<img part="image" src=${url} alt=${this.label} />`
      : html`<img part="image" src=${url} alt="" aria-hidden="true" />`;
  }
}

defineElement("pc-icon", PcIcon);
