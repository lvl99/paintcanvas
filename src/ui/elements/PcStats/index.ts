import { css, html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { PcElement, defineElement } from "../../base";
import ChangeController from "../../ChangeController";
import { NO_TEXT_SELECTION_CSS as noTextSelection } from "../../styles";
import type PaintCanvas from "../../../lib/classes/PaintCanvas";
import { zoomPercent } from "../PcToolSettings";

/**
 * The least time between reads of the colour under the pointer, in milliseconds. Each read draws every layer's pixels
 * there, which is slow on phones.
 */
export const COLOUR_INTERVAL_MS = 100;

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
 * A line of small text about the canvas: its size; while the drawing is kept in the browser, how much its layer
 * images take there; the zoom level; the colour under the pointer (with a swatch; a dash when the pointer isn't over the
 * canvas); and, on the right, while the drawing is being saved to a remote store (see
 * `PaintCanvas.useRemoteDocumentStore`), a progress bar, or that saving there failed. The colour follows the pointer
 * at most every `COLOUR_INTERVAL_MS`, and isn't read while a stroke is drawn (the next pointer move after it reads it).
 * It's not announced to screen readers as it changes, as it changes with every pointer move; saving to the remote store
 * is. Its text can't be selected.
 *
 * @example
 * html`<pc-stats .app=${app}></pc-stats>`
 */
export class PcStats extends PcElement {
  static override properties = {
    ...PcElement.properties,
    app: { attribute: false },
    colour: { state: true },
  };

  static override styles = [
    PcElement.styles,
    // Its text isn't selected by pressing or dragging on it (e.g. while drawing)
    unsafeCSS(noTextSelection),
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
      /* Saving to the remote store: at the end of the line, on the right */
      .remote {
        margin-left: auto;
      }
      .remote progress {
        width: 48px;
        height: 6px;
        accent-color: var(--pc-accent, currentColor);
      }
      .remote.failed {
        color: var(--pc-dismiss-text);
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
    this.app?.remoteAutosave,
  ]);

  /** The colour under the pointer when it was last read, if it's over the canvas */
  declare colour?: string;

  /** The canvas whose pointer is followed */
  private followed?: PaintCanvas;

  /** The timer the next read of the colour waits for, if any */
  private timer?: ReturnType<typeof setTimeout>;

  // Read the colour under the pointer at most every `COLOUR_INTERVAL_MS`
  private readonly onPointer = () => {
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.readColour();
    }, COLOUR_INTERVAL_MS);
  };

  /**
   * Read the colour under the followed canvas's pointer, unless a stroke is being drawn (reading would slow it down).
   */
  private readColour(): void {
    const app = this.followed;
    if (!app || app.strokes.drawing) return;
    this.colour = app.pointer && app.sampleColour(app.pointer);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.follow(this.app);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.follow(undefined);
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
    clearTimeout(this.timer);
    this.timer = undefined;
    this.colour = undefined;
    this.followed = app;
    app?.addEventListener("pointer", this.onPointer);
  }

  override render() {
    const app = this.app;
    if (!app) return nothing;
    const colour = this.colour;
    const autosave = app.autosave;
    return html`<ul
      part="stats"
      aria-label=${this.t("paintCanvas.stats.label")}
    >
      <li class="size">
        ${this.t("paintCanvas.stats.size", { width: app.width, height: app.height })}
      </li>
      ${
        autosave
          ? html`<li class="stored">
              ${this.t("paintCanvas.stats.stored", {
                size: formatBytes(
                  autosave.storedBytes,
                  this.translations.locale,
                ),
              })}
            </li>`
          : nothing
      }
      <li class="zoom">
        ${this.t("paintCanvas.stats.zoom", { zoom: zoomPercent(app.viewport.zoom) })}
      </li>
      <li class="colour">
        ${this.t("paintCanvas.stats.colour", { colour: colour ?? "—" })}
        ${
          colour
            ? html`<span
                class="swatch"
                style=${styleMap({ background: colour })}
              ></span>`
            : nothing
        }
      </li>
      ${this.renderRemote(app)}
    </ul>`;
  }

  /** Saving to the remote store, while under way or after it failed */
  private renderRemote(app: PaintCanvas) {
    const remote = app.remoteAutosave;
    if (!remote || (!remote.saving && remote.error === undefined))
      return nothing;
    const store = remote.store.label ?? this.t("paintCanvas.stats.remoteStore");
    if (!remote.saving)
      return html`<li class="remote failed" role="status">
        ${this.t("paintCanvas.stats.remoteFailed", { store })}
      </li>`;
    const label = this.t("paintCanvas.stats.remoteSaving", { store });
    return html`<li class="remote" role="status">
      ${label}
      <progress
        aria-label=${label}
        max="1"
        value=${remote.progress ?? nothing}
      ></progress>
    </li>`;
  }
}

defineElement("pc-stats", PcStats);
