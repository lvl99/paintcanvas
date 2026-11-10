import { css, html } from "lit";
import { PcElement, defineElement } from "../../base";
import { PAINTCANVAS_REPOSITORY_URL, versionText } from "../../../lib/version";

/**
 * PaintCanvas's version and the commit it was built from, e.g. "PaintCanvas v0.6.0 (ac12a0d)", as a link to its GitHub
 * repository (opened in a new tab). For an app's settings or about panel.
 *
 * @example
 * html`<pc-version></pc-version>`
 */
export class PcVersion extends PcElement {
  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: block;
        font-family: var(--pc-font);
        font-size: var(--pc-font-size-small);
      }
      a {
        color: var(--pc-text-muted);
        text-decoration: none;
      }
      a:hover {
        color: var(--pc-text);
        text-decoration: underline;
      }
      a:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 2px;
      }
    `,
  ];

  override render() {
    return html`<a
      part="link"
      href=${PAINTCANVAS_REPOSITORY_URL}
      target="_blank"
      rel="noopener noreferrer"
      >${versionText()}</a
    >`;
  }
}

defineElement("pc-version", PcVersion);
