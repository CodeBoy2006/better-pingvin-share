import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "Better Pingvin Share",
  tagline:
    "Better Pingvin Share is self-hosted file sharing platform and an alternative for WeTransfer.",
  favicon: "img/pingvinshare.svg",

  url: "https://stonith404.github.io",
  baseUrl: "/pingvin-share/",
  organizationName: "stonith404",
  projectName: "pingvin-share",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/CodeBoy2006/better-pingvin-share/edit/main/docs",
        },
        blog: false,
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/pingvinshare.svg",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Better Pingvin Share",
      logo: {
        alt: "Better Pingvin Share Logo",
        src: "img/pingvinshare.svg",
      },
      items: [
        {
          href: "https://github.com/CodeBoy2006/better-pingvin-share",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
