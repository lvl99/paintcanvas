import { LitElement } from "lit";
import { defineElement } from "../../base";
import { LayoutStateController, matchesState } from "../../layout";

/**
 * Creates the contents of its `<template>` only while the `<paint-canvas>` layout it's in meets a condition (see
 * `matchesState`), e.g. to show a different element on narrow layouts or while using touch. The contents are added
 * beside the template, in the page (not a shadow root), so the page's styles apply. Outside a layout, nothing shows.
 *
 * @example
 * html`<pc-match when="narrow"><template><my-compact-thing></my-compact-thing></template></pc-match>`
 * html`<pc-match when="!narrow input:pen"><template>…</template></pc-match>`
 */
export class PcMatch extends LitElement {
  static override properties = { when: { type: String } };

  /** The condition (see `matchesState`) */
  declare when: string;

  private readonly layout = new LayoutStateController(this);

  /** The contents created from the template, while shown */
  private created: Node[] = [];

  constructor() {
    super();
    this.when = "";
  }

  // The contents go in the page, beside the template
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /** Whether the condition holds now */
  get active(): boolean {
    const state = this.layout.state;
    return state !== undefined && matchesState(this.when, state);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.clear();
  }

  /** Remove the created contents */
  private clear(): void {
    for (const node of this.created) node.parentNode?.removeChild(node);
    this.created = [];
  }

  // Add or remove the template's contents as the condition starts or stops holding
  protected override updated(): void {
    const shown = this.created.length > 0;
    if (this.active === shown) return;
    if (shown) {
      this.clear();
      return;
    }
    const template = this.querySelector(":scope > template");
    if (!(template instanceof HTMLTemplateElement)) return;
    const content = template.content.cloneNode(true);
    this.created = [...content.childNodes];
    this.append(content);
  }

  // Nothing to render: the contents are managed in `updated`
  protected override render(): null {
    return null;
  }
}

defineElement("pc-match", PcMatch);
