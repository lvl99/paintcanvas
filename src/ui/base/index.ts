import { LitElement, type CSSResultGroup } from "lit";
import { installTokens, tokens } from "../tokens";
import { icons, type IconRegistry } from "../icons";
import Translations, { translations } from "../../lib/i18n";

/**
 * Register a custom element unless the name is already registered (e.g. by another copy of PaintCanvas, or after hot
 * module reload).
 *
 * @example
 * defineElement("pc-button", PcButton);
 */
export const defineElement = (
  name: string,
  constructor: CustomElementConstructor,
): void => {
  if (!customElements.get(name)) customElements.define(name, constructor);
};

/**
 * Dispatch a custom event that crosses shadow DOM boundaries, so the implementer can listen anywhere above.
 *
 * @example
 * emit(this, "pc-select", { value: "duplicate" });
 */
export const emit = <T>(
  target: EventTarget,
  type: string,
  detail?: T,
): boolean =>
  target.dispatchEvent(
    new CustomEvent<T>(type, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );

/**
 * The base of PaintCanvas's elements: the design tokens, the translations and icons they use (shared ones unless
 * given others), and re-rendering when either changes.
 *
 * @example
 * class PcThing extends PcElement {
 *   override render() {
 *     return html`<button>${this.t("paintCanvas.common.close")}</button>`;
 *   }
 * }
 */
export class PcElement extends LitElement {
  static override styles: CSSResultGroup = [tokens];

  static override properties = {
    translations: { attribute: false },
    icons: { attribute: false },
    theme: { type: String, reflect: true },
  };

  /** The text the element shows, in the chosen language */
  declare translations: Translations;

  /** The icons the element shows */
  declare icons: IconRegistry;

  /** "light" (default), "dark", or "auto" to follow the device (see the design tokens) */
  declare theme?: "light" | "dark" | "auto";

  /** The translations and icons being listened to */
  private watched: EventTarget[] = [];

  private readonly onSourceChange = () => this.requestUpdate();

  constructor() {
    super();
    this.translations = translations;
    this.icons = icons;
  }

  /**
   * An icon's URL from the element's icons, or "" if there's none by that name.
   */
  protected iconUrl(name: string): string {
    return this.icons.get(name) ?? "";
  }

  /**
   * Translate a key with the element's translations.
   */
  protected t(key: string, values?: Record<string, string | number>): string {
    return this.translations.t(key, values);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    installTokens(this.ownerDocument);
    this.watch();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unwatch();
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (
      this.isConnected &&
      (changed.has("translations") || changed.has("icons"))
    )
      this.watch();
  }

  /** Listen to the current translations and icons */
  private watch(): void {
    this.unwatch();
    this.watched = [this.translations, this.icons];
    for (const source of this.watched)
      source.addEventListener("change", this.onSourceChange);
  }

  /** Stop listening */
  private unwatch(): void {
    for (const source of this.watched)
      source.removeEventListener("change", this.onSourceChange);
    this.watched = [];
  }
}
