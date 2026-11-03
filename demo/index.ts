// A full-page PaintCanvas with a layers panel on the right, an app menu with input settings, a theme picker and a
// "New drawing" button. The drawing is kept in the browser (`store="demo"`), so it survives reloading the page.
// The demo's own text is translated like an app's would be: its locales are added after PaintCanvas's, with `demo.` keys.
import "../src/ui";
import { translations } from "../src/lib/i18n";
import type { PaintCanvasElement } from "../src/ui/elements/PaintCanvas";
import type { PcLayersMenu } from "../src/ui/elements/PcLayersMenu";
import type { PcInputSettings } from "../src/ui/elements/PcInputSettings";
import type { PcCanvasMap } from "../src/ui/elements/PcCanvasMap";
import type { PcDialog } from "../src/ui/elements/PcDialog";
import type { PcToast } from "../src/ui/elements/PcToast";
import type { PcPanel } from "../src/ui/elements/PcPanel";

/** An element on the page (the page always has it) */
const find = <T extends Element = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector) as T;

await translations.addLocales({
  "en-US": () => import("./locales/en-US.json"),
  "en-GB": () => import("./locales/en-GB.json"),
  fr: () => import("./locales/fr.json"),
  ja: () => import("./locales/ja.json"),
  ko: () => import("./locales/ko.json"),
  "zh-Hans": () => import("./locales/zh-Hans.json"),
  "zh-Hant": () => import("./locales/zh-Hant.json"),
});
await translations.useDeviceLocale();

/** Show the page's own text in the chosen language */
const showText = () => {
  find<PcPanel>("#layers-panel").label = translations.t(
    "paintCanvas.toolbar.layers",
  );
  find("#new-drawing").textContent = translations.t("demo.newDrawing");
  // The note shown on narrow layouts, and the template it's created from
  const narrowTemplate = find<HTMLTemplateElement>("pc-match > template");
  for (const root of [document, narrowTemplate.content])
    for (const note of root.querySelectorAll(".narrow-note"))
      note.textContent = translations.t("demo.narrowLayout");
};
showText();
translations.addEventListener("change", showText);

const layout = find<PaintCanvasElement>("paint-canvas");
await layout.updateComplete;
const app = layout.app as NonNullable<PaintCanvasElement["app"]>;
find<PcLayersMenu>("#layers").app = app;
find<PcCanvasMap>("#map").app = app;
find<PcInputSettings>("#settings").settings = app.input;

// Start again with one empty layer, after asking (the saved drawing is replaced)
find("#new-drawing").addEventListener("click", () => {
  app.closePanel();
  const dialog = document.createElement("pc-dialog") as PcDialog;
  dialog.heading = translations.t("demo.newDrawing");
  dialog.message = translations.t("demo.newDrawingMessage");
  dialog.choices = [
    {
      value: "new",
      label: translations.t("demo.newDrawing"),
      cancelling: true,
    },
    { value: "cancel", label: translations.t("paintCanvas.common.cancel") },
  ];
  dialog.addEventListener("pc-choose", (event) => {
    dialog.remove();
    if ((event as CustomEvent<{ value: string }>).detail.value === "new")
      app.layers.replace([{ name: "Layer 1" }]);
  });
  document.body.append(dialog);
});

// Show the messages the layout and its elements send (e.g. when the drawing can't be saved)
layout.addEventListener("pc-toast", (event) => {
  const { message, kind } = (
    event as CustomEvent<{ message: string; kind?: PcToast["kind"] }>
  ).detail;
  const toast = document.createElement("pc-toast") as PcToast;
  toast.message = message;
  toast.kind = kind ?? "info";
  toast.addEventListener("pc-dismiss", () => toast.remove());
  find("#toasts").append(toast);
});
