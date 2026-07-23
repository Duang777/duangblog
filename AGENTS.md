# Agent guidance for this blog

This file steers agents that write or edit content for Duang's blog.

## What this blog is

Personal notes on:

- Agent / multi-agent project breakdowns
- Full-stack learning and practice
- Ideas
- Occasional daily notes

Do **not** pitch the stack (hosting, framework names) in reader-facing copy unless the article is specifically about that.

## Writing voice

**Professional. Not AI.**

Write like a working engineer taking notes for peers — clear, concrete, slightly dry. Prefer judgment over hype.

### Do

- Short paragraphs. One idea per paragraph when possible.
- Specific nouns: resource names, failure modes, tradeoffs.
- Say what you agree with, what you doubt, and why.
- Use "我" when it is actually your view; do not fake a corporate "we".
- Keep diagrams sparse and labeled in plain Chinese or English.
- End breakdown posts with: 做得好的点 / 我有保留的点 / 可复用清单.

### Don't

- Don't open with "在当今 AI 飞速发展的时代…" or similar throat-clearing.
- Don't stack buzzwords: "赋能", "闭环生态", "一站式解决方案", "降维打击".
- Don't write symmetrical three-part slogans that sound generated.
- Don't hedge every sentence ("或许", "从某种意义上"). Take a position, then qualify once if needed.
- Don't praise a project as "完美" / "颠覆性". Prefer "解决了 X，代价是 Y".
- Don't pad with summary paragraphs that restate the outline.
- Don't mention that you are an AI, or that the post was generated.

### Tone examples

Bad:

> Orloj 是一个强大且灵活的多智能体编排平台，能够帮助开发者轻松构建生产级 Agent 系统。

Good:

> Orloj 把 Agent 当基础设施管：声明资源、调度执行、权限失败即拒绝。它不是又一个 chat demo 脚手架。

## Breakdown post shape

When dissecting an Agent project, follow this order:

1. It solves what (for whom, success looks like what)
2. Main execution path (entry → schedule/claim → execute → govern → observe)
3. How tools / memory / policy are wired
4. What is worth copying; what I would not copy yet
5. A short reusable checklist

Include at least one Mermaid diagram when the topology matters. Keep node labels short; avoid stuffing `/` and HTML into labels without quotes.

## Files

- Posts: `src/content/posts/*.md`
- About: `src/content/pages/about.md`
- Site meta: `astro-paper.config.ts`

Frontmatter must include `title`, `description`, `pubDatetime`, `tags`. Use `featured: true` sparingly.
