import type { ReactiveController, ReactiveControllerHost } from "lit";

/** How a side of the `<paint-canvas>` layout shows its content */
export type SideMode = "docked" | "rail" | "floating";

/** All side modes */
export const SIDE_MODES: readonly SideMode[] = ["docked", "rail", "floating"];

/** A side mode, and the layout width below which it applies (none for the mode used otherwise) */
export interface SideModeRule {
  mode: SideMode;
  below?: number;
}

/** Side modes used unless the implementer chooses others: docked, and a rail below 600px wide */
export const DEFAULT_SIDE_MODES = "docked, rail@600";

/** Layout width (CSS pixels) below which the layout counts as narrow, unless the implementer chooses another */
export const DEFAULT_NARROW_WIDTH = 600;

/**
 * Read a side's modes, e.g. `"docked, rail@600, floating@400"`: docked, a rail below 600px wide, and floating below
 * 400px. Unknown modes and widths that aren't numbers are left out.
 *
 * @example
 * parseSideModes("docked, rail@600"); // [{ mode: "docked" }, { mode: "rail", below: 600 }]
 */
export const parseSideModes = (text: string): SideModeRule[] =>
  text
    .split(",")
    .map((part) => part.trim().split("@"))
    .filter(
      ([mode, below]) =>
        SIDE_MODES.includes(mode as SideMode) &&
        (below === undefined || Number.isFinite(Number(below))),
    )
    .map(([mode, below]) =>
      below === undefined
        ? { mode: mode as SideMode }
        : { mode: mode as SideMode, below: Number(below) },
    );

/**
 * The side mode for a layout width: the rule with the smallest width the layout is below, otherwise the rule without
 * a width (docked if there's none).
 *
 * @example
 * sideModeFor(parseSideModes("docked, rail@600, floating@400"), 500); // "rail"
 */
export const sideModeFor = (
  rules: readonly SideModeRule[],
  width: number,
): SideMode => {
  let chosen = rules.find((rule) => rule.below === undefined)?.mode ?? "docked";
  let limit = Infinity;
  for (const rule of rules) {
    if (rule.below !== undefined && width < rule.below && rule.below < limit) {
      chosen = rule.mode;
      limit = rule.below;
    }
  }
  return chosen;
};

/** The kind of input being used */
export type InputKind = "pen" | "touch" | "mouse";

/** What the `<paint-canvas>` layout is like now, for showing UI per device or size */
export interface LayoutState {
  /** Layout width in CSS pixels */
  width: number;
  /** Whether the layout is narrower than its narrow width */
  narrow: boolean;
  /** The input being used now (from the latest press), not a guess about the device */
  input: InputKind;
  /** Whether the interface is hidden (Tab key) */
  uiHidden: boolean;
  /** How the left side shows its content */
  leftMode: SideMode;
  /** How the right side shows its content */
  rightMode: SideMode;
}

/** Event the layout dispatches when its state changes (detail: `LayoutState`) */
export const STATE_EVENT = "pc-state-change";

/**
 * Whether a layout state meets a condition: space-separated terms that must all hold, each `narrow`, `ui-hidden`,
 * `input:pen`, `input:touch`, `input:mouse`, `left:<mode>` or `right:<mode>`, optionally negated with `!`.
 *
 * @example
 * matchesState("narrow !input:pen", state);
 */
export const matchesState = (condition: string, state: LayoutState): boolean =>
  condition
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => {
      const negated = term.startsWith("!");
      const [name, value] = (negated ? term.slice(1) : term).split(":");
      const holds =
        name === "narrow"
          ? state.narrow
          : name === "ui-hidden"
            ? state.uiHidden
            : name === "input"
              ? state.input === value
              : name === "left"
                ? state.leftMode === value
                : name === "right"
                  ? state.rightMode === value
                  : false;
      return holds !== negated;
    });

/** An element that publishes a layout state (the `<paint-canvas>` layout) */
interface StateSource extends EventTarget {
  readonly state: LayoutState;
}

/**
 * The nearest `<paint-canvas>` layout around an element, looking through shadow roots, if any.
 */
export const findLayout = (element: Element): StateSource | undefined => {
  let node: Node | null = element;
  while (node) {
    if (node instanceof Element && node.tagName === "PAINT-CANVAS")
      return node as unknown as StateSource;
    node =
      node.parentNode instanceof ShadowRoot
        ? node.parentNode.host
        : (node.parentNode ?? null);
  }
  return undefined;
};

/**
 * Keeps a Lit element up to date with the state of the `<paint-canvas>` layout it's in (see `LayoutState`), so it can
 * render differently per device or size. `state` is undefined outside a layout.
 *
 * @example
 * class MyThing extends LitElement {
 *   private layout = new LayoutStateController(this);
 *   override render() {
 *     return this.layout.state?.narrow ? html`…` : html`…`;
 *   }
 * }
 */
export class LayoutStateController implements ReactiveController {
  private readonly host: ReactiveControllerHost & Element;

  private source?: StateSource;

  private readonly onChange = () => this.host.requestUpdate();

  constructor(host: ReactiveControllerHost & Element) {
    this.host = host;
    host.addController(this);
  }

  /** The layout's state, if the element is in a layout */
  get state(): LayoutState | undefined {
    return this.source?.state;
  }

  hostConnected(): void {
    this.source = findLayout(this.host);
    this.source?.addEventListener(STATE_EVENT, this.onChange);
  }

  hostDisconnected(): void {
    this.source?.removeEventListener(STATE_EVENT, this.onChange);
    this.source = undefined;
  }
}
