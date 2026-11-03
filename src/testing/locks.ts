/**
 * Fake Web Locks shared by any number of pretend windows: `ifAvailable` requests get no lock while another holds it,
 * and `steal` takes it, failing the holder's request with an `AbortError`. A lock is let go when its callback's
 * promise settles. With `failing`, every request fails (as on a page where locks can't be used).
 *
 * @example
 * const { locks, isHeld } = createFakeLocks();
 * new LayerAutosave(canvas, store, { locks }).start();
 * isHeld("paintcanvas:test"); // true
 */
export const createFakeLocks = (failing = false) => {
  /** Fails the request holding each lock, by name */
  const holders = new Map<string, (error: Error) => void>();

  const request = (
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => unknown,
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (failing) {
        reject(new DOMException("Locks can't be used", "SecurityError"));
        return;
      }
      const holder = holders.get(name);
      if (holder && !options.steal) {
        resolve(callback(null));
        return;
      }
      holder?.(new DOMException("The lock was stolen", "AbortError"));
      holders.set(name, reject);
      Promise.resolve(callback({ name, mode: "exclusive" })).then((value) => {
        if (holders.get(name) === reject) holders.delete(name);
        resolve(value);
      }, reject);
    });

  return {
    locks: { request } as unknown as LockManager,
    /** Whether a lock is held */
    isHeld: (name: string): boolean => holders.has(name),
  };
};
