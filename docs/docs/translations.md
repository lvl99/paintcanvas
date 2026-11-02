---
sidebar_position: 6
---

# Translations

The UI's text comes from `translations` (`paintcanvas/lib/i18n`). Built-in locales: `en-US` (fallback), `en-GB`, `ja`, `ko`, `zh-Hans` and `zh-Hant`. Locale files load when first used, and the UI switches language without reloading.

```ts
import { translations } from "paintcanvas/lib/i18n";

await translations.useDeviceLocale(); // the best match for the device's languages
await translations.setLocale("ja");
translations.addStrings("en-US", { "layout.tools": "Tools" }); // change or add text
translations.t("presets.deleted", { name: "Sketch" }); // 'Deleted "Sketch"'
```

Strings missing from a locale come from `en-US`. The locale files are in `locales/` (exported as `paintcanvas/locales/*`).
