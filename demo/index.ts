// A full-page PaintCanvas with the layout's layers pane on the right, an app menu with input settings, keyboard shortcuts and
// settings import/export, a theme picker and a "New drawing" button. The drawing, the app settings (including the
// theme and language) and the user's brush presets and profile graphs are kept in the browser (`store="demo"`,
// `settings-store="demo"`), so they survive reloading the page.
// The demo's own text is translated like an app's would be: its locales are added after PaintCanvas's, with `demo.` keys.
import "../src/ui";
import { translations } from "../src/lib/i18n";
import type { PaintCanvasElement } from "../src/ui/elements/PaintCanvas";
import type { PcInputSettings } from "../src/ui/elements/PcInputSettings";
import type { PcAppSettings } from "../src/ui/elements/PcAppSettings";
import type { PcThemePicker } from "../src/ui/elements/PcThemePicker";
import type { PcCanvasMap } from "../src/ui/elements/PcCanvasMap";
import type { PcDialog } from "../src/ui/elements/PcDialog";
import type { PcToast } from "../src/ui/elements/PcToast";

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
  find("#new-drawing").textContent = translations.t("demo.newDrawing");
};
showText();
translations.addEventListener("change", showText);

const layout = find<PaintCanvasElement>("paint-canvas");
await layout.updateComplete;
const app = layout.app as NonNullable<PaintCanvasElement["app"]>;
find<PcCanvasMap>("#map").app = app;
find<PcInputSettings>("#settings").settings = app.input;
find<PcAppSettings>("#app-settings").app = app;
// The theme and language are kept with the app settings, so they're restored on reload too
find<PcThemePicker>("pc-theme-picker").settings = app.ui;
find<PcInputSettings>("#settings").ui = app.ui;

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
