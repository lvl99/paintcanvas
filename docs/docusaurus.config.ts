import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import packageJson from "../package.json" with { type: "json" };

// PaintCanvas documentation: hand-written guides in `docs/`, and API pages that TypeDoc generates from the source's
// comments into `docs/api/` each time the site starts or builds
const config: Config = {
  title: "PaintCanvas",
  tagline: "Open-source painting engine and renderer for the browser",
  // Published on GitHub Pages (see scripts/deploy-pages.ts)
  url: "https://lvl99.github.io",
  baseUrl: "/paintcanvas/",
  onBrokenLinks: "throw",
  i18n: { defaultLocale: "en", locales: ["en"] },
  // `.md` files are plain Markdown (not MDX), so element names like <paint-canvas> are just text
  markdown: { format: "detect" },
  plugins: [
    [
      "docusaurus-plugin-typedoc",
      {
        // The same modules the package exports (see `exports` in package.json)
        entryPoints: [
          "../src/index.ts",
          "../src/{lib,ui}/**/index.ts",
          "../src/testing/*.ts",
        ],
        exclude: ["**/tests/**"],
        tsconfig: "../tsconfig.build.json",
        out: "docs/api",
        name: "API",
        readme: "none",
        excludePrivate: true,
        excludeInternal: true,
        // Link each API page to its source on GitHub, at the tag of the version being documented
        sourceLinkTemplate: `https://github.com/lvl99/paintcanvas/blob/v${packageJson.version}/{path}#L{line}`,
        sidebar: { pretty: true },
      },
    ],
  ],
  presets: [
    [
      "classic",
      {
        docs: { routeBasePath: "/", sidebarPath: "./sidebars.ts" },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: "PaintCanvas",
      items: [
        { type: "doc", docId: "intro", label: "Guides", position: "left" },
        { to: "/api", label: "API", position: "left" },
        // The demos are built beside the docs (see scripts/build-pages.ts), outside Docusaurus's routes
        { to: "pathname:///app/", label: "Try it", position: "left" },
        {
          href: "https://github.com/lvl99/paintcanvas",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
  } satisfies Preset.ThemeConfig,
};

export default config;
