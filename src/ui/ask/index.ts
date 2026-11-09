// Ask the user to confirm something or type something (e.g. a name) in a `<pc-dialog>`, instead of the browser's own
// `confirm()` and `prompt()` boxes, which can't be styled or translated and block the page.
import "../elements/PcDialog";
import type Translations from "../../lib/i18n";
import {
  CANCEL_CHOICE,
  type DialogChoiceDetail,
  type DialogField,
  type PcDialog,
} from "../elements/PcDialog";

/** The choice that agrees, in the dialogs `askConfirm` and `askText` show */
export const OK_CHOICE = "ok";

/** What to ask */
export interface AskOptions {
  heading: string;
  message?: string;
  /** The button that agrees */
  confirm: string;
  /** The button that doesn't */
  cancel: string;
  /** Whether agreeing removes or replaces something (the button is pink) */
  cancelling?: boolean;
}

/** What to ask for text: as `AskOptions`, with the field's label and the text it starts with */
export interface AskTextOptions extends AskOptions, DialogField {}

/** Asks the user to confirm, resolving true if they agree */
export type ConfirmFn = (options: AskOptions) => boolean | Promise<boolean>;

/** Asks the user for text, resolving with it, or null if they don't give it */
export type PromptFn = (
  options: AskTextOptions,
) => string | null | Promise<string | null>;

/**
 * Show a dialog in a parent (e.g. an element's shadow root) until the user chooses, then remove it. The choice doesn't
 * reach the parent's listeners.
 */
const ask = (
  parent: Node,
  options: AskOptions,
  field?: DialogField,
): Promise<DialogChoiceDetail> =>
  new Promise((resolve) => {
    const dialog = document.createElement("pc-dialog") as PcDialog;
    dialog.heading = options.heading;
    dialog.message = options.message ?? "";
    dialog.field = field;
    dialog.choices = [
      {
        value: OK_CHOICE,
        label: options.confirm,
        cancelling: options.cancelling,
      },
      { value: CANCEL_CHOICE, label: options.cancel, variant: "dismiss" },
    ];
    dialog.addEventListener(
      "pc-choose",
      (event) => {
        event.stopPropagation();
        dialog.remove();
        resolve((event as CustomEvent<DialogChoiceDetail>).detail);
      },
      { once: true },
    );
    parent.appendChild(dialog);
  });

/**
 * Ask the user to confirm in a dialog shown in `parent`, resolving true if they agree (false for the cancel button,
 * Escape or a press outside it).
 *
 * @example
 * if (await askConfirm(this.renderRoot, { heading: "Delete preset", message: 'Delete "Ink"?', confirm: "Delete",
 *   cancel: "Cancel", cancelling: true })) remove();
 */
export const askConfirm = async (
  parent: Node,
  options: AskOptions,
): Promise<boolean> => (await ask(parent, options)).value === OK_CHOICE;

/**
 * Ask the user for text in a dialog shown in `parent`, resolving with what they typed when they agree (or press Enter),
 * or null if they cancel.
 *
 * @example
 * const name = await askText(this.renderRoot, { heading: "Add to presets", label: "Name", value: "Ink",
 *   confirm: "Save", cancel: "Cancel" });
 */
export const askText = async (
  parent: Node,
  { label, value, ...options }: AskTextOptions,
): Promise<string | null> => {
  const choice = await ask(parent, options, { label, value });
  return choice.value === OK_CHOICE ? (choice.text as string) : null;
};

/**
 * The question asked before deleting one of the user's brush presets, in the chosen language.
 *
 * @example
 * await askConfirm(this.renderRoot, deletePresetQuestion(this.translations, "Ink"));
 */
export const deletePresetQuestion = (
  translations: Pick<Translations, "t">,
  name: string,
): AskOptions => ({
  heading: translations.t("paintCanvas.presets.deleteHeading"),
  message: translations.t("paintCanvas.presets.deleteConfirm", { name }),
  confirm: translations.t("paintCanvas.common.delete"),
  cancel: translations.t("paintCanvas.common.cancel"),
  cancelling: true,
});
