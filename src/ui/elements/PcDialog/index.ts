import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import "../PcButton";
import type { ButtonVariant, PcButton } from "../PcButton";

/** A button in a dialog */
export interface DialogChoice {
  /** What `pc-choose` gives when it's chosen */
  value: string;
  label: string;
  /** Shown as cancelling (pink), e.g. for a choice that removes something */
  cancelling?: boolean;
  /** The button's style instead (e.g. `dismiss`: pink text without a background) */
  variant?: ButtonVariant;
}

/** What `pc-choose` gives when the dialog is dismissed with Escape */
export const CANCEL_CHOICE = "cancel";

/**
 * A modal window asking the user to choose, over a dimmed backdrop, with a heading, a message, any content of its own,
 * and its choices, each on its own row (the cancel choice and those marked `cancelling` in pink, the others purple,
 * unless a choice gives its own `variant`).
 * Focus moves to the first choice when it opens. Fires `pc-choose` with the chosen value (`cancel` for Escape, pressed
 * anywhere while it's open).
 *
 * @example
 * html`<pc-dialog heading="Delete layer" message='Delete "Sketch"?'
 *   .choices=${[{ value: "delete", label: "Delete", cancelling: true }, { value: "cancel", label: "Cancel" }]}
 *   @pc-choose=${(e) => choose(e.detail.value)}></pc-dialog>`
 */
export class PcDialog extends PcElement {
  static override properties = {
    ...PcElement.properties,
    heading: { type: String },
    message: { type: String },
    choices: { attribute: false },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        position: fixed;
        z-index: 20;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--pc-space-3);
        background: var(--pc-backdrop);
      }
      [role="dialog"] {
        display: flex;
        width: 100%;
        max-width: 400px;
        flex-direction: column;
        gap: var(--pc-space-2);
        padding: var(--pc-space-3);
        border-radius: var(--pc-radius);
        background: var(--pc-surface-raised);
        color: var(--pc-text);
        box-shadow: var(--pc-shadow);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      h2 {
        margin: 0;
        font-size: 1.2em;
      }
      p {
        margin: 0;
      }
      .choices {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-2);
      }
    `,
  ];

  declare heading: string;

  declare message: string;

  declare choices: readonly DialogChoice[];

  constructor() {
    super();
    this.heading = "";
    this.message = "";
    this.choices = [];
  }

  override firstUpdated(changed: PropertyValues<this>): void {
    super.firstUpdated(changed);
    // The button renders its own content after this, so focus it once it has
    const first = this.renderRoot.querySelector<PcButton>("pc-button");
    if (first) void first.updateComplete.then(() => first.focus());
  }

  /** Choose one of the choices (or `cancel`) */
  choose(value: string): void {
    emit(this, "pc-choose", { value });
  }

  // Escape cancels, wherever focus is: the dialog is modal
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.choose(CANCEL_CHOICE);
  };

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKeyDown);
  }

  override render() {
    return html`<div
      part="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="heading"
      aria-describedby=${this.message ? "message" : nothing}
    >
      <h2 id="heading" part="heading">${this.heading}</h2>
      ${this.message ? html`<p id="message" part="message">${this.message}</p>` : nothing}
      <slot></slot>
      <div class="choices" part="choices">
        ${this.choices.map(
          (choice) =>
            html`<pc-button
              variant=${choice.variant ?? (choice.value === CANCEL_CHOICE || choice.cancelling ? "cancel" : "accent")}
              data-value=${choice.value}
              @click=${() => this.choose(choice.value)}
              >${choice.label}</pc-button
            >`,
        )}
      </div>
    </div>`;
  }
}

defineElement("pc-dialog", PcDialog);
