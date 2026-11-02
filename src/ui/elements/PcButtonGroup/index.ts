import { css, html } from "lit";
import { PcElement, defineElement } from "../../base";

/**
 * Groups buttons in a row (`horizontal`, the default) or a column (`vertical`), with a `label` that names the group for
 * screen readers.
 *
 * @example
 * html`<pc-button-group orientation="vertical" label="Tools">…</pc-button-group>`
 */
export class PcButtonGroup extends PcElement {
  static override properties = {
    ...PcElement.properties,
    orientation: { type: String, reflect: true },
    label: { type: String },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: inline-flex;
      }
      [role="group"] {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--pc-space-1);
        align-items: center;
      }
      :host([orientation="vertical"]) [role="group"] {
        flex-direction: column;
        flex-wrap: nowrap;
        align-items: stretch;
      }
    `,
  ];

  declare orientation: "horizontal" | "vertical";

  /** Names the group for screen readers */
  declare label: string;

  constructor() {
    super();
    this.orientation = "horizontal";
    this.label = "";
  }

  override render() {
    return html`<div
      part="group"
      role="group"
      aria-label=${this.label}
      aria-orientation=${this.orientation}
    >
      <slot></slot>
    </div>`;
  }
}

defineElement("pc-button-group", PcButtonGroup);
