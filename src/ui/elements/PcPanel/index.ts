import { css, html, nothing } from "lit";
import { PcElement, defineElement } from "../../base";

/**
 * Wraps content docked at a side of the `<paint-canvas>` layout (e.g. the layers menu or a chat window). Its `icon`,
 * `label` and `badge` are what the layout shows for it when the side narrows to a rail of buttons; the badge is a dot
 * meaning something new (e.g. unread messages). It names its region for screen readers. It's at most 290px wide
 * (`--pc-panel-max-width`).
 *
 * @example
 * html`<pc-panel slot="right" icon="layers" label="Layers"><my-layers></my-layers></pc-panel>`
 */
export class PcPanel extends PcElement {
  static override properties = {
    ...PcElement.properties,
    icon: { type: String },
    label: { type: String },
    badge: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: flex;
        min-width: 0;
        max-width: var(--pc-panel-max-width, 290px);
        min-height: 0;
        flex-direction: column;
      }
      section {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      }
    `,
  ];

  /** Name of the icon for its rail button */
  declare icon: string;

  /** Names the panel (its rail button and region) */
  declare label: string;

  /** Whether there's something new in it */
  declare badge: boolean;

  constructor() {
    super();
    this.icon = "";
    this.label = "";
    this.badge = false;
  }

  override render() {
    return html`<section part="panel" aria-label=${this.label || nothing}>
      <slot></slot>
    </section>`;
  }
}

defineElement("pc-panel", PcPanel);
