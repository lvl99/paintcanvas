import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import "../PcButton";
import "../PcDialogWindow";
import type { PcDialogWindow } from "../PcDialogWindow";
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

/** A text field in a dialog, e.g. for a name */
export interface DialogField {
  label: string;
  /** The text it starts with */
  value: string;
}

/** What `pc-choose` gives: the chosen value, and the field's text when the dialog has a field */
export interface DialogChoiceDetail {
  value: string;
  text?: string;
}

/** What `pc-choose` gives when the dialog is dismissed (Escape, or a press outside it) */
export const CANCEL_CHOICE = "cancel";

/**
 * A modal window asking the user to choose (a `<pc-dialog-window>` over a shaded page), with a heading, a message, an
 * optional text field (`field`, e.g. for a name), any content of its own, and its choices, each on its own row (the
 * cancel choice and those marked `cancelling` in pink, the others purple, unless a choice gives its own `variant`).
 *
 * Focus moves to the field, or else the first choice, when it opens. Fires `pc-choose` with the chosen value (and the
 * field's `text`): Enter in the field chooses the first choice that isn't cancelling; Escape and a press outside it
 * choose `cancel`, unless it's not `dismissible`. `inline` shows it over its nearest positioned ancestor only.
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
    field: { attribute: false },
    dismissible: { type: Boolean },
    inline: { type: Boolean, reflect: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: contents;
      }
      pc-dialog-window {
        --pc-dialog-width: 400px;
      }
      h2 {
        margin: 0;
        font-size: 1.2em;
      }
      p {
        margin: 0;
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-2);
      }
      label {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-1);
      }
      input {
        box-sizing: border-box;
        width: 100%;
        min-height: var(--pc-control-size);
        padding: 0 var(--pc-space-2);
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface);
        color: var(--pc-text);
        font: inherit;
      }
      input:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
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

  /** A text field to fill in, if any */
  declare field?: DialogField;

  /** Whether Escape and a press outside it choose `cancel` */
  declare dismissible: boolean;

  /** Whether it covers only its nearest positioned ancestor, leaving the rest of the page usable */
  declare inline: boolean;

  constructor() {
    super();
    this.heading = "";
    this.message = "";
    this.choices = [];
    this.dismissible = true;
    this.inline = false;
  }

  override firstUpdated(changed: PropertyValues<this>): void {
    super.firstUpdated(changed);
    void this.focusFirst();
  }

  /**
   * Move focus to the field (selecting its text), or else the first choice, once the window has opened (nothing in it
   * can take focus before) and the choice has rendered its button.
   */
  private async focusFirst(): Promise<void> {
    await (this.renderRoot.querySelector("pc-dialog-window") as PcDialogWindow)
      .updateComplete;
    const field = this.renderRoot.querySelector("input");
    if (field) {
      field.focus();
      field.select();
      return;
    }
    const first = this.renderRoot.querySelector<PcButton>("pc-button");
    if (!first) return;
    await first.updateComplete;
    first.focus();
  }

  /**
   * Choose one of the choices (or `cancel`), giving the field's text when there's a field.
   */
  choose(value: string): void {
    const text = this.renderRoot.querySelector("input")?.value;
    emit<DialogChoiceDetail>(
      this,
      "pc-choose",
      text === undefined ? { value } : { value, text },
    );
  }

  // Enter in the field chooses the first choice that isn't cancelling
  private readonly onFieldKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    const choice = this.choices.find(
      (item) => item.value !== CANCEL_CHOICE && !item.cancelling,
    );
    if (!choice) return;
    event.preventDefault();
    this.choose(choice.value);
  };

  // Escape and presses outside it cancel; the dialog stays until whoever showed it removes it
  private readonly onDismiss = (event: Event) => {
    event.preventDefault();
    this.choose(CANCEL_CHOICE);
  };

  override render() {
    const field = this.field;
    return html`<pc-dialog-window
      part="dialog"
      open
      shaded
      closable="false"
      .dismissible=${this.dismissible}
      ?inline=${this.inline}
      description=${this.message || nothing}
      @pc-dismiss=${this.onDismiss}
    >
      <h2 slot="header-middle" part="heading">${this.heading}</h2>
      <div slot="body" class="body">
        ${this.message ? html`<p part="message">${this.message}</p>` : nothing}
        ${
          field
            ? html`<label part="field">
                ${field.label}
                <input
                  type="text"
                  .value=${field.value}
                  @keydown=${this.onFieldKeyDown}
                />
              </label>`
            : nothing
        }
        <slot></slot>
      </div>
      <div slot="footer-middle" class="choices" part="choices">
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
    </pc-dialog-window>`;
  }
}

defineElement("pc-dialog", PcDialog);
