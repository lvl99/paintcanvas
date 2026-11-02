// A full-page PaintCanvas with a layers panel on the right, an app menu with input settings, and a theme switch.
import "../src/ui";
import { translations } from "../src/lib/i18n";
import type { PaintCanvasElement } from "../src/ui/elements/PaintCanvas";
import type { PcLayersMenu } from "../src/ui/elements/PcLayersMenu";
import type { PcInputSettings } from "../src/ui/elements/PcInputSettings";
import type { PcCanvasMap } from "../src/ui/elements/PcCanvasMap";

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
find<HTMLInputElement>("#dark").addEventListener("change", (event) => {
  document.documentElement.dataset.pcTheme = (event.target as HTMLInputElement)
    .checked
    ? "dark"
    : "light";
});
