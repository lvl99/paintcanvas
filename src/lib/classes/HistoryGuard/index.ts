/** History state of the entry the guard adds */
export const GUARD_STATE = { paintcanvasGuard: true } as const;

/** The parts of `window` the guard uses (replaceable for tests) */
export type GuardWindow = Pick<
  Window,
  "history" | "location" | "addEventListener" | "removeEventListener"
>;

/**
 * Whether a history state is the guard's entry.
 *
 * @example
 * isGuardState(GUARD_STATE); // true
 * isGuardState(null); // false
 */
export const isGuardState = (state: unknown): boolean =>
  typeof state === "object" &&
  state !== null &&
  (state as Record<string, unknown>).paintcanvasGuard === true;

/**
 * Keeps going back (e.g. swiping from the screen's edge) from leaving the page while it guards: it adds a history entry
 * for the page, and when the browser goes back from it, puts it back and calls `onBack` (to ask before leaving).
 * Releasing goes back to the page's own entry, keeping the address the page shows.
 *
 * Call `guard` whenever the page's address may have changed while guarding (it remembers the address to show), and
 * `release` once leaving is safe.
 *
 * @example
 * const guard = new HistoryGuard(() => askBeforeLeaving());
 * guard.attach(window);
 * guard.guard(); // a canvas is open
 * guard.release(); // the canvas closed
 */
export default class HistoryGuard {
  private readonly onBack: () => void;

  private target?: GuardWindow;

  /** Whether the page wants guarding */
  private wanted = false;

  /** Whether the guard's entry was added (and not yet released) */
  private guarded = false;

  /** The address the guard's entry shows */
  private url = "";

  /** While releasing: the address to keep once back on the page's own entry */
  private releasing?: string;

  constructor(onBack: () => void) {
    this.onBack = onBack;
  }

  /**
   * Start listening for the browser going back.
   */
  attach(target: GuardWindow): void {
    this.detach();
    this.target = target;
    target.addEventListener("popstate", this.onPopState);
  }

  /**
   * Stop listening (the guard's entry, if any, stays).
   */
  detach(): void {
    this.target?.removeEventListener("popstate", this.onPopState);
    this.target = undefined;
    this.guarded = false;
    this.wanted = false;
    this.releasing = undefined;
  }

  /**
   * Guard the page: add the guard's entry if it isn't there, and remember the address it shows.
   */
  guard(): void {
    const target = this.target;
    if (!target) return;
    this.wanted = true;
    // Once released, the guard's entry is added back after going back to the page's own entry
    if (this.releasing !== undefined) return;
    if (!this.guarded) {
      this.guarded = true;
      target.history.pushState(GUARD_STATE, "", target.location.href);
    }
    if (isGuardState(target.history.state)) this.url = target.location.href;
  }

  /**
   * Stop guarding: go back to the page's own entry, keeping the address the page shows now.
   */
  release(): void {
    const target = this.target;
    this.wanted = false;
    if (!target || !this.guarded) return;
    this.guarded = false;
    if (!isGuardState(target.history.state)) return;
    this.releasing = target.location.href;
    target.history.back();
  }

  private readonly onPopState = (event: PopStateEvent): void => {
    const target = this.target as GuardWindow;
    if (this.releasing !== undefined) {
      target.history.replaceState(null, "", this.releasing);
      this.releasing = undefined;
      if (this.wanted) this.guard();
      return;
    }
    if (!this.guarded || isGuardState(event.state)) return;
    // Went back from the guard's entry: put it back, then ask
    target.history.pushState(GUARD_STATE, "", this.url);
    this.onBack();
  };
}
