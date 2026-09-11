import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "codoc",
  tagline: "Synchronisation de documentation Confluence ↔ code",
  favicon: "img/favicon.svg",

  future: {
    v4: true,
  },

  url: "https://klee-contrib.github.io",
  baseUrl: "codoc/",

  organizationName: "klee-contrib",
  projectName: "codoc",

  onBrokenLinks: "warn",
  onBrokenAnchors: "warn",

  plugins: [
    [
      "@cmfcmf/docusaurus-search-local",
      {
        language: ["fr"],
        indexBlog: false,
      },
    ],
  ],

  i18n: {
    defaultLocale: "fr",
    locales: ["fr"],
  },

  markdown: {
    mermaid: true,
    format: "detect",
    hooks: {
      onBrokenMarkdownImages: "warn",
    },
  },
  themes: ["@docusaurus/theme-mermaid"],

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
          editUrl: "https://github.com/klee-contrib/codoc/edit/main/docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "codoc",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          type: "html",
          value:
            '<a href="https://github.com/klee-contrib/codoc" target="_blank" rel="noopener noreferrer" class="navbar__item navbar__link header-github-link" aria-label="GitHub repository"></a>',
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            { label: "Présentation", to: "/" },
            { label: "Commandes", to: "/commandes" },
            { label: "Configuration", to: "/configuration" },
          ],
        },
        {
          title: "Dépôt",
          items: [
            { label: "GitHub", href: "https://github.com/klee-contrib/codoc" },
            { label: "npm", href: "https://www.npmjs.com/package/codoc-cli" },
            { label: "Issues", href: "https://github.com/klee-contrib/codoc/issues" },
          ],
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "yaml"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
