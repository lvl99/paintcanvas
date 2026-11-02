import { describe, it, expect, vi } from "vitest";
import History, { MAX_HISTORY_ENTRIES, type HistoryEntry } from "..";

/** An entry that sets a shared value, so tests can see where the timeline is */
const setTo = (state: { value: number }, from: number, to: number) => ({
  undo: () => (state.value = from),
  redo: () => (state.value = to),
});

/** Apply and record changes to a shared value: 0 → 1 → 2 → … */
const record = (history: History, state: { value: number }, count: number) => {
  for (let i = 0; i < count; i++) {
    state.value += 1;
    history.push(setTo(state, state.value - 1, state.value));
  }
};

describe("History", () => {
  it("should start with nothing to undo or redo", () => {
    const history = new History();
    expect(history.limit).toBe(MAX_HISTORY_ENTRIES);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.recording).toBe(true);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it("should undo and redo along the timeline", () => {
    const history = new History();
    const state = { value: 0 };
    record(history, state, 3);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(state.value).toBe(1);
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toBe(true);
    expect(state.value).toBe(2);
    expect(history.redo()).toBe(true);
    expect(state.value).toBe(3);
    expect(history.redo()).toBe(false);
    expect(history.canUndo).toBe(true);
  });

  it("should remove undone actions when a new one is recorded", () => {
    const history = new History();
    const state = { value: 0 };
    record(history, state, 5);
    for (let i = 0; i < 3; i++) history.undo();
    record(history, state, 1);
    expect(state.value).toBe(3);
    expect(history.canRedo).toBe(false);
    while (history.undo());
    expect(state.value).toBe(0);
  });

  it("should keep only the latest actions", () => {
    const history = new History(3);
    const state = { value: 0 };
    record(history, state, 5);
    while (history.undo());
    expect(state.value).toBe(2);
  });

  it("should ignore actions recorded while undoing or redoing", () => {
    const history = new History();
    const nested = vi.fn();
    const entry: HistoryEntry = {
      undo: () => {
        expect(history.recording).toBe(false);
        history.push({ undo: nested, redo: nested });
      },
      redo: () => history.push({ undo: nested, redo: nested }),
    };
    history.push(entry);
    history.undo();
    history.redo();
    expect(history.recording).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(false);
    expect(nested).not.toHaveBeenCalled();
  });

  it("should not record inside untracked, even when it throws", () => {
    const history = new History();
    expect(
      history.untracked(() => {
        history.untracked(() => history.push(setTo({ value: 0 }, 0, 1)));
        expect(history.recording).toBe(false);
        return "done";
      }),
    ).toBe("done");
    expect(() =>
      history.untracked(() => {
        throw new Error("failed");
      }),
    ).toThrow("failed");
    expect(history.recording).toBe(true);
    expect(history.canUndo).toBe(false);
  });

  it("should forget everything when cleared", () => {
    const history = new History();
    record(history, { value: 0 }, 2);
    history.undo();
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});

describe("History change events", () => {
  it("should dispatch change when recording, undoing, redoing and clearing", () => {
    const history = new History();
    let changes = 0;
    history.addEventListener("change", () => changes++);
    history.push({ undo: () => {}, redo: () => {} });
    history.undo();
    history.redo();
    history.clear();
    expect(changes).toBe(4);
    // Nothing to undo or redo: no change
    history.undo();
    history.redo();
    expect(changes).toBe(4);
  });

  it("should give each recorded step an ID, and say which step was undone or redone", () => {
    const history = new History();
    expect(history.latestStep).toBeUndefined();
    history.push({ undo: () => undefined, redo: () => undefined });
    const step = history.latestStep;
    expect(step).toMatch(/^[0-9a-f-]{36}$/);
    const steps: [string, string][] = [];
    for (const type of ["undo", "redo"])
      history.addEventListener(type, (event) =>
        steps.push([
          type,
          (event as CustomEvent<{ step: string }>).detail.step,
        ]),
      );
    history.undo();
    history.redo();
    expect(steps).toEqual([
      ["undo", step],
      ["redo", step],
    ]);
  });
});
