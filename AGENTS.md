# Agent guidance for this blog

This file steers agents that write or edit content for Duang's blog.

## What this blog is

Personal notes on Agent project breakdowns, full-stack learning, ideas, and occasional daily notes.

Do not pitch hosting or framework brand names in reader-facing copy unless the article is specifically about that.

## Writing voice

Professional. Engineer notebook. Not AI.

Write like a long WeChat tech article by a working engineer: narrative, concrete, a bit dry, willing to spend paragraphs on how something actually runs.

### Hard bans

- Do not use Chinese corner quotes: 「」
- Do not use arrow characters or arrow-like connectors in prose: → ← ⇒ ➜, or chains like A → B → C
- Do not lean on Mermaid or ASCII flowcharts unless the user explicitly asks for a diagram
- Do not open with era throat-clearing (在当今… / 随着 AI…)
- Do not stack buzzwords: 赋能、闭环生态、一站式、降维打击、完美、颠覆
- Do not write symmetrical slogan triplets that sound generated
- Do not pad with outline-restating summaries
- Do not say you are an AI or that the post was generated

### Prefer

- Plain sentences. If you need to quote a term, use English backticks or just bold once.
- Detailed walkthrough: what process starts, who claims work, what happens on crash, where policy sits.
- Real resource names, YAML snippets, failure modes.
- First person when it is your judgment.
- Longer sections that stay with one subsystem until it is clear.

### Breakdown posts

Go deep. Typical order:

1. Why this project exists (pain after demos)
2. How you declare work (resources / manifests)
3. How a run actually proceeds (daemon, worker, lease, retries)
4. Tools, memory, governance in runtime
5. Observability
6. What I would copy; what I would not bet on yet

End without a corporate-sounding checklist if the body already made the points. A short closing paragraph is enough.

## Files

- Posts: `src/content/posts/*.md`
- About: `src/content/pages/about.md`
- Site meta: `astro-paper.config.ts`

Frontmatter: `title`, `description`, `pubDatetime`, `tags`. Use `featured: true` sparingly.
