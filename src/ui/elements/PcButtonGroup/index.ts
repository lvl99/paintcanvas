import { css, html } from "lit";
import { PcElement, defineElement } from "../../base";

/**
 * Groups buttons in a row (`horizontal`, the default) or a column (`vertical`), with a `label` that names the group for
 * screen readers. When `joined`, the buttons touch and make one pill: the first has the rounded start, the last the
 * rounded end, and those between are square. It tells its children their corners with `--pc-group-radius`, which
 * `<pc-button>` follows (other content can too).
 *
 * @example
 * html`<pc-button-group orientation="vertical" label="Tools">…</pc-button-group>`
 * html`<pc-button-group joined label="View"><pc-button>Day</pc-button><pc-button>Week</pc-button></pc-button-group>`
 */
export class PcButtonGroup extends PcElement {
  static override properties = {
    ...PcElement.properties,
    orientation: { type: String, reflect: true },
    label: { type: String },
    joined: { type: Boolean, reflect: true },
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
      /* Joined: one pill, with the buttons' borders overlapping */
      :host([joined]) [role="group"] {
        flex-wrap: nowrap;
        gap: 0;
        align-items: stretch;
      }
      :host([joined]) ::slotted(*) {
        --pc-group-radius: 0;
      }
      :host([joined]) ::slotted(:not(:first-child)) {
        margin-left: -1px;
      }
      :host([joined]) ::slotted(:first-child) {
        --pc-group-radius: var(--pc-radius-pill) 0 0 var(--pc-radius-pill);
      }
      :host([joined]) ::slotted(:last-child) {
        --pc-group-radius: 0 var(--pc-radius-pill) var(--pc-radius-pill) 0;
      }
      :host([joined][orientation="vertical"]) ::slotted(:not(:first-child)) {
        margin-top: -1px;
        margin-left: 0;
      }
      :host([joined][orientation="vertical"]) ::slotted(:first-child) {
        --pc-group-radius: var(--pc-radius-pill) var(--pc-radius-pill) 0 0;
      }
      :host([joined][orientation="vertical"]) ::slotted(:last-child) {
        --pc-group-radius: 0 0 var(--pc-radius-pill) var(--pc-radius-pill);
      }
      :host([joined]) ::slotted(:only-child) {
        --pc-group-radius: var(--pc-radius-pill);
      }
    `,
  ];

  declare orientation: "horizontal" | "vertical";

  /** Names the group for screen readers */
  declare label: string;

  /** Whether the buttons touch, making one pill */
  declare joined: boolean;

  constructor() {
    super();
    this.orientation = "horizontal";
    this.label = "";
    this.joined = false;
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
