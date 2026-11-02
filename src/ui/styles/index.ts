// Styles shared by PaintCanvas's drawing elements, using the design tokens. Ported from the original app's shared
// styles: windows and buttons, icon toggles and buttons, small pill buttons, and controls whose text can't be selected.
import { css } from "lit";

/** Windows, menus and dialog buttons: affirmative buttons purple, cancel and close buttons pink */
export const windows = css`
  button,
  input,
  select,
  textarea {
    font-family: inherit;
  }
  [role="dialog"],
  .window {
    padding: var(--pc-space-3);
    border-radius: var(--pc-radius);
    background: var(--pc-surface-raised);
    color: var(--pc-text);
    box-shadow: var(--pc-shadow);
  }
  .menu-surface {
    background: var(--pc-surface-raised);
    color: var(--pc-text);
    box-shadow: var(--pc-shadow);
  }
  button.affirmative,
  button[type="submit"],
  button.cancel,
  button.close {
    min-height: var(--pc-control-size);
    padding: var(--pc-space-1) var(--pc-space-3);
    border: 0;
    border-radius: var(--pc-radius-pill);
    color: var(--pc-accent-text);
    font: inherit;
    font-weight: bold;
    cursor: pointer;
  }
  button.affirmative,
  button[type="submit"] {
    background: var(--pc-accent);
  }
  button.cancel,
  button.close {
    background: var(--pc-cancel);
    color: var(--pc-cancel-text);
  }
  button.affirmative:hover,
  button[type="submit"]:hover,
  button.cancel:hover,
  button.close:hover {
    filter: brightness(1.15);
  }
  button.affirmative:focus-visible,
  button[type="submit"]:focus-visible,
  button.cancel:focus-visible,
  button.close:focus-visible {
    outline: var(--pc-focus-width) solid var(--pc-focus);
    outline-offset: 2px;
  }
  button.affirmative:disabled,
  button[type="submit"]:disabled,
  button.cancel:disabled,
  button.close:disabled {
    opacity: 0.5;
    filter: none;
    cursor: default;
  }
  button.close.dismiss {
    border: 0;
    background: transparent;
    color: var(--pc-dismiss-text);
  }
  button.close.dismiss:hover {
    filter: none;
    text-decoration: underline;
  }
`;

/** Interface controls whose text isn't selected by clicking or dragging (form fields stay selectable) */
export const noTextSelection = css`
  :host {
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  input,
  select,
  textarea {
    user-select: text;
    -webkit-user-select: text;
  }
`;

/** Icon toggles (a checkbox hidden behind its icon, purple while on) and boxed icon buttons */
export const iconControls = css`
  .icon-toggle {
    position: relative;
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--pc-border);
    border-radius: var(--pc-radius-small);
    background: var(--pc-surface);
    cursor: pointer;
  }
  .icon-toggle:hover {
    background: var(--pc-surface-hover);
  }
  .icon-toggle:has(input:checked),
  .icon-toggle:has(input:checked):hover {
    border-color: var(--pc-accent);
    background: var(--pc-accent);
  }
  .icon-toggle:has(input:focus-visible) {
    outline: var(--pc-focus-width) solid var(--pc-focus);
  }
  .icon-toggle input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .icon-toggle img,
  button.icon-button img {
    display: block;
    width: var(--pc-icon-size);
    height: var(--pc-icon-size);
    filter: var(--pc-icon-filter);
  }
  .icon-toggle:has(input:disabled) {
    opacity: 0.4;
    cursor: default;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  button.icon-button {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--pc-border);
    border-radius: var(--pc-radius-small);
    background: var(--pc-surface);
    cursor: pointer;
  }
  button.icon-button:hover:not(:disabled) {
    background: var(--pc-surface-hover);
  }
  button.icon-button[aria-pressed="true"] {
    border-color: var(--pc-accent);
    background: var(--pc-accent);
  }
  button.icon-button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button.icon-button:focus-visible {
    outline: var(--pc-focus-width) solid var(--pc-focus);
  }
`;

/** Small purple pill buttons, e.g. "Configure", "New Layer", "Import" */
export const pills = css`
  button.configure,
  button.pill {
    min-height: 30px;
    padding: var(--pc-space-1) var(--pc-space-3);
    border: 0;
    border-radius: var(--pc-radius-pill);
    background: var(--pc-accent);
    color: var(--pc-accent-text);
    font: inherit;
    font-weight: bold;
    cursor: pointer;
  }
  button.configure:hover:not(:disabled),
  button.pill:hover:not(:disabled) {
    filter: brightness(1.15);
  }
  button.configure:focus-visible,
  button.pill:focus-visible {
    outline: var(--pc-focus-width) solid var(--pc-focus);
    outline-offset: 2px;
  }
  button.pill:disabled {
    background: var(--pc-disabled);
    cursor: default;
  }
`;

/** The shared styles as text, e.g. for `unsafeCSS` */
export const WINDOWS_CSS = windows.cssText;
export const NO_TEXT_SELECTION_CSS = noTextSelection.cssText;
export const ICON_CONTROLS_CSS = iconControls.cssText;
export const PILLS_CSS = pills.cssText;
