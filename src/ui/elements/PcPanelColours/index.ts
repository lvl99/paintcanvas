import { html, nothing, unsafeCSS, type PropertyValues } from "lit";
import { live } from "lit/directives/live.js";
import styles from "./style.css?inline";
import {
  ICON_CONTROLS_CSS as iconControls,
  NO_TEXT_SELECTION_CSS as noTextSelection,
  PILLS_CSS as pills,
} from "../../styles";
import { defineElement, emit } from "../../base";
import { PcPanel } from "../PcPanel";
import ChangeController from "../../ChangeController";
import "../PcColourPair";
import "../PcMenu";
import "../PcContextMenu";
import "../PcDialog";
import type { MenuItem } from "../PcMenu";
import { CANCEL_CHOICE, type DialogChoice } from "../PcDialog";
import type {
  ColourSlot,
  default as PaintCanvas,
} from "../../../lib/classes/PaintCanvas";
import {
  hexToHsl,
  hexToRgb,
  hslToHex,
  normaliseHex,
  rgbToHex,
  type Hsl,
  type Rgb,
} from "../../../lib/utils/colour";
import {
  MAX_PALETTE_COLOURS,
  colourPaletteFile,
  type ColourPalette,
} from "../../../lib/palette";
import { DEFAULT_PALETTE_ID } from "../../../lib/classes/ColourPalettes";
import { AssetFileError } from "../../../lib/assets";
import { askConfirm, askText, type ConfirmFn, type PromptFn } from "../../ask";
import {
  JSON_FILE_TYPE,
  saveFile,
  type SaveMethod,
} from "../../../lib/rendering/screenshot";

/** The colour models the sliders can show */
export type ColourModel = "rgb" | "hsl";

/** A slider for one channel of a colour model */
interface Channel {
  /** The channel's letter, e.g. `r` (also shown) */
  key: string;
  /** Translation key of its name */
  name: string;
  max: number;
}

/** Each colour model's channels */
const CHANNELS: Readonly<Record<ColourModel, readonly Channel[]>> = {
  rgb: [
    { key: "r", name: "paintCanvas.palette.red", max: 255 },
    { key: "g", name: "paintCanvas.palette.green", max: 255 },
    { key: "b", name: "paintCanvas.palette.blue", max: 255 },
  ],
  hsl: [
    { key: "h", name: "paintCanvas.palette.hue", max: 360 },
    { key: "s", name: "paintCanvas.palette.saturation", max: 100 },
    { key: "l", name: "paintCanvas.palette.lightness", max: 100 },
  ],
};

/** Hues the hue slider's track passes through, every 60 degrees from red back to red */
const HUE_STOPS = [0, 60, 120, 180, 240, 300, 360].map((h) =>
  hslToHex({ h, s: 100, l: 50 }),
);

/**
 * The CSS gradient a channel's slider track shows: the colours its values give, from the lowest to the highest, keeping
 * the colour's other values. Red, green and blue go from none to all of that channel (e.g. red from `rgb(0, g, b)` to
 * `rgb(255, g, b)`), saturation from grey to full colour, and lightness from black through the colour to white. Hue goes
 * through every hue at full saturation, so it never shows as grey.
 *
 * @example
 * channelGradient("r", { r: 0, g: 128, b: 255 }, { h: 210, s: 100, l: 50 }); // "linear-gradient(to right, #0080ff, #ff80ff)"
 * channelGradient("s", { r: 77, g: 179, b: 77 }, { h: 120, s: 40, l: 50 }); // "linear-gradient(to right, #808080, #00ff00)"
 */
export const channelGradient = (key: string, rgb: Rgb, hsl: Hsl): string => {
  const { h, s, l } = hsl;
  /** The colour with no and all of an RGB channel */
  const rgbStops = (channel: keyof Rgb) => [
    rgbToHex({ ...rgb, [channel]: 0 }),
    rgbToHex({ ...rgb, [channel]: 255 }),
  ];
  const stops: Record<string, string[]> = {
    r: rgbStops("r"),
    g: rgbStops("g"),
    b: rgbStops("b"),
    h: HUE_STOPS,
    s: [hslToHex({ h, s: 0, l }), hslToHex({ h, s: 100, l })],
    l: [0, 50, 100].map((lightness) => hslToHex({ h, s, l: lightness })),
  };
  return `linear-gradient(to right, ${(stops[key] as string[]).join(", ")})`;
};

/** The colour models in tab order */
const MODELS: readonly ColourModel[] = ["rgb", "hsl"];

/** How long a touch is held on a saved colour to open its menu (milliseconds) */
export const LONG_PRESS_MS = 500;

/** How far a touch can move and still count as held still (CSS pixels) */
const LONG_PRESS_SLOP = 10;

/** A palette shown in the panel: one of the user's own, or the one PaintCanvas comes with */
interface ShownPalette {
  id: string;
  name: string;
  colours: readonly string[];
  /** Whether it's one of the user's own (which can be renamed, exported and deleted) */
  own: boolean;
}

/** A saved colour: its palette's ID and its position */
interface SwatchRef {
  palette: string;
  index: number;
}

/** Whether a saved colour is in one of the user's palettes (PaintCanvas's can't be changed) */
const isEditable = ({ palette }: SwatchRef): boolean =>
  palette !== DEFAULT_PALETTE_ID;

/** Actions in a palette's menu */
const PALETTE_ACTIONS = ["rename", "export", "delete"] as const;

/** Translation keys of the messages shown when importing a palette file fails, by reason */
const IMPORT_ERROR_KEYS: Record<string, string> = {
  invalid: "paintCanvas.palette.fileIncompatible",
  unsupported: "paintCanvas.palette.fileUnsupported",
};

/**
 * The translation key of the message shown when importing a palette file fails.
 */
const importErrorKey = (error: unknown): string =>
  (error instanceof AssetFileError && IMPORT_ERROR_KEYS[error.reason]) ||
  "paintCanvas.palette.fileReadFailed";

/** The dialog's choice that deletes the colour */
const DELETE_CHOICE = "delete";

/**
 * Keep a number within a range, rounded to a whole number.
 */
const clampWhole = (value: number, max: number): number =>
  Math.round(Math.min(max, Math.max(0, value)));

/**
 * The colour palette menu: the foreground and background colours (the selected one is configured), its hex value, RGB
 * and HSL sliders, the colour palettes (the user's own above the one PaintCanvas comes with), and buttons to make a
 * palette and to import and export the user's palettes as a JSON file.
 *
 * - Pressing the foreground or background colour selects it.
 * - Pressing a saved colour sets the selected colour (changing it afterwards doesn't change the palette); a palette's [+]
 *   saves the selected colour in it. PaintCanvas's palette can't be changed.
 * - Each of the user's palettes has a ⋮ menu to rename, export or delete it (deleting asks first).
 * - A colour in one of the user's palettes is deleted, after asking, by clicking it with Alt/Option held (the cursor shows an "X"), from its
 *   menu (right-click, a long press on touch screens, or the context menu key), or with Delete or Backspace. Arrow keys,
 *   Home and End move between saved colours.
 * - Escape closes it (closes the canvas's open panel).
 *
 * Fires `pc-toast` after importing, or when importing or exporting fails.
 *
 * @example
 * html`<pc-panel-colours .app=${app}></pc-panel-colours>`
 */
export class PcPanelColours extends PcPanel {
  static override properties = {
    ...PcPanel.properties,
    app: { attribute: false },
    model: { type: String },
    hexDraft: { state: true },
    menu: { state: true },
    confirming: { state: true },
  };

  static override styles = [
    ...PcPanel.styles,
    unsafeCSS(noTextSelection),
    unsafeCSS(iconControls),
    unsafeCSS(pills),
    unsafeCSS(styles),
  ];

  declare app?: PaintCanvas;

  /** The colour model the sliders show */
  declare model: ColourModel;

  /** The hex value being typed, while it differs from the colour */
  declare hexDraft?: string;

  /** The saved colour whose menu is open, and where */
  declare menu?: SwatchRef & { x: number; y: number };

  /** The saved colour being deleted, while asking */
  declare confirming?: SwatchRef;

  /** Asks the user to confirm, in a dialog (replaceable for tests) */
  confirm: ConfirmFn = (options) => askConfirm(this.renderRoot, options);

  /** Asks the user for text, in a dialog (replaceable for tests) */
  prompt: PromptFn = (options) => askText(this.renderRoot, options);

  /** Saves exported files (replaceable for tests) */
  saveFile: (blob: Blob, name: string) => Promise<SaveMethod | undefined> = (
    blob,
    name,
  ) => saveFile(blob, name, undefined, JSON_FILE_TYPE);

  /** The HSL values shown, kept while they give the selected colour (so hue stays put for greys) */
  private hsl: Hsl = { h: 0, s: 0, l: 0 };

  /** The saved colour that is reached with Tab in its palette (the others with arrow keys; other palettes' first) */
  private focused: SwatchRef = { palette: DEFAULT_PALETTE_ID, index: 0 };

  /** A touch being held on a saved colour, until it opens its menu */
  private press?: {
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  };

  /** Whether a long press opened a menu, so the click that follows is ignored */
  private longPressed = false;

  private changes = new ChangeController(this, () => [
    this.app,
    this.app?.palette,
    this.app?.palettes,
  ]);

  // Holding Alt/Option shows the delete cursor over saved colours
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === "Alt")
      this.toggleAttribute("deleting", event.type === "keydown");
  };

  private readonly onBlur = () => this.removeAttribute("deleting");

  constructor() {
    super();
    this.model = "rgb";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.onBlur);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    this.cancelPress();
  }

  /** The selected colour's value, e.g. `#000000` */
  get colour(): string {
    const app = this.app as PaintCanvas;
    return app.colours[app.selectedColour];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (!this.app) return;
    // Show the selected colour's HSL, unless the HSL shown already gives it
    if (hslToHex(this.hsl) !== this.colour) this.hsl = hexToHsl(this.colour);
    const shown = this.shown().find(({ id }) => id === this.focused.palette);
    this.focused = shown
      ? {
          palette: shown.id,
          index: Math.max(
            0,
            Math.min(this.focused.index, shown.colours.length - 1),
          ),
        }
      : { palette: DEFAULT_PALETTE_ID, index: 0 };
  }

  /** The palettes shown: the user's own, then the one PaintCanvas comes with (named after the app) */
  shown(): ShownPalette[] {
    const app = this.app as PaintCanvas;
    return [
      ...app.palettes.items.map(({ id, name, content }) => ({
        id,
        name,
        colours: content.colours,
        own: true,
      })),
      {
        id: DEFAULT_PALETTE_ID,
        name: app.names.app,
        colours: app.palette.colours,
        own: false,
      },
    ];
  }

  /** A palette's colours */
  private coloursOf(palette: string): readonly string[] {
    const app = this.app as PaintCanvas;
    return palette === DEFAULT_PALETTE_ID
      ? app.palette.colours
      : (app.palettes.get(palette)?.content.colours ?? []);
  }

  /** The saved colour at a position */
  private colourAt({ palette, index }: SwatchRef): string | undefined {
    return this.coloursOf(palette)[index];
  }

  /** Set the selected colour */
  private setColour(colour: string): void {
    const app = this.app as PaintCanvas;
    app.setColour(colour, app.selectedColour);
  }

  /** Select the pressed colour */
  private onColourClick(event: CustomEvent<{ slot: ColourSlot }>): void {
    this.app?.selectColour(event.detail.slot);
  }

  /** Follow the hex value as it's typed, setting the colour once it's a full 6-digit value */
  private onHexInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const hex = normaliseHex(value);
    if (hex && value.replace(/[\s#]/g, "").length === 6) {
      this.hexDraft = undefined;
      this.setColour(hex);
      return;
    }
    this.hexDraft = value;
  }

  /** Set the colour from a typed hex value (including 3 digits) when done, or show the colour again if it isn't one */
  private onHexChange(event: Event): void {
    const hex = normaliseHex((event.target as HTMLInputElement).value);
    this.hexDraft = undefined;
    if (hex) this.setColour(hex);
  }

  /** Switch colour model with the arrow keys, Home and End, as tabs do */
  private onTabKeyDown(event: KeyboardEvent): void {
    const index = MODELS.indexOf(this.model);
    const last = MODELS.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.selectModel(MODELS[next] as ColourModel, true);
  }

  /** Show a colour model's sliders */
  private async selectModel(model: ColourModel, focus = false): Promise<void> {
    this.model = model;
    if (!focus) return;
    await this.updateComplete;
    this.renderRoot
      .querySelector<HTMLButtonElement>(`[role="tab"][data-model="${model}"]`)
      ?.focus();
  }

  /** Change one channel of the colour model shown */
  private onChannel(channel: Channel, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value === "") return;
    const value = clampWhole(input.valueAsNumber, channel.max);
    if (this.model === "rgb") {
      this.setColour(
        rgbToHex({ ...hexToRgb(this.colour), [channel.key]: value }),
      );
      return;
    }
    this.hsl = { ...this.hsl, [channel.key]: value };
    this.setColour(hslToHex(this.hsl));
    // The HSL shown changes even when the colour doesn't (e.g. hue for a grey)
    this.requestUpdate();
  }

  /** Set the selected colour from a saved colour, or ask to delete one of the user's with Alt/Option held */
  private onSwatchClick(event: MouseEvent, swatch: SwatchRef): void {
    this.focused = swatch;
    if (this.longPressed) {
      this.longPressed = false;
      return;
    }
    if (event.altKey && isEditable(swatch)) {
      this.confirming = swatch;
      return;
    }
    this.setColour(this.colourAt(swatch) as string);
  }

  /** Open the menu of a colour in one of the user's palettes where it was right-clicked */
  private onSwatchContextMenu(event: MouseEvent, swatch: SwatchRef): void {
    if (!isEditable(swatch)) return;
    event.preventDefault();
    this.focused = swatch;
    this.menu = { ...swatch, x: event.clientX, y: event.clientY };
  }

  /** Start waiting for a touch held on a saved colour to open its menu */
  private onSwatchPointerDown(event: PointerEvent, swatch: SwatchRef): void {
    this.longPressed = false;
    if (event.pointerType !== "touch" || !isEditable(swatch)) return;
    this.cancelPress();
    const { clientX: x, clientY: y } = event;
    this.press = {
      x,
      y,
      timer: setTimeout(() => {
        this.press = undefined;
        this.longPressed = true;
        this.focused = swatch;
        this.menu = { ...swatch, x, y };
      }, LONG_PRESS_MS),
    };
  }

  /** Stop waiting for a long press when the touch moves away */
  private onSwatchPointerMove(event: PointerEvent): void {
    const press = this.press;
    if (
      press &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >
        LONG_PRESS_SLOP
    )
      this.cancelPress();
  }

  /** Stop waiting for a long press */
  private cancelPress(): void {
    clearTimeout(this.press?.timer);
    this.press = undefined;
  }

  /**
   * Move between saved colours, ask to delete one, or open its menu, with the keyboard. Keys used here don't reach the
   * keyboard shortcuts (e.g. Delete doesn't also delete the masked image data).
   */
  private onSwatchKeyDown(event: KeyboardEvent, swatch: SwatchRef): void {
    const { palette, index } = swatch;
    const editable = isEditable(swatch);
    if (editable && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      event.stopPropagation();
      this.confirming = swatch;
      return;
    }
    if (
      editable &&
      (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
    ) {
      event.preventDefault();
      event.stopPropagation();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.menu = { ...swatch, x: rect.left, y: rect.bottom };
      return;
    }
    const last = this.coloursOf(palette).length - 1;
    const columns = this.columns(palette);
    const next = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + columns,
      ArrowUp: index - columns,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined || next < 0 || next > last) return;
    event.preventDefault();
    event.stopPropagation();
    void this.focusSwatch({ palette, index: next });
  }

  /** How many saved colours fit in a row of a palette */
  private columns(palette: string): number {
    // Only asked while one of the palette's colours has focus, so there is one
    const grid = this.renderRoot.querySelector(
      `.swatches[data-palette="${palette}"]`,
    ) as HTMLElement;
    const width = (grid.querySelector(".swatch") as HTMLElement).offsetWidth;
    return width > 0 ? Math.max(1, Math.floor(grid.clientWidth / width)) : 1;
  }

  /** Focus a saved colour */
  private async focusSwatch(swatch: SwatchRef): Promise<void> {
    this.focused = swatch;
    this.requestUpdate();
    await this.updateComplete;
    this.renderRoot
      .querySelector<HTMLButtonElement>(
        `.swatches[data-palette="${swatch.palette}"] .swatch[data-index="${swatch.index}"]`,
      )
      ?.focus();
  }

  /** Save the selected colour in one of the user's palettes */
  private onAdd(palette: string): void {
    this.app?.palettes.addColour(palette, this.colour);
  }

  /** Delete the saved colour that was asked about, if confirmed */
  private onConfirm(event: CustomEvent<{ value: string }>): void {
    event.stopPropagation();
    const swatch = this.confirming as SwatchRef;
    this.confirming = undefined;
    const app = this.app as PaintCanvas;
    if (event.detail.value === DELETE_CHOICE)
      app.palettes.removeColour(swatch.palette, swatch.index);
    // Back to the colour, or the one that took its place
    const count = this.coloursOf(swatch.palette).length;
    if (count > 0)
      void this.focusSwatch({
        palette: swatch.palette,
        index: Math.min(swatch.index, count - 1),
      });
  }

  /**
   * Make a palette, asking for its name. The user is its author (see `PaintCanvas.author`).
   */
  async createPalette(): Promise<ColourPalette | undefined> {
    const app = this.app;
    if (!app) return undefined;
    const name = await this.prompt({
      heading: this.t("paintCanvas.palette.newPaletteHeading"),
      label: this.t("paintCanvas.palette.name"),
      value: this.t("paintCanvas.palette.defaultName"),
      confirm: this.t("paintCanvas.common.save"),
      cancel: this.t("paintCanvas.common.cancel"),
    });
    return name === null
      ? undefined
      : app.palettes.create(name, [], app.author);
  }

  /**
   * Do one of a palette's menu actions: rename it (asking for a name), export it, or delete it (asking first).
   */
  async actOnPalette(
    id: string,
    action: (typeof PALETTE_ACTIONS)[number],
  ): Promise<void> {
    const app = this.app;
    const palette = app?.palettes.get(id);
    if (!app || !palette) return;
    if (action === "export") {
      await this.exportFile([palette]);
      return;
    }
    if (action === "rename") {
      const name = await this.prompt({
        heading: this.t("paintCanvas.palette.renameHeading"),
        label: this.t("paintCanvas.palette.name"),
        value: palette.name,
        confirm: this.t("paintCanvas.common.save"),
        cancel: this.t("paintCanvas.common.cancel"),
      });
      if (name !== null) app.palettes.rename(id, name);
      return;
    }
    const confirmed = await this.confirm({
      heading: this.t("paintCanvas.palette.deletePaletteHeading"),
      message: this.t("paintCanvas.palette.deletePaletteConfirm", {
        name: palette.name,
      }),
      confirm: this.t("paintCanvas.common.delete"),
      cancel: this.t("paintCanvas.common.cancel"),
      cancelling: true,
    });
    if (confirmed) app.palettes.remove(id);
  }

  /** Close the palette with Escape (unless a dialog or menu is open, which closes first) */
  private onKeyDown(event: KeyboardEvent): void {
    if (
      event.key !== "Escape" ||
      this.confirming !== undefined ||
      this.menu !== undefined
    )
      return;
    // Escape doesn't also cancel a lasso shape or transform
    event.preventDefault();
    event.stopPropagation();
    this.app?.closePanel();
  }

  /**
   * Import the palettes in a colour palette file as the user's own, replacing ones with the same IDs.
   */
  async importFile(file: File): Promise<void> {
    const app = this.app;
    if (!app) return;
    try {
      const palettes = colourPaletteFile.parse(await file.text(), {
        author: app.author,
      });
      const count = app.palettes.merge(palettes);
      emit(this, "pc-toast", {
        message: this.t("paintCanvas.palette.imported", { count }),
        kind: "success",
      });
    } catch (error) {
      emit(this, "pc-toast", {
        message: this.t(importErrorKey(error)),
        kind: "error",
      });
    }
  }

  /**
   * Export palettes (the user's own by default) as a colour palette file, or say there are none.
   */
  async exportFile(
    palettes: readonly ColourPalette[] = this.app?.palettes.items ?? [],
  ): Promise<void> {
    const app = this.app;
    if (!app) return;
    try {
      await this.saveFile(
        new Blob([colourPaletteFile.write(palettes)], {
          type: "application/json",
        }),
        colourPaletteFile.fileName(undefined, app.names.filePrefix),
      );
    } catch (error) {
      emit(this, "pc-toast", {
        message: this.t(
          error instanceof AssetFileError && error.reason === "empty"
            ? "paintCanvas.palette.nothingToExport"
            : "paintCanvas.palette.exportFailed",
        ),
        kind: "error",
      });
    }
  }

  /** The colour model tabs and the selected model's sliders */
  private renderChannels() {
    const rgb = hexToRgb(this.colour);
    const values: Rgb | Hsl = this.model === "rgb" ? rgb : this.hsl;
    return html`<div class="channels">
      <div
        role="tablist"
        aria-label=${this.t("paintCanvas.palette.model")}
        @keydown=${this.onTabKeyDown}
      >
        ${MODELS.map(
          (model) =>
            html`<button
              type="button"
              role="tab"
              id="tab-${model}"
              data-model=${model}
              aria-selected=${this.model === model}
              aria-controls="sliders"
              tabindex=${this.model === model ? 0 : -1}
              @click=${() => void this.selectModel(model)}
            >
              ${this.t(`paintCanvas.palette.${model}`)}
            </button>`,
        )}
      </div>
      <div
        id="sliders"
        class="sliders"
        role="tabpanel"
        aria-labelledby="tab-${this.model}"
      >
        ${CHANNELS[this.model].map((channel) => {
          const value = String(
            (values as unknown as Record<string, number>)[channel.key],
          );
          const name = this.t(channel.name);
          return html`<span class="letter" aria-hidden="true"
              >${channel.key.toUpperCase()}</span
            ><input
              type="range"
              data-channel=${channel.key}
              style="--track: ${channelGradient(channel.key, rgb, this.hsl)}"
              min="0"
              max=${channel.max}
              aria-label=${name}
              .value=${live(value)}
              @input=${(e: Event) => this.onChannel(channel, e)}
            /><input
              type="number"
              data-channel=${channel.key}
              min="0"
              max=${channel.max}
              aria-label=${name}
              .value=${live(value)}
              @change=${(e: Event) => this.onChannel(channel, e)}
            />`;
        })}
      </div>
    </div>`;
  }

  /** A palette: its name (and the ⋮ menu of the user's own), its colours and its [+] button */
  private renderPalette(palette: ShownPalette) {
    const { colours, id } = palette;
    const canAdd =
      !colours.includes(this.colour) && colours.length < MAX_PALETTE_COLOURS;
    const focused = this.focused.palette === id ? this.focused.index : 0;
    const add = this.t("paintCanvas.palette.add", {
      colour: this.colour,
      name: palette.name,
    });
    const menu: MenuItem[] = PALETTE_ACTIONS.map((action) => ({
      value: action,
      label: this.t(`paintCanvas.palette.${action}Palette`),
      danger: action === "delete",
    }));
    return html`<section class="palette-group" data-palette=${id}>
      <div class="palette-heading">
        <h3 id="palette-${id}">${palette.name}</h3>
        ${
          palette.own
            ? html`<pc-context-menu
                label=${this.t("paintCanvas.palette.paletteActions", {
                  name: palette.name,
                })}
                .items=${menu}
                @pc-select=${(event: CustomEvent<{ value: string }>) =>
                  void this.actOnPalette(
                    id,
                    event.detail.value as (typeof PALETTE_ACTIONS)[number],
                  )}
              ></pc-context-menu>`
            : nothing
        }
      </div>
      <div
        class="swatches"
        data-palette=${id}
        role="group"
        aria-labelledby="palette-${id}"
      >
        ${colours.map((colour, index) => {
          const swatch = { palette: id, index };
          return html`<button
            type="button"
            class="swatch"
            data-index=${index}
            style="--colour: ${colour}"
            title=${colour}
            aria-label=${colour}
            aria-haspopup=${palette.own ? "menu" : nothing}
            aria-pressed=${colour === this.colour}
            tabindex=${index === focused ? 0 : -1}
            @click=${(e: MouseEvent) => this.onSwatchClick(e, swatch)}
            @contextmenu=${(e: MouseEvent) =>
              this.onSwatchContextMenu(e, swatch)}
            @pointerdown=${(e: PointerEvent) =>
              this.onSwatchPointerDown(e, swatch)}
            @pointermove=${this.onSwatchPointerMove}
            @pointerup=${this.cancelPress}
            @pointercancel=${this.cancelPress}
            @keydown=${(e: KeyboardEvent) => this.onSwatchKeyDown(e, swatch)}
          ></button>`;
        })}
        ${
          palette.own
            ? html`<button
                type="button"
                class="add"
                title=${add}
                aria-label=${add}
                ?disabled=${!canAdd}
                @click=${() => this.onAdd(id)}
              >
                +
              </button>`
            : nothing
        }
      </div>
    </section>`;
  }

  /** The saved colour's menu, while open */
  private renderMenu() {
    const menu = this.menu;
    if (!menu) return nothing;
    const items: MenuItem[] = [
      {
        value: DELETE_CHOICE,
        label: this.t("paintCanvas.palette.deleteColour"),
        danger: true,
      },
    ];
    return html`<pc-menu
      open
      .x=${menu.x}
      .y=${menu.y}
      label=${this.t("paintCanvas.palette.colourActions", {
        colour: this.colourAt(menu) as string,
      })}
      .items=${items}
      @pc-select=${() =>
        (this.confirming = { palette: menu.palette, index: menu.index })}
      @pc-close=${() => {
        this.menu = undefined;
        // Back to the colour, unless the dialog asking to delete it takes focus
        if (this.confirming === undefined)
          void this.focusSwatch({ palette: menu.palette, index: menu.index });
      }}
    ></pc-menu>`;
  }

  /** The dialog asking before deleting a saved colour, while asking */
  private renderConfirmation() {
    if (this.confirming === undefined) return nothing;
    const choices: DialogChoice[] = [
      {
        value: DELETE_CHOICE,
        label: this.t("paintCanvas.palette.deleteConfirm"),
        cancelling: true,
      },
      {
        value: CANCEL_CHOICE,
        label: this.t("paintCanvas.common.dismiss"),
        variant: "dismiss",
      },
    ];
    return html`<pc-dialog
      heading=${this.t("paintCanvas.palette.deleteColour")}
      message=${this.t("paintCanvas.palette.deleteMessage")}
      .choices=${choices}
      @pc-choose=${this.onConfirm}
    ></pc-dialog>`;
  }

  protected override get defaultIcon(): string {
    return "";
  }

  protected override get defaultLabel(): string {
    return this.t("paintCanvas.palette.label");
  }

  protected override renderBody() {
    const app = this.app;
    if (!app) return nothing;
    return html`<div class="palette" @keydown=${this.onKeyDown}>
        <div class="top">
          <div class="current">
            <pc-colour-pair
              .app=${app}
              @pc-colour-click=${this.onColourClick}
            ></pc-colour-pair>
            <input
              class="hex"
              spellcheck="false"
              autocomplete="off"
              maxlength="7"
              aria-label=${this.t("paintCanvas.palette.hex")}
              aria-invalid=${
                this.hexDraft !== undefined && !normaliseHex(this.hexDraft)
              }
              .value=${live(this.hexDraft ?? this.colour.toUpperCase())}
              @input=${this.onHexInput}
              @change=${this.onHexChange}
            />
          </div>
          ${this.renderChannels()}
        </div>
        <div
          class="palettes"
          role="group"
          aria-label=${this.t("paintCanvas.palette.saved")}
        >
          ${this.shown().map((palette) => this.renderPalette(palette))}
        </div>
        <div class="actions">
          <button
            type="button"
            class="pill-s new-palette"
            @click=${() => void this.createPalette()}
          >
            ${this.t("paintCanvas.palette.newPalette")}
          </button>
          <button
            type="button"
            class="pill-s import"
            @click=${() =>
              this.renderRoot
                .querySelector<HTMLInputElement>(".import-file")
                ?.click()}
          >
            ${this.t("paintCanvas.palette.import")}
          </button>
          <button
            type="button"
            class="pill-s export"
            @click=${() => void this.exportFile()}
          >
            ${this.t("paintCanvas.palette.export")}
          </button>
          <!-- Chosen through "Import" -->
          <label class="visually-hidden">
            ${this.t("paintCanvas.palette.importFile")}
            <input
              type="file"
              class="import-file"
              tabindex="-1"
              accept="application/json,.json"
              @change=${(e: Event) => {
                const input = e.target as HTMLInputElement;
                const file = input.files?.[0];
                input.value = "";
                if (file) void this.importFile(file);
              }}
            />
          </label>
        </div>
      </div>
      ${this.renderMenu()} ${this.renderConfirmation()}`;
  }
}

defineElement("pc-panel-colours", PcPanelColours);
