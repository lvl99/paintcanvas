// Preview of PaintCanvas's base elements: switch language and theme to check them.
import "../src/ui";
import { languageName, translations } from "../src/lib/i18n";
import type { PcContextMenu } from "../src/ui/elements/PcContextMenu";
import type { PcDialog } from "../src/ui/elements/PcDialog";

/** An element on the page (the page always has it) */
const find = <T extends Element = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector) as T;

const select = find<HTMLSelectElement>("#language");
for (const locale of translations.locales) {
  const option = new Option(languageName(locale), locale);
  option.lang = locale;
  select.add(option);
}
await translations.useDeviceLocale();
select.value = translations.locale;
select.addEventListener(
  "change",
  () => void translations.setLocale(select.value),
);

find<HTMLInputElement>("#dark").addEventListener("change", (event) => {
  const dark = (event.target as HTMLInputElement).checked;
  document.body.classList.toggle("dark", dark);
  // Everything inside follows the page's theme, including elements added later
  document.body.dataset.pcTheme = dark ? "dark" : "light";
});

find("#dialog-button").addEventListener("click", () => {
  const dialog = document.createElement("pc-dialog") as PcDialog;
  dialog.heading = translations.t("paintCanvas.layers.deleteConfirm", {
    name: "Sketch",
  });
  dialog.choices = [
    {
      value: "delete",
      label: translations.t("paintCanvas.common.delete"),
      cancelling: true,
    },
    { value: "cancel", label: translations.t("paintCanvas.common.cancel") },
  ];
  dialog.addEventListener("pc-choose", () => dialog.remove());
  document.body.append(dialog);
});

const menu = find<PcContextMenu>("#menu");
let alphaLock = false;
/** Menu items, with the alpha lock toggle showing its state */
const menuItems = () => [
  { value: "duplicate", label: "Duplicate", shortcut: { key: "j", cmd: true } },
  { value: "merge", label: "Merge down…", disabled: true },
  { value: "alpha-lock", label: "Alpha lock", checked: alphaLock },
  {
    value: "brush",
    label: "Select the brush tool",
    icon: "brush",
    shortcut: { key: "b" },
  },
  {
    value: "fill",
    label: "Fill the layer with the background colour",
    shortcut: { key: "backspace", alt: true },
  },
  { value: "delete", label: "Delete", danger: true },
];
menu.items = menuItems();
menu.addEventListener("pc-select", (event) => {
  if ((event as CustomEvent<{ value: string }>).detail.value !== "alpha-lock")
    return;
  alphaLock = !alphaLock;
  menu.items = menuItems();
});
find("#menu-button").addEventListener("click", (event) => {
  const { left, bottom } = (
    event.currentTarget as HTMLElement
  ).getBoundingClientRect();
  Object.assign(menu, { x: left, y: bottom + 4, open: true });
});
menu.addEventListener("pc-close", () => (menu.open = false));
