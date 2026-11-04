import { css, html, nothing } from "lit";
import { PcElement, defineElement, emit } from "../../base";
import ChangeController from "../../ChangeController";
import {
  SHORTCUT_DEFINITIONS,
  comboFromEvent,
  comboText,
  heldModifiers,
  type KeyCombo,
  type ShortcutDefinition,
  type ShortcutGroup,
} from "../../../lib/utils/shortcuts";
import type { ShortcutChangeResult } from "../../../lib/classes/ShortcutSettings";

/** Keyboard shortcut settings `pc-shortcut-settings` can change: PaintCanvas's `ShortcutSettings`, or anything like it */
export interface ShortcutSettingsLike extends EventTarget {
  combo(id: string): KeyCombo | null;
  set(id: string, combo: KeyCombo | null): ShortcutChangeResult;
  reset(): void;
}

/** Keys used to move through and leave the settings, which are never recorded */
const PASSED_KEYS: ReadonlySet<string> = new Set(["Tab", "Escape"]);

/**
 * Translation key and values of a shortcut action's name.
 *
 * @example
 * actionName({ id: "layer-opacity-30", ... }); // ["paintCanvas.shortcuts.layerOpacity", { percent: 30 }]
 */
const actionName = ({
  id,
  action,
}: ShortcutDefinition): [string, Record<string, number>?] =>
  action.type === "layer-opacity"
    ? [
        "paintCanvas.shortcuts.layerOpacity",
        { percent: Math.round(action.opacity * 100) },
      ]
    : [`paintCanvas.shortcuts.${id}`];

/**
 * The shortcut actions in groups, in the order they are listed.
 */
const groups = (): [ShortcutGroup, ShortcutDefinition[]][] => {
  const grouped = new Map<ShortcutGroup, ShortcutDefinition[]>();
  for (const definition of SHORTCUT_DEFINITIONS)
    grouped.set(definition.group, [
      ...(grouped.get(definition.group) ?? []),
      definition,
    ]);
  return [...grouped];
};

/**
 * Every keyboard shortcut action and its key combination, in groups. A configurable action's key combination is changed
 * by focusing its field and pressing the keys (the modifiers held show as they are pressed, e.g. `shift alt cmd ctrl
 * g`); Tab and Escape aren't recorded, so they still move focus and close. Its ⨉ button removes it. A key combination
 * another action has moves to this one; one a fixed action uses isn't set. Both are announced, and sent as
 * `pc-toast`. Fixed actions (e.g. undo, and layer opacity on 1–0) are shown but can't be changed. "Reset" goes back to
 * the default key combinations.
 *
 * @example
 * html`<pc-shortcut-settings .settings=${canvas.shortcuts}></pc-shortcut-settings>`
 */
export class PcShortcutSettings extends PcElement {
  static override properties = {
    ...PcElement.properties,
    settings: { attribute: false },
    recording: { state: true },
    status: { state: true },
  };

  static override styles = [
    PcElement.styles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--pc-space-3);
        color: var(--pc-text);
        font-family: var(--pc-font);
        font-size: var(--pc-font-size);
      }
      section {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--pc-space-1) var(--pc-space-2);
        align-items: center;
      }
      h3 {
        grid-column: 1 / -1;
        margin: 0;
        padding-bottom: var(--pc-space-1);
        border-bottom: 1px solid var(--pc-border);
        font-size: inherit;
      }
      .keys {
        display: flex;
        gap: var(--pc-space-1);
        align-items: center;
        justify-content: flex-end;
      }
      .combo {
        box-sizing: border-box;
        width: 11em;
        min-height: var(--pc-control-size);
        padding: var(--pc-space-1) var(--pc-space-2);
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface);
        color: var(--pc-text);
        font: inherit;
        font-variant-numeric: tabular-nums;
      }
      input.combo {
        cursor: pointer;
      }
      input.combo:focus {
        border-color: var(--pc-accent);
      }
      input.combo:focus-visible,
      button:focus-visible {
        outline: var(--pc-focus-width) solid var(--pc-focus);
        outline-offset: 1px;
      }
      /* Fixed key combinations: shown like the fields, but muted */
      span.combo {
        display: inline-flex;
        align-items: center;
        margin-right: calc(var(--pc-control-size) + var(--pc-space-1));
        background: var(--pc-bar);
        color: var(--pc-text-muted);
      }
      button.remove {
        width: var(--pc-control-size);
        height: var(--pc-control-size);
        padding: 0;
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface);
        color: var(--pc-text);
        font: inherit;
        cursor: pointer;
      }
      button.remove:hover:not(:disabled) {
        background: var(--pc-surface-hover);
      }
      button.remove:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .status:empty {
        display: none;
      }
      /* Stays in view at the bottom of a scrolling window, where toasts may be hidden behind it */
      .status {
        position: sticky;
        bottom: 0;
        margin: 0;
        padding: var(--pc-space-2);
        border: 1px solid var(--pc-border);
        border-radius: var(--pc-radius-small);
        background: var(--pc-surface-raised);
        box-shadow: var(--pc-shadow);
      }
      button.reset {
        align-self: flex-start;
        min-height: var(--pc-control-size);
        padding: var(--pc-space-1) var(--pc-space-3);
        border: 0;
        border-radius: var(--pc-radius-pill);
        background: var(--pc-accent);
        color: var(--pc-accent-text);
        font: inherit;
        font-weight: bold;
        cursor: pointer;
      }
    `,
  ];

  /** The key combinations shown and changed */
  declare settings?: ShortcutSettingsLike;

  /** The action being recorded and the modifiers held so far */
  declare recording?: { id: string; text: string };

  /** The last change's message, for screen readers */
  declare status: string;

  private changes = new ChangeController(this, () => [this.settings]);

  constructor() {
    super();
    this.status = "";
  }

  /** A shortcut action's name in the chosen language */
  private name(definition: ShortcutDefinition): string {
    const [key, values] = actionName(definition);
    return this.t(key, values);
  }

  /** Record the keys pressed in an action's field */
  private onRecordKeyDown(event: KeyboardEvent, id: string): void {
    if (PASSED_KEYS.has(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const combo = comboFromEvent(event);
    if (!combo) {
      this.recording = { id, text: comboText(heldModifiers(event)) };
      return;
    }
    this.recording = undefined;
    this.change(id, combo);
  }

  /** Show the key combination again once modifiers are let go without pressing a key */
  private onRecordKeyUp(event: KeyboardEvent): void {
    if (!this.recording) return;
    const text = comboText(heldModifiers(event));
    this.recording = text ? { ...this.recording, text } : undefined;
  }

  /** Set or remove an action's key combination, saying what happened */
  private change(id: string, combo: KeyCombo | null): void {
    const result = (this.settings as ShortcutSettingsLike).set(id, combo);
    const definition = (id: string) =>
      SHORTCUT_DEFINITIONS.find((each) => each.id === id) as ShortcutDefinition;
    const keys = combo ? comboText(combo) : "";
    const message = result.fixed
      ? this.t("paintCanvas.shortcuts.fixedUsed", {
          keys,
          action: this.name(definition(result.fixed)),
        })
      : result.movedFrom
        ? this.t("paintCanvas.shortcuts.moved", {
            keys,
            from: this.name(definition(result.movedFrom)),
            to: this.name(definition(id)),
          })
        : "";
    this.status = message;
    if (message) emit(this, "pc-toast", { message, kind: "info" });
  }

  /** A configurable action's field and remove button */
  private renderField(
    settings: ShortcutSettingsLike,
    definition: ShortcutDefinition,
  ) {
    const { id } = definition;
    const combo = settings.combo(id);
    const name = this.name(definition);
    const recording = this.recording?.id === id ? this.recording : undefined;
    return html`<span class="keys">
      <input
        class="combo"
        id="combo-${id}"
        data-id=${id}
        readonly
        autocomplete="off"
        aria-description=${this.t("paintCanvas.shortcuts.recordHint")}
        placeholder=${this.t("paintCanvas.shortcuts.none")}
        .value=${recording ? recording.text : combo ? comboText(combo) : ""}
        @keydown=${(e: KeyboardEvent) => this.onRecordKeyDown(e, id)}
        @keyup=${this.onRecordKeyUp}
        @blur=${() => (this.recording = undefined)}
      />
      <button
        type="button"
        class="remove"
        data-id=${id}
        title=${this.t("paintCanvas.shortcuts.remove", { action: name })}
        aria-label=${this.t("paintCanvas.shortcuts.remove", { action: name })}
        ?disabled=${!combo}
        @click=${() => this.change(id, null)}
      >
        ⨉
      </button>
    </span>`;
  }

  /** A fixed action's key combinations */
  private renderFixed(definition: ShortcutDefinition) {
    return html`<span class="keys">
      <span
        class="combo"
        id="combo-${definition.id}"
        data-id=${definition.id}
        role="note"
        aria-labelledby="name-${definition.id}"
        aria-description=${this.t("paintCanvas.shortcuts.fixed")}
        >${definition.combos.map((combo) => comboText(combo)).join(", ")}</span
      >
    </span>`;
  }

  override render() {
    const settings = this.settings;
    if (!settings) return nothing;
    return html`${groups().map(
        ([group, definitions]) =>
          html`<section aria-labelledby="group-${group}">
            <h3 id="group-${group}">
              ${this.t(`paintCanvas.shortcuts.group.${group}`)}
            </h3>
            ${definitions.map((definition) =>
              definition.configurable
                ? html`<label for="combo-${definition.id}"
                      >${this.name(definition)}</label
                    >${this.renderField(settings, definition)}`
                : html`<span id="name-${definition.id}"
                      >${this.name(definition)}</span
                    >${this.renderFixed(definition)}`,
            )}
          </section>`,
      )}
      <p class="status" role="status">${this.status}</p>
      <button
        type="button"
        class="reset"
        @click=${() => {
          settings.reset();
          this.status = this.t("paintCanvas.shortcuts.wasReset");
        }}
      >
        ${this.t("paintCanvas.shortcuts.reset")}
      </button>`;
  }
}

defineElement("pc-shortcut-settings", PcShortcutSettings);
