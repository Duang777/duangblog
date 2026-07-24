# Agent guidance for this blog

This file steers agents that write or edit content for Duang's blog.

## What this blog is

Personal notes on Agent project breakdowns, full-stack learning, ideas, occasional daily notes, and the **后端专栏** (with sub-columns such as 请求过境).

Do not pitch hosting or framework brand names in reader-facing copy unless the article is specifically about that.

## Writing voice

Professional. Engineer notebook. Not AI.

Write like a long WeChat tech article by a working engineer: narrative, concrete, a bit dry, willing to spend paragraphs on how something actually runs.

### De-AI skill (required for reader-facing prose)

Before publishing or rewriting posts, apply the local skill:

- Path: `~/.cursor/skills/humanizer/SKILL.md`
- Upstream: [blader/humanizer](https://github.com/blader/humanizer) (Wikipedia "Signs of AI writing")

Use it in **file / embedded mode**: rewrite the prose in place, keep frontmatter, code fences, paths, and links intact. After the rewrite, still obey the hard bans below (Chinese-specific tells that humanizer does not cover).

Humanizer checklist that matters most for this blog:

- No em dashes / en dashes used as AI punctuation
- No significance padding (pivotal / landscape / testament / underscores)
- No rule-of-three slogan stacks
- No bold header bullet catalogs
- No chatbot closers ("I hope this helps", "let me know")
- Prefer `是 / 有 / 会` over ornate substitutes
- Keep uneven rhythm and first-person judgment; do not invent facts to sound human

### Hard bans

- Do not use Chinese corner quotes: 「」
- Do not use arrow characters or arrow-like connectors in **prose**: → ← ⇒ ➜, or chains like A → B → C (Mermaid / code diagrams are fine)
- Do not open with era throat-clearing (在当今… / 随着 AI…)
- Do not stack buzzwords: 赋能、闭环生态、一站式、降维打击、完美、颠覆
- Do not write symmetrical slogan triplets that sound generated
- Do not pad with outline-restating summaries
- Do not say you are an AI or that the post was generated
- Do not dump decorative diagrams or huge unrelated file dumps

### Prefer

- Plain sentences. If you need to quote a term, use English backticks or just bold once.
- Detailed walkthrough: what process starts, who claims work, what happens on crash, where policy sits.
- Real resource names, package names, file paths, YAML/JSON snippets, failure modes.
- First person when it is your judgment.
- Longer sections that stay with one subsystem until it is clear.

### Diagrams and core code (required when they clarify)

When a post talks about process topology, request paths, agent loops, graph routing, claim/lease, dual buses, storage/cache/queue internals, or UI↔API live updates:

- **Draw it**: use Mermaid (`flowchart` / `sequenceDiagram` / `stateDiagram`) for the topology or call path. One diagram per idea. Label real component names.
- **Show core code**: paste short excerpts from a real repo or minimal repro (trimmed with `// ...`), citing path or version. Prefer the loop / SQL / handler / config that proves the claim. Do not paste entire files.
- Prose still carries the explanation; diagrams and snippets are evidence, not decoration.

## Backend: 后端专栏 (parent) and sub-columns

**Parent column tag:** `后端专栏`  
Every post under the backend mega-column must carry this tag. Hub post: `src/content/posts/backend-column.md`.

**Sub-column tags** (narrow series inside 后端专栏; never promote these to the parent name):

| Tag | Angle | Hub / first post |
|-----|--------|------------------|
| `请求过境` | Follow one request from listen/accept through handler, I/O, and timeouts | `src/content/posts/request-crossing.md` |

Do **not** use a lone vague tag like `专栏`. Do **not** label 请求过境 as "the backend column".

**Skills (required for 后端专栏 prose):**

1. `source-driven-development` when naming library/API behavior: fetch official docs for the version you cite
2. Draft under this file (voice, diagrams, core code, depth)
3. **`humanizer` before publish** (`~/.cursor/skills/humanizer/SKILL.md`) in file mode; Chinese hard bans still apply after it
4. Topic add-ons: `api-and-interface-design`, `observability-and-instrumentation`, `performance-optimization`, `security-and-hardening`, `doubt-driven-development`

**Depth bar:** a 后端专栏 post is not a catalog or "开张导读" with eight bullet topics. Stay with one mechanism long enough that a reader could debug it. Prefer one Mermaid + real code over a roadmap list.

**Per-article shape (请求过境 and similar):**

1. What I kept getting wrong, or what symptom showed up
2. Where this sits on the request path (one diagram)
3. How it runs (mechanics + short official-docs-backed code)
4. Failure modes and what I check first
5. Short close; no "欢迎留言告诉我缺哪块"

Titles name the object (`ReadHeaderTimeout 和 ReadTimeout 别混`, `连接池为什么会抖`). Parent/sub membership is tags, not H1 slogans.

## Breakdown posts (Agent / open-source projects)

Go deep. A breakdown is not a README paraphrase.

### Required: Agent tech + full-stack dissection

For project breakdowns, cover **Agent technology, backend, and frontend**. Do not stop at product slogans or a README paraphrase.

**Agent technology** (required when the project is agent-related):

- How a single agent turn runs: prompt/history, model call, tool-select loop, step/timeout limits, completion condition
- How multi-agent topology is declared and routed (graph edges, conditions, fan-out/fan-in, delegation/review if present)
- Tool model: candidate tools vs model-selected calls, auth, isolation, retries, approval gates
- Model routing: endpoint resources, secrets, fallbacks, provider differences
- Memory: task-scoped vs durable, what ops the agent can call
- Governance in the call path: policy / role / permission evaluation order, fail-open vs fail-closed
- Message or handoff lifecycle: phases, ownership, idempotency, dead letter
- Execution modes (in-process vs distributed) and what stays the same across modes

**Backend** (as applicable):

- Language, module path, key libraries
- Binaries / entrypoints and what each process owns
- API shape (REST / gRPC / OpenAPI location)
- Persistence (memory vs Postgres, claim/lease SQL patterns)
- Controllers / reconciliation loops
- Runtime wiring to the agent loop above (workers, message bus, retries)
- Auth, secrets, telemetry (Prometheus / OTel) if present
- Deploy path (compose, charts, operator) only as far as it clarifies the runtime

**Frontend** (as applicable):

- Framework, bundler, package manager, major deps
- Routing, server state vs local state
- How the UI talks to the API (fetch, auth headers, watch/SSE)
- Main screens tied to real resources (tasks, approvals, graphs, YAML editors)
- How the UI is built and served (embedded in binary vs separate host)
- Styling approach

**Evidence bar:** name real paths (`cmd/orlojd`, `runtime/agent_worker.go`, `frontend/src/api/client.ts`, etc.), versions when known, and behaviors you verified in code or official docs. If something is unclear, say so; do not invent.

### Typical narrative order

1. Why this project exists (pain after demos)
2. Process topology (daemon / worker / CLI / UI)
3. Agent technology: single-agent loop, multi-agent graph, tools, memory, governance, handoffs
4. Backend: store, controllers, schedule, claim/lease, how runtime is hosted
5. Frontend: stack, pages, live updates, embed
6. Resources / manifests that bind Agent + FE + BE
7. Observability
8. What I would copy; what I would not bet on yet

End without a corporate-sounding checklist if the body already made the points. A short closing paragraph is enough.

## Files

- Posts: `src/content/posts/*.md`
- 后端专栏 hub: `src/content/posts/backend-column.md`
- 请求过境 (sub-column): `src/content/posts/request-crossing.md`
- About: `src/content/pages/about.md`
- Site meta: `astro-paper.config.ts`

Frontmatter: `title`, `description`, `pubDatetime`, `tags`. Use `featured: true` sparingly.  
Backend mega-column posts: tag `后端专栏`. Sub-column posts add their own tag (e.g. `请求过境`).
