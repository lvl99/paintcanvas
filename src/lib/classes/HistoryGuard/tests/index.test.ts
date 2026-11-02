import { describe, it, expect, vi } from "vitest";
import HistoryGuard, { GUARD_STATE, isGuardState, type GuardWindow } from "..";

/** A window with a history of same-page entries; going back or forward fires `popstate` straight away */
const createWindow = (url = "https://example.com/app/") => {
  const entries: { state: unknown; url: string }[] = [{ state: null, url }];
  let index = 0;
  const listeners = new Set<(event: PopStateEvent) => void>();
  /** Move through the history, as the browser's back and forward buttons do */
  const go = (delta: number) => {
    index += delta;
    const event = { state: entries[index]!.state } as PopStateEvent;
    for (const listener of listeners) listener(event);
  };
  const target = {
    location: {
      get href() {
        return entries[index]!.url;
      },
    },
    history: {
      get state() {
        return entries[index]!.state;
      },
      pushState: (state: unknown, _title: string, url: string) => {
        entries.splice(index + 1);
        entries.push({ state, url });
        index++;
      },
      replaceState: (state: unknown, _title: string, url: string) => {
        entries[index] = { state, url };
      },
      back: () => go(-1),
    },
    addEventListener: (_type: string, listener: (e: PopStateEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (
      _type: string,
      listener: (e: PopStateEvent) => void,
    ) => listeners.delete(listener),
  } as unknown as GuardWindow;
  return { target, entries, go, current: () => entries[index]!, listeners };
};

describe("isGuardState", () => {
  it("should recognise only the guard's state", () => {
    expect(isGuardState(GUARD_STATE)).toBe(true);
    expect(isGuardState({ paintcanvasGuard: "yes" })).toBe(false);
    expect(isGuardState(null)).toBe(false);
    expect(isGuardState("x")).toBe(false);
  });
});

describe("HistoryGuard", () => {
  it("should do nothing until attached", () => {
    const onBack = vi.fn();
    const guard = new HistoryGuard(onBack);
    expect(() => {
      guard.guard();
      guard.release();
      guard.detach();
    }).not.toThrow();
  });

  it("should add one entry, put it back when going back, and ask", () => {
    const { target, entries, go, current } = createWindow();
    const onBack = vi.fn();
    const guard = new HistoryGuard(onBack);
    guard.attach(target);
    guard.guard();
    guard.guard();
    expect(entries).toHaveLength(2);
    expect(current().state).toEqual(GUARD_STATE);
    // The page's address changes while guarding (e.g. to another page of the app)
    target.history.replaceState(
      GUARD_STATE,
      "",
      "https://example.com/app/?page=2",
    );
    guard.guard();
    go(-1);
    expect(onBack).toHaveBeenCalledOnce();
    expect(current()).toEqual({
      state: GUARD_STATE,
      url: "https://example.com/app/?page=2",
    });
    expect(entries).toHaveLength(2);
    // Arriving on the guard's own entry (e.g. going forward onto it) is fine
    go(0);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("should go back to the page's own entry when released, keeping the address", () => {
    const { target, entries, current, listeners } = createWindow();
    const onBack = vi.fn();
    const guard = new HistoryGuard(onBack);
    guard.attach(target);
    guard.release();
    guard.guard();
    target.history.replaceState(GUARD_STATE, "", "https://example.com/app/");
    guard.release();
    guard.release();
    expect(current()).toEqual({ state: null, url: "https://example.com/app/" });
    expect(entries).toHaveLength(2);
    expect(onBack).not.toHaveBeenCalled();
    // Released while not on the guard's entry: nothing to go back from
    guard.guard();
    target.history.pushState(null, "", "https://example.com/elsewhere");
    guard.release();
    expect(current().url).toBe("https://example.com/elsewhere");
    guard.detach();
    expect(listeners.size).toBe(0);
  });

  it("should keep the guard's address when asked to guard from another entry", () => {
    const { target, go, current } = createWindow();
    const onBack = vi.fn();
    const guard = new HistoryGuard(onBack);
    guard.attach(target);
    guard.guard();
    // The page adds its own entry after the guard's
    target.history.pushState(null, "", "https://example.com/elsewhere");
    guard.guard();
    go(-1);
    go(-1);
    expect(onBack).toHaveBeenCalledOnce();
    expect(current()).toEqual({
      state: GUARD_STATE,
      url: "https://example.com/app/",
    });
  });

  it("should guard again once back on the page's own entry, when asked to while releasing", () => {
    const { target, go, current } = createWindow();
    const onBack = vi.fn();
    const guard = new HistoryGuard(onBack);
    guard.attach(target);
    guard.guard();
    // Going back takes a moment in browsers: guard again before it arrives
    target.history.back = () => undefined;
    guard.release();
    guard.guard();
    go(-1);
    expect(current().state).toEqual(GUARD_STATE);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("should ignore going back when not guarding", () => {
    const { target, go } = createWindow();
    const onBack = vi.fn();
    const guard = new HistoryGuard(onBack);
    target.history.pushState(null, "", "https://example.com/two");
    guard.attach(target);
    go(-1);
    expect(onBack).not.toHaveBeenCalled();
  });
});
