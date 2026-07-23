import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import mermaid from "astro-mermaid";
import { unified } from "@astrojs/markdown-remark";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import rehypeCallouts from "rehype-callouts";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";

export default defineConfig({
  site: config.site.url,
  integrations: [
    // Must come before other markdown-processing integrations
    mermaid({
      theme: "neutral",
      autoTheme: true,
      enableLog: false,
    }),
    mdx(),
    sitemap({
      filter: page =>
        config.features?.showArchives !== false || !page.endsWith("/archives/"),
    }),
  ],
  i18n: {
    locales: ["en", "zh-CN"],
    defaultLocale: "zh-CN",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
      ],
      rehypePlugins: [rehypeCallouts],
    }),
    syntaxHighlight: {
      type: "shiki",
      excludeLangs: ["mermaid"],
    },
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      // Local fallback: Google Fonts often times out in restricted networks.
      name: "IBM Plex Mono",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.local(),
      fallbacks: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      options: {
        variants: [
          {
            weight: 300,
            style: "normal",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-300-normal.woff2",
            ],
          },
          {
            weight: 300,
            style: "italic",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-300-italic.woff2",
            ],
          },
          {
            weight: 400,
            style: "normal",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
            ],
          },
          {
            weight: 400,
            style: "italic",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-italic.woff2",
            ],
          },
          {
            weight: 500,
            style: "normal",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
            ],
          },
          {
            weight: 500,
            style: "italic",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-italic.woff2",
            ],
          },
          {
            weight: 600,
            style: "normal",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2",
            ],
          },
          {
            weight: 600,
            style: "italic",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-italic.woff2",
            ],
          },
          {
            weight: 700,
            style: "normal",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2",
            ],
          },
          {
            weight: 700,
            style: "italic",
            src: [
              "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-italic.woff2",
            ],
          },
        ],
      },
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
