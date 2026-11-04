import { css, html } from "lit";
import { live } from "lit/directives/live.js";
import { PcElement, defineElement, emit } from "../../base";
import ChangeController from "../../ChangeController";
import type {
  ColourSlot,
  default as PaintCanvas,
} from "../../../lib/classes/PaintCanvas";

/** Event fired when the foreground or background colour is pressed (detail: `{ slot }`) */
export const COLOUR_CLICK_EVENT = "pc-colour-click";

/** The two colours, foreground first */
const SLOTS: readonly ColourSlot[] = ["foreground", "background"];

/**
 * The foreground and background colours as two overlapping circles in a square (the foreground at the top left), the
 * one selected for configuration outlined and on top. Pressing either fires `pc-colour-click` with its `slot`; the
 * implementer decides what it does (e.g. select it and open a colour palette). `openPicker()` opens the browser's colour
 * picker for the selected colour, which sets it. Sized by `--pc-colour-pair-size` (50px by default).
 *
 * @example
 * html`<pc-colour-pair .app=${app} @pc-colour-click=${(e) => app.selectColour(e.detail.slot)}></pc-colour-pair>`
 */
export class PcColourPair extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        --size: var(--pc-colour-pair-size, 50px);
        position: relative;
        display: block;
        flex: none;
        width: var(--size);
        height: var(--size);
        background: var(--pc-text-muted);
      }
      button {
        position: absolute;
        width: 56%;
        height: 56%;
        padding: 0;
        border: 1px solid var(--pc-text);
        border-radius: 50%;
        background: var(--colour);
        cursor: pointer;
      }
      .foreground {
        top: 10%;
        left: 10%;
        z-index: 1;
      }
      .background {
        right: 10%;
        bottom: 10%;
      }
      /* The selected colour: on top, with a white ring outlined in black */
      button[aria-pressed="true"] {
        z-index: 2;
        box-shadow:
          0 0 0 2px #ffffff,
          0 0 0 3px #000000;
      }
      button:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 4px;
      }
      /* Kept in place (invisible) so the browser's colour picker opens beside the colours */
      input {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 1px;
        height: 1px;
        padding: 0;
        border: 0;
        opacity: 0;
        pointer-events: none;
      }
    `,
  ];

  declare app?: PaintCanvas;

  private changes = new ChangeController(this, () => [this.app]);

  /**
   * Open the browser's colour picker for the selected colour (call it while handling a press, as browsers only open
   * pickers for one).
   */
  openPicker(): void {
    const input = this.renderRoot.querySelector("input");
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // Browsers without showPicker, or that refuse it, open the picker on a click
      input.click();
    }
  }

  /** Tell listeners a colour was pressed */
  private onClick(slot: ColourSlot): void {
    emit(this, COLOUR_CLICK_EVENT, { slot });
  }

  /** Set the selected colour from the browser's colour picker */
  private onPick(event: Event): void {
    const app = this.app;
    app?.setColour(
      (event.target as HTMLInputElement).value,
      app.selectedColour,
    );
  }

  override render() {
    const app = this.app;
    if (!app) return html``;
    return html`${SLOTS.map((slot) => {
        const colour = app.colours[slot];
        return html`<button
          type="button"
          part=${slot}
          class=${slot}
          style="--colour: ${colour}"
          title=${this.t(`paintCanvas.colours.${slot}`, { colour })}
          aria-label=${this.t(`paintCanvas.colours.${slot}`, { colour })}
          aria-pressed=${app.selectedColour === slot}
          @click=${() => this.onClick(slot)}
        ></button>`;
      })}<input
        type="color"
        tabindex="-1"
        aria-hidden="true"
        .value=${live(app.colours[app.selectedColour])}
        @input=${this.onPick}
      />`;
  }
}

defineElement("pc-colour-pair", PcColourPair);
