import {
  CONFIGURABLE_SHORTCUTS,
  HOLD_TO_PAN,
  defaultShortcutBindings,
  fixedShortcutFor,
  normaliseCombo,
  sameCombo,
  sanitiseShortcutBindings,
  shortcutsFor,
  type KeyCombo,
  type Shortcut,
  type ShortcutBindings,
} from "../../utils/shortcuts";

/** What happened when setting an action's key combination */
export interface ShortcutChangeResult {
  /** Whether the key combination was set */
  changed: boolean;
  /** The action that had the key combination and lost it, if any */
  movedFrom?: string;
  /** The fixed action that uses the key combination, so it wasn't set */
  fixed?: string;
}

/**
 * The user's keyboard shortcuts: the key combination of each configurable action (see `CONFIGURABLE_SHORTCUTS`), each
 * used by one action at most. Kept in memory; the implementer saves and restores them (see `load` and the `change`
 * event).
 *
 * Dispatches a `change` event when a key combination changes.
 *
 * @example
 * const shortcuts = new ShortcutSettings();
 * shortcuts.set("tool-brush", { key: "p" });
 * shortcuts.combo("tool-brush"); // { key: "p" }
 */
export default class ShortcutSettings extends EventTarget {
  private values: ShortcutBindings;

  private list: Shortcut[];

  constructor(initial?: unknown) {
    super();
    this.values = sanitiseShortcutBindings(initial, defaultShortcutBindings());
    this.list = shortcutsFor(this.values);
  }

  /** Each configurable action's key combination, by ID (read-only copy) */
  get bindings(): Readonly<ShortcutBindings> {
    return this.values;
  }

  /** The shortcuts key presses are matched against (except the hold-to-pan key) */
  get shortcuts(): readonly Shortcut[] {
    return this.list;
  }

  /** The key held to pan, returning to the last tool when released (null when it has none) */
  get holdToPan(): KeyCombo | null {
    return this.values[HOLD_TO_PAN] ?? null;
  }

  /**
   * A configurable action's key combination (null when it has none or there's no such action).
   *
   * @example
   * shortcuts.combo("cut"); // { key: "x", cmd: true }
   */
  combo(id: string): KeyCombo | null {
    return this.values[id] ?? null;
  }

  /**
   * Set or remove (null) a configurable action's key combination. If another configurable action has it, that action
   * loses it (`movedFrom`). Nothing changes for a key combination a fixed action uses (`fixed`), or an unknown action.
   *
   * @example
   * shortcuts.set("tool-brush", { key: "e" }); // { changed: true, movedFrom: "tool-eraser" }
   * shortcuts.set("cut", { key: "z", cmd: true }); // { changed: false, fixed: "undo" }
   */
  set(id: string, combo: KeyCombo | null): ShortcutChangeResult {
    if (!CONFIGURABLE_SHORTCUTS.some((definition) => definition.id === id))
      return { changed: false };
    const next = combo && normaliseCombo(combo);
    const current = this.values[id] ?? null;
    if (next ? current && sameCombo(current, next) : !current)
      return { changed: false };
    if (!next) {
      this.apply({ ...this.values, [id]: null });
      return { changed: true };
    }
    const fixed = fixedShortcutFor(next);
    if (fixed) return { changed: false, fixed: fixed.id };
    const movedFrom = Object.keys(this.values).find((other) => {
      const otherCombo = this.values[other];
      return other !== id && otherCombo && sameCombo(otherCombo, next);
    });
    this.apply({
      ...this.values,
      ...(movedFrom && { [movedFrom]: null }),
      [id]: next,
    });
    return movedFrom ? { changed: true, movedFrom } : { changed: true };
  }

  /**
   * Go back to the default key combinations.
   */
  reset(): void {
    this.load(defaultShortcutBindings());
  }

  /**
   * Replace the key combinations, e.g. with saved or imported ones (see `sanitiseShortcutBindings`; actions left out
   * get their defaults), and dispatch `change` if anything changed.
   *
   * @example
   * shortcuts.load({ "tool-brush": { key: "p" } });
   */
  load(input: unknown): void {
    const next = sanitiseShortcutBindings(input, defaultShortcutBindings());
    const changed = Object.keys(next).some((id) => {
      const [a, b] = [next[id], this.values[id]];
      return a && b ? !sameCombo(a, b) : a !== b;
    });
    if (changed) this.apply(next);
  }

  /** Use new key combinations and tell listeners */
  private apply(bindings: ShortcutBindings): void {
    this.values = bindings;
    this.list = shortcutsFor(bindings);
    this.dispatchEvent(new Event("change"));
  }
}
