// A full-page PaintCanvas with a layers panel on the right, an app menu with input settings, a theme picker and a
// "New drawing" button. The drawing is kept in the browser (`store="demo"`), so it survives reloading the page.
import "../src/ui";
import { translations } from "../src/lib/i18n";
import type { PaintCanvasElement } from "../src/ui/elements/PaintCanvas";
import type { PcLayersMenu } from "../src/ui/elements/PcLayersMenu";
import type { PcInputSettings } from "../src/ui/elements/PcInputSettings";
import type { PcCanvasMap } from "../src/ui/elements/PcCanvasMap";
import type { PcDialog } from "../src/ui/elements/PcDialog";
import type { PcToast } from "../src/ui/elements/PcToast";

/** An element on the page (the page always has it) */
const find = <T extends Element = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector) as T;

await translations.useDeviceLocale();
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
  dialog.heading = "New drawing";
  dialog.message = "Start a new drawing? This drawing will be deleted.";
  dialog.choices = [
    { value: "new", label: "New drawing", cancelling: true },
    { value: "cancel", label: "Cancel" },
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
