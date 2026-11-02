/** Maximum number of actions that can be undone */
export const MAX_HISTORY_ENTRIES = 20;

/** Event dispatched after a step is undone (detail: `HistoryStepDetail`) */
export const UNDO_EVENT = "undo";

/** Event dispatched after a step is redone (detail: `HistoryStepDetail`) */
export const REDO_EVENT = "redo";

/** Details of an undo or redo event: the step undone or redone */
export interface HistoryStepDetail {
  step: string;
}

/** An action that can be undone and redone */
export interface HistoryEntry {
  /** Put things back as they were before the action */
  undo(): void;
  /** Apply the action again after it was undone */
  redo(): void;
}

/**
 * A timeline of the user's actions. Undo moves back along it and redo moves forward again. Recording an action after
 * undoing removes the undone actions. Only the latest `limit` actions are kept.
 *
 * Actions recorded while an entry is being undone or redone (or inside `untracked`) are ignored, so entries can use
 * the same methods that record actions. Each recorded step gets an ID. Dispatches `change` when what can be undone or
 * redone changes, and `undo` or `redo` (with the step's ID) after a step is undone or redone.
 *
 * @example
 * const history = new History();
 * history.push({ undo: () => (layer.opacity = 1), redo: () => (layer.opacity = 0.5) });
 * history.undo(); // layer.opacity is 1
 * history.redo(); // layer.opacity is 0.5
 */
export default class History extends EventTarget {
  /** Maximum number of entries kept */
  readonly limit: number;

  private entries: HistoryEntry[] = [];

  /** Number of entries applied (the rest can be redone) */
  private applied = 0;

  /** Each recorded step's ID */
  private readonly steps = new WeakMap<HistoryEntry, string>();

  private paused = false;

  constructor(limit = MAX_HISTORY_ENTRIES) {
    super();
    this.limit = limit;
  }

  /** Number of recorded steps (done and undone), at most `limit` */
  get size(): number {
    return this.entries.length;
  }

  /** Whether there is an action to undo */
  get canUndo(): boolean {
    return this.applied > 0;
  }

  /** Whether there is an undone action to redo */
  get canRedo(): boolean {
    return this.applied < this.entries.length;
  }

  /** Whether actions are being recorded (not while undoing, redoing or inside `untracked`) */
  get recording(): boolean {
    return !this.paused;
  }

  /**
   * Record an action that has just been applied. Removes any undone actions, and the oldest action when over the limit.
   */
  push(entry: HistoryEntry): void {
    if (this.paused) return;
    this.steps.set(entry, crypto.randomUUID());
    this.entries = [...this.entries.slice(0, this.applied), entry].slice(
      -this.limit,
    );
    this.applied = this.entries.length;
    this.notify();
  }

  /**
   * Undo the latest applied action. Returns whether there was one.
   */
  undo(): boolean {
    if (!this.canUndo) return false;
    this.applied -= 1;
    const entry = this.entries[this.applied] as HistoryEntry;
    this.untracked(() => entry.undo());
    this.notify();
    this.announce(UNDO_EVENT, entry);
    return true;
  }

  /**
   * Redo the next undone action. Returns whether there was one.
   */
  redo(): boolean {
    if (!this.canRedo) return false;
    const entry = this.entries[this.applied] as HistoryEntry;
    this.applied += 1;
    this.untracked(() => entry.redo());
    this.notify();
    this.announce(REDO_EVENT, entry);
    return true;
  }

  /**
   * Forget all actions (e.g. when the canvas is replaced).
   */
  clear(): void {
    this.entries = [];
    this.applied = 0;
    this.notify();
  }

  /**
   * Tell listeners that what can be undone or redone may have changed.
   */
  /**
   * The ID of the latest recorded step (undefined when there are none), e.g. to tell others which step a stroke made.
   */
  get latestStep(): string | undefined {
    const entry = this.entries.at(-1);
    return entry && this.steps.get(entry);
  }

  /** Dispatch an undo or redo event for a step */
  private announce(type: string, entry: HistoryEntry): void {
    this.dispatchEvent(
      new CustomEvent<HistoryStepDetail>(type, {
        detail: { step: this.steps.get(entry) as string },
      }),
    );
  }

  private notify(): void {
    this.dispatchEvent(new Event("change"));
  }

  /**
   * Run a function without recording the actions it applies. Returns the function's result.
   *
   * @example
   * history.untracked(() => stack.create()); // not undoable
   */
  untracked<T>(run: () => T): T {
    const paused = this.paused;
    this.paused = true;
    try {
      return run();
    } finally {
      this.paused = paused;
    }
  }
}
