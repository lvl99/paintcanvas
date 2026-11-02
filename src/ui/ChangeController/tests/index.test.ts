import { describe, it, expect, vi } from "vitest";
import ChangeController from "..";

const createHost = () => ({
  addController: vi.fn(),
  removeController: vi.fn(),
  requestUpdate: vi.fn(),
  updateComplete: Promise.resolve(true),
});

describe("ChangeController", () => {
  it("should request updates when targets change, and stop after disconnecting", () => {
    const host = createHost();
    const target = new EventTarget();
    const controller = new ChangeController(host, () => [target, undefined]);
    expect(host.addController).toHaveBeenCalledWith(controller);

    controller.hostConnected();
    target.dispatchEvent(new Event("change"));
    expect(host.requestUpdate).toHaveBeenCalledOnce();

    controller.hostDisconnected();
    target.dispatchEvent(new Event("change"));
    expect(host.requestUpdate).toHaveBeenCalledOnce();
  });

  it("should say which target changed, before requesting an update", () => {
    const host = createHost();
    const target = new EventTarget();
    const changed: EventTarget[] = [];
    const controller = new ChangeController(
      host,
      () => [target],
      (which) => {
        expect(host.requestUpdate).not.toHaveBeenCalled();
        changed.push(which);
      },
    );
    controller.hostConnected();
    target.dispatchEvent(new Event("change"));
    expect(changed).toEqual([target]);
    expect(host.requestUpdate).toHaveBeenCalledOnce();
  });

  it("should switch to new targets before each update", () => {
    const host = createHost();
    let target = new EventTarget();
    const old = target;
    const controller = new ChangeController(host, () => [target]);
    controller.hostConnected();
    target = new EventTarget();
    controller.hostUpdate();

    old.dispatchEvent(new Event("change"));
    expect(host.requestUpdate).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("change"));
    expect(host.requestUpdate).toHaveBeenCalledOnce();
  });
});
