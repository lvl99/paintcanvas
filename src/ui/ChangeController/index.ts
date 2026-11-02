import type { ReactiveController, ReactiveControllerHost } from "lit";

/**
 * Re-renders a Lit component whenever any of the given state objects dispatch a `change` event, first telling
 * `onChange` (if given) which one changed.
 *
 * The targets are re-read before every update, so replaced state objects (e.g. new layers after a canvas resize) are picked up.
 *
 * @example
 * class MyElement extends LitElement {
 *   private changes = new ChangeController(this, () => [this.app, this.app?.layers]);
 * }
 */
export default class ChangeController implements ReactiveController {
  private readonly host: ReactiveControllerHost;

  private readonly getTargets: () => (EventTarget | undefined)[];

  private subscribed: EventTarget[] = [];

  private readonly notify?: (target: EventTarget) => void;

  private readonly onChange = (event: Event) => {
    this.notify?.(event.currentTarget as EventTarget);
    this.host.requestUpdate();
  };

  constructor(
    host: ReactiveControllerHost,
    getTargets: () => (EventTarget | undefined)[],
    onChange?: (target: EventTarget) => void,
  ) {
    this.host = host;
    this.getTargets = getTargets;
    this.notify = onChange;
    host.addController(this);
  }

  /**
   * Subscribe to the current targets, replacing any previous subscriptions.
   */
  refresh(): void {
    this.unsubscribe();
    this.subscribed = this.getTargets().filter(
      (t): t is EventTarget => t !== undefined,
    );
    for (const target of this.subscribed)
      target.addEventListener("change", this.onChange);
  }

  /**
   * Subscribe when the component connects.
   */
  hostConnected(): void {
    this.refresh();
  }

  /**
   * Re-subscribe before each update in case targets were replaced.
   */
  hostUpdate(): void {
    this.refresh();
  }

  /**
   * Unsubscribe when the component disconnects.
   */
  hostDisconnected(): void {
    this.unsubscribe();
  }

  /**
   * Remove all subscriptions.
   */
  private unsubscribe(): void {
    for (const target of this.subscribed)
      target.removeEventListener("change", this.onChange);
    this.subscribed = [];
  }
}
