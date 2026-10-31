import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import config from "@/config";

export const BLOG_PATH = "src/content/posts";

const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${BLOG_PATH}` }),
  schema: ({ image }) =>
    z.object({
      author: z.string().default(config.site.author),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      title: z.string(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      tags: z.array(z.string()).default(["others"]),
      ogImage: image().or(z.string()).optional(),
      description: z.string(),
      /** Content language. English twins use `name-en.md` and share the route slug. */
      lang: z.enum(["zh-CN", "en"]).default("zh-CN"),
      /** Short hand-written changelog, newest last. */
      revisions: z
        .array(z.object({ date: z.date(), note: z.string() }))
        .optional(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
  }),
});

const tracks = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/tracks" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      side: z.enum(["A", "B"]),
      no: z.number().int().positive(),
      releaseDate: z.date(),
      status: z.enum(["released", "demo", "sketch"]),
      description: z.string(),
      /** Path under public/, e.g. "/music/night-drive.mp3". */
      audio: z.string().optional(),
      /** Qishui Music share link. Only linked out to; it has no embed. */
      qishui: z.url().optional(),
      cover: image().optional(),
      bpm: z.number().positive().default(96),
      /** Feeds the generative fallback when there is no audio file. */
      key: z.string().default("A minor"),
      duration: z
        .string()
        .regex(/^\d+:\d{2}$/)
        .optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().optional(),
    }),
});

export const collections = { posts, pages, tracks };
