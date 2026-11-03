import { css, html, nothing, type PropertyValues } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import { zoomPercent } from "../PcToolSettings";

/** Units for sizes in bytes, each 1000 times the one before */
const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/**
 * A size in bytes in the largest unit it has at least one of, to one decimal place (whole bytes), for a locale.
 *
 * @example
 * formatBytes(84_560, "en-GB"); // "84.6 kB"
 * formatBytes(512, "en-GB"); // "512 byte"
 */
export const formatBytes = (bytes: number, locale?: string): string => {
  const step = Math.min(
    Math.max(Math.floor(Math.log10(bytes) / 3), 0),
    BYTE_UNITS.length - 1,
  );
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: BYTE_UNITS[step],
    unitDisplay: "short",
    maximumFractionDigits: step === 0 ? 0 : 1,
  }).format(bytes / 1000 ** step);
};

/**
 * A line of small text about the canvas: its size, the zoom level, the colour under the pointer (with a swatch; a dash
 * when the pointer isn't over the canvas) and, while the drawing is kept in the browser, how much its layer images
 * take there. The colour follows the pointer at most once a frame. It's not announced to screen readers as it
 * changes, as it changes with every pointer move.
 *
 * @example
 * html`<pc-stats .app=${app}></pc-stats>`
 */
export class PcStats extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: block;
        padding: 2px var(--pc-space-2);
        border-top: 1px solid var(--pc-border);
        background: var(--pc-bar);
        color: var(--pc-text);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size-small);
      }
      ul {
        display: flex;
        flex-wrap: wrap;
        gap: 2px var(--pc-space-3);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      li {
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .swatch {
        width: 10px;
        height: 10px;
        border: 1px solid var(--pc-border);
      }
    `,
  ];

  /** The canvas described */
  declare app?: PaintCanvas;

  private changes = new ChangeController(this, () => [
    this.app,
    this.app?.viewport,
    this.app?.autosave,
  ]);

  /** The canvas whose pointer is followed */
  private followed?: PaintCanvas;

  /** The animation frame the next update waits for, if any */
  private frame?: number;

  // Show the colour under the pointer at most once a frame
  private readonly onPointer = () => {
    this.frame ??= requestAnimationFrame(() => {
      this.frame = undefined;
      this.requestUpdate();
    });
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.follow(this.app);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.follow(undefined);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (changed.has("app") && this.isConnected) this.follow(this.app);
  }

  /**
   * Follow a canvas's pointer (or none), instead of the one followed before.
   */
  private follow(app: PaintCanvas | undefined): void {
    this.followed?.removeEventListener("pointer", this.onPointer);
    this.followed = app;
    app?.addEventListener("pointer", this.onPointer);
  }

  override render() {
    const app = this.app;
    if (!app) return nothing;
    const colour = app.pointer && app.sampleColour(app.pointer);
    const autosave = app.autosave;
    return html`<ul part="stats" aria-label=${this.t("stats.label")}>
      <li class="size">
        ${this.t("stats.size", { width: app.width, height: app.height })}
      </li>
      <li class="zoom">
        ${this.t("stats.zoom", { zoom: zoomPercent(app.viewport.zoom) })}
      </li>
      <li class="colour">
        ${this.t("stats.colour", { colour: colour ?? "—" })}
        ${
          colour
            ? html`<span
                class="swatch"
                style=${styleMap({ background: colour })}
              ></span>`
            : nothing
        }
      </li>
      ${
        autosave
          ? html`<li class="stored">
              ${this.t("stats.stored", {
                size: formatBytes(
                  autosave.storedBytes,
                  this.translations.locale,
                ),
              })}
            </li>`
          : nothing
      }
    </ul>`;
  }
}

defineElement("pc-stats", PcStats);
