import { css, html, nothing, type TemplateResult } from "lit";
import { PcElement, defineElement } from "../../base";

/**
 * A panel: a box of settings or content for one purpose, docked in a `<pc-pane>` or floating over the canvas. It has
 * `header`, `body` and `footer` slots; content without a slot goes in the body. It names its region with its `label`
 * for screen readers.
 *
 * Its `icon`, `label` and `badge` are what a pane shows for it when the pane narrows to a rail of buttons; the badge is
 * a dot meaning something new (e.g. unread messages). It's 290px wide (`--pc-panel-width`) and no wider than the space
 * it has.
 *
 * Panels made for one purpose extend `PcPanel`, so they share its look: e.g. `<pc-panel-layers>`,
 * `<pc-panel-brushes>` and `<pc-panel-colours>`. They put their own content in the body (see `renderBody`), and give
 * their own `defaultLabel` and `defaultIcon`.
 *
 * @example
 * html`<pc-panel icon="chat" label="Chat"><my-chat></my-chat></pc-panel>`
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
        box-sizing: border-box;
        width: var(--pc-panel-width, var(--pc-panel-default-width, 290px));
        min-width: 0;
        max-width: 100%;
        min-height: 0;
        max-height: 100%;
        flex-direction: column;
        /* Light grey, like the bars */
        background: var(--pc-bar);
        color: var(--pc-text);
        box-shadow: var(--pc-shadow);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      section {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      }
      .body {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
        gap: var(--pc-space-2);
        padding: var(--pc-space-2);
        overflow: auto;
      }
    `,
  ];

  /** Name of the icon for its rail button (`defaultIcon` if not given) */
  declare icon: string;

  /** Names the panel: its region and rail button (`defaultLabel` if not given) */
  declare label: string;

  /** Whether there's something new in it */
  declare badge: boolean;

  constructor() {
    super();
    this.icon = "";
    this.label = "";
    this.badge = false;
  }

  /** The icon a panel made for a purpose shows on its rail button when none is given */
  protected get defaultIcon(): string {
    return "";
  }

  /** The name a panel made for a purpose has when none is given, in the chosen language */
  protected get defaultLabel(): string {
    return "";
  }

  /** The icon shown on its rail button */
  get panelIcon(): string {
    return this.icon || this.defaultIcon;
  }

  /** The panel's name, for its region and rail button */
  get panelLabel(): string {
    return this.label || this.defaultLabel;
  }

  /** The panel's own body content, before what's slotted into its body (none for a plain `<pc-panel>`) */
  protected renderBody(): TemplateResult | typeof nothing {
    return nothing;
  }

  override render() {
    return html`<section part="panel" aria-label=${this.panelLabel || nothing}>
      <slot name="header"></slot>
      <div class="body" part="body">
        ${this.renderBody()}<slot name="body"><slot></slot></slot>
      </div>
      <slot name="footer"></slot>
    </section>`;
  }
}

defineElement("pc-panel", PcPanel);
