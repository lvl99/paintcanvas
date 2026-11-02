import { css, html, nothing, type PropertyValues } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import "../PcButton";

/** What a toast tells: a notice, an error or a success (each has its own colour) */
export type ToastKind = "info" | "error" | "success";

/** How long a toast shows before dismissing itself, unless told otherwise (milliseconds) */
export const TOAST_DURATION_MS = 5000;

/**
 * A short message, e.g. "Saved", coloured by its kind: a notice (`info`), an `error` (red) or a `success` (green). An
 * error is announced at once; others politely. It dismisses itself after `duration` milliseconds (0 keeps it), or with
 * its dismiss button. With an `action`, it shows that button too. Fires `pc-action` and `pc-dismiss`. The buttons move
 * under the message when there isn't room beside it. The implementer places it (e.g. near the bottom of the screen).
 *
 * @example
 * html`<pc-toast message="Preset deleted" action="Undo" @pc-action=${restore} @pc-dismiss=${hide}></pc-toast>`
 */
export class PcToast extends PcElement {
  static override properties = {
    ...PcElement.properties,
    message: { type: String },
    kind: { type: String, reflect: true },
    action: { type: String },
    duration: { type: Number },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: block;
      }
      .toast {
        display: flex;
        flex-wrap: wrap;
        gap: var(--pc-space-2);
        align-items: center;
        padding: var(--pc-space-2) var(--pc-space-3);
        border-radius: var(--pc-radius);
        background: var(--pc-text);
        color: var(--pc-surface);
        box-shadow: var(--pc-shadow);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      :host([kind="error"]) .toast {
        background: var(--pc-red);
        color: #ffffff;
      }
      :host([kind="success"]) .toast {
        background: var(--pc-green);
        color: #ffffff;
      }
      p {
        /* Wide enough to read; the buttons wrap under it when there isn't room */
        flex: 1 1 16em;
        margin: 0;
      }
      .buttons {
        display: flex;
        gap: var(--pc-space-1);
      }
      /* The dismiss button's text is the toast's colour */
      .buttons pc-button[variant="dismiss"] {
        color: inherit;
      }
      pc-button[variant="dismiss"]::part(button) {
        color: inherit;
      }
    `,
  ];

  declare message: string;

  /** "info" (default), "error" or "success" */
  declare kind: ToastKind;

  /** Label of an extra button (e.g. "Undo"), if any */
  declare action?: string;

  /** Milliseconds before it dismisses itself (0 keeps it until dismissed) */
  declare duration: number;

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    super();
    this.message = "";
    this.kind = "info";
    this.duration = TOAST_DURATION_MS;
  }

  override updated(changed: PropertyValues<this>): void {
    if (!changed.has("message") && !changed.has("duration")) return;
    clearTimeout(this.timer);
    if (this.duration > 0)
      this.timer = setTimeout(() => this.dismiss(), this.duration);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.timer);
  }

  /** Tell listeners it should go */
  dismiss(): void {
    clearTimeout(this.timer);
    emit(this, "pc-dismiss");
  }

  override render() {
    return html`<div
      class="toast"
      part="toast"
      role=${this.kind === "error" ? "alert" : "status"}
    >
      <p part="message">${this.message}</p>
      <div class="buttons">
        ${
          this.action
            ? html`<pc-button
                variant="pill"
                @click=${() => emit(this, "pc-action")}
                >${this.action}</pc-button
              >`
            : nothing
        }
        <pc-button variant="dismiss" @click=${() => this.dismiss()}
          >${this.t("common.dismiss")}</pc-button
        >
      </div>
    </div>`;
  }
}

defineElement("pc-toast", PcToast);
