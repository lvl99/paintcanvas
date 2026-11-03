---
sidebar_position: 6
---

# Translations

The UI's text comes from `translations` (`@lvl99dotcom/paintcanvas/lib/i18n`). Built-in locales: `en-US` (fallback), `en-GB`, `fr`, `ja`, `ko`, `zh-Hans` and `zh-Hant`. Locale files load when first used, and the UI switches language without reloading.

```ts
import { translations } from "@lvl99dotcom/paintcanvas/lib/i18n";

await translations.useDeviceLocale(); // the best match for the device's languages
await translations.setLocale("ja");
translations.t("paintCanvas.presets.deleted", { name: "Sketch" }); // 'Deleted "Sketch"'
```

Strings missing from a locale come from `en-US`, then the key itself. The locale files are in `locales/` (exported as `@lvl99dotcom/paintcanvas/locales/*`).

## Keys

Keys are prefixed by the project they belong to. PaintCanvas's start with `paintCanvas.` (e.g. `paintCanvas.tool.brush`). Give your app's keys its own prefix (e.g. `liveCanvas.`), so they don't clash with PaintCanvas's or another library's.

## Your app's translations

Add your app's locales to the same `translations`, so one language choice changes PaintCanvas's text and yours. Each locale loads when first used, together with PaintCanvas's strings for it.

```ts
import { translations } from "@lvl99dotcom/paintcanvas/lib/i18n";

await translations.addLocales({
  "en-US": () => import("./locales/en-US.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"), // a locale PaintCanvas doesn't have
});
await translations.useDeviceLocale();

translations.t("liveCanvas.share"); // your app's text
translations.addEventListener("change", () => {
  // show your app's text in the new language
});
```

- A locale only your app has becomes available too (e.g. in `<pc-input-settings>`'s language picker). PaintCanvas's text in it comes from `en-US`.
- Language pickers name each locale in its own language with `languageName` (using `Intl.DisplayNames`), e.g. `languageName("fr")` is "Français".

## Changing PaintCanvas's text

A locale's strings are merged in the order they were added: PaintCanvas's first, then each `addLocales` and `addStrings` in turn. A key added later replaces the same key added earlier, so your app can change PaintCanvas's wording by including its keys:

```json
{
  "liveCanvas.share": "Share",
  "paintCanvas.tool.brush": "Paintbrush"
}
```

Or add a few strings straight away, without a file:

```ts
translations.addStrings("en-US", { "paintCanvas.tool.brush": "Paintbrush" });
```

## Elements with their own translations

Every element uses the shared `translations` unless given others, e.g. to show two languages on one page:

```ts
import Translations from "@lvl99dotcom/paintcanvas/lib/i18n";

const japanese = new Translations();
await japanese.setLocale("ja");
document.querySelector("pc-toolbar").translations = japanese;
```
