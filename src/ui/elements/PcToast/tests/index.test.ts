import { afterEach, describe, it, expect, vi } from "vitest";
import "..";
import { TOAST_DURATION_MS, type PcToast } from "..";
import { events, mount, shadow } from "../../../../testing/elements";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("pc-toast", () => {
  it("should show its message politely, with an action, and dismiss itself after a while", async () => {
    vi.useFakeTimers();
    const toast = await mount<PcToast>("pc-toast", {
      message: "Deleted",
      action: "Undo",
    });
    const actions = events(toast, "pc-action");
    const dismissals = events(toast, "pc-dismiss");
    expect(shadow(toast, ".toast").getAttribute("role")).toBe("status");
    const [action, dismiss] = [
      ...toast.shadowRoot!.querySelectorAll<HTMLElement>("pc-button"),
    ];
    expect([action!.textContent, dismiss!.textContent]).toEqual([
      "Undo",
      "Dismiss",
    ]);
    action!.click();
    expect(actions).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(dismissals).toHaveLength(1);
    dismiss!.click();
    expect(dismissals).toHaveLength(2);
  });

  it("should colour successes, announcing them politely", async () => {
    const toast = await mount<PcToast>("pc-toast", {
      message: "Saved",
      kind: "success",
    });
    expect(toast.getAttribute("kind")).toBe("success");
    expect(shadow(toast, ".toast").getAttribute("role")).toBe("status");
  });

  it("should announce errors at once, and stay without a duration", async () => {
    vi.useFakeTimers();
    const toast = await mount<PcToast>("pc-toast", {
      message: "Failed",
      kind: "error",
      duration: 0,
    });
    const dismissals = events(toast, "pc-dismiss");
    expect(shadow(toast, ".toast").getAttribute("role")).toBe("alert");
    expect(toast.shadowRoot!.querySelectorAll("pc-button")).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    toast.kind = "info";
    await toast.updateComplete;
    toast.remove();
    expect(dismissals).toHaveLength(0);
  });
});
