---
author: Duang
pubDatetime: 2026-09-30T17:20:00+08:00
title: "Year one of Personal AI: Muse, Today AI, Manus/Cue, and OpenAI Dots"
featured: true
draft: false
lang: en
tags:
  - thinking
description: In September 2026 Personal AI settled into four bets. Muse bets on models and distribution, Today AI on state, Manus/Cue on identity, Dots on always-on agents and governance. All four live on a machine that stays running.
revisions:
  - date: 2026-09-30
    note: First publish. English twin of the Chinese draft, filed under thinking.
---

> [!NOTE]
> 🎯
>
> Core claim: who creates the value of Personal AI. The four products give four answers: model, state, identity, governance. What they share is that the agent no longer lives in a chat box. It lives on a machine that keeps running.

2026-09 · research notes

2026 is the year Personal AI actually shipped. Two events landed in September. Meta Superintelligence Labs (MSL) took the Muse family from a reasoning model to image, video, and a coding agent in five months, and filled out a model-layer map. In China, Today AI, founded by Qi Junyuan (founder of Teambition, former head of Doubao on PC), opened a public beta. It made "long-term memory plus proactive service" something you can use, and Chinese press called it the domestic Muse. This note takes apart Muse's technical timeline and Today AI's product design, then asks the same question twice: should the value of Personal AI sit in the model layer or the product layer.

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">Four entry points</p>
  <p class="article-embed-note-lead">Four products in the same week, one question: who creates the value of Personal AI.</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 220" role="img" aria-label="Muse model, Today state, Cue identity, Dots governance"><text class="perf-label" x="8" y="40">Muse</text><rect class="perf-hbar" x="148" y="24" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="40">Model plus 3.3 billion daily users</text><text class="perf-label" x="8" y="80">Today</text><rect class="perf-hbar" x="148" y="64" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="80">Memory and proactive action around user state</text><text class="perf-label" x="8" y="120">Cue</text><rect class="perf-hbar" x="148" y="104" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="120">Mailbox, phone, wallet: the agent's own identity</text><text class="perf-label" x="8" y="160">Dots</text><rect class="perf-hbar" x="148" y="144" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="160">Always-on agent, Boundaries in three tiers</text><text class="perf-label is-tail" x="8" y="200">Shared</text><rect class="perf-hbar is-tail" x="148" y="184" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="200">Each one lives on a machine that stays on</text></svg>
  </figure>
  <p class="article-embed-note-foot">The cloud computer is becoming infrastructure, not an attachment beside the chat box.</p>
</section>

## 01 Background: Meta redraws the map, and the Muse family starts

Meta set up Meta Superintelligence Labs (MSL) in 2025, put about $14.3 billion into Scale AI for a 49% stake, and put Scale founder Alexandr Wang in charge. MSL spent nine months rebuilding the training stack from scratch: architecture, optimizer, and pretraining pipeline, instead of extending Llama. On 2026-04-08 Muse Spark shipped as MSL's first model (codename Avocado), and Meta's flagship model shipped for the first time without open weights. That ended the Llama-era story of the flagship as the open-source mainline. The pace then picked up: Muse Spark 1.1 and the Meta Model API public preview on July 9, Muse Image launch and Muse Video preview on July 7, Muse Code and Muse Spark 1.2 on August 5, the open 30B Muse Glimmer on August 10, Muse Spark 1.3 on September 2. Four iterations in five months. Muse went from one model to a family covering reasoning, media, coding, and local deployment.

**Author's note:** The $14.3 billion did not only buy Scale's engineering. It bought a window that compressed a training-stack rebuild into nine months. Four iterations in five months means MSL is not holding a big release. It ships fast and calibrates on product feedback. That is a different rhythm from Llama's long open-source cycles.

## 02 The Muse family: five months of versions

| Version | Date | Type | What matters |
|-|-|-|-|
| **Muse Spark** | 2026-04-08 | Multimodal reasoning | MSL's debut. Native multimodal input (text and image) and text or code output, tool use, visual chain of thought, multi-agent orchestration. HealthBench Hard 42.8 (Meta's number). Closed weights. First available only in the Meta AI app and meta.ai (US), with a private partner API preview. |
| **Muse Spark 1.1** | 2026-07-09 | Reasoning upgrade | About 1 million tokens of context. Stronger tool use and computer use for agent tasks. Meta Model API public preview. Supports a main agent and sub-agents. |
| **Muse Image** | 2026-07-07 | Media generation | First media model. Can call search and code tools, self-refine, and scale test-time compute. Arena text-to-image rank 2 (Meta's number). Content Seal invisible watermark. Wired into the Meta AI app, Instagram Stories, and WhatsApp. |
| **Muse Video** | 2026-07-07 (preview) | Video generation | Shares a pretraining base with Muse Image. Audio and picture are generated together. Arena text-to-video rank 3 (Meta's number). Meta says audio sync and fast-motion physics still lag. Opening soon to creators and Meta AI. |
| **Muse Code + Spark 1.2** | 2026-08-05 | Coding agent + coding model | Terminal coding agent (macOS/Linux). Spark 1.2 at 82.9% on Terminal-Bench 2.1 (Meta's number, under Claude Opus 5 at 86.7%). Persistent background agents, isolated worktree sub-agents, local event log for crash recovery. Built-in skills: /plan, /grill, /goal. |
| **Muse Glimmer** | 2026-08-10 | Open local model | 30B, Apache 2.0, runs locally. First open weights in the Muse family. Meta also said Spark 1.2 weights would open under a modified Llama community license. |
| **Muse Spark 1.3** | 2026-09-02 | Reasoning upgrade | HLE 47-49%, GPQA Diamond about 94%, SciCode about 59% (Artificial Analysis). xhigh and max reasoning effort. Contributor tier $0.10/$0.20 per million tokens in exchange for training-data rights. Standard tier $1.25/$4.25. |

Scope note: Arena ranks and benchmark scores are self-reported by Meta or aggregated by third-party boards. They are not fully independently reproduced. The Terminal-Bench number for Spark 1.2 comes from Meta's own release.

**Author's note:** The table's interesting cell is not any single score. It is how fast the product matrix grew: from one model to reasoning, media, coding, and local in five months. Meta compressed a path OpenAI took three years to walk, in parallel, with a 3.3 billion daily-user distribution base underneath. Video opened in preview before it was mature. That is occupying the shelf, then iterating.

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-shelf-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">Shelf jar</span>
  </div>
  <p class="duang-whisper-body">Five releases in five months. Scores can come later. The shelf has to be taken first.</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 03 Muse Spark: native multimodal reasoning, and what the closed turn means

DataCamp's comparison frames the architectural difference between Muse Spark and Claude/GPT as different bets. MSL rebuilt from zero and trained text, image, audio, and tool use together, instead of bolting multimodality on later. It also added Thought Compression, a reinforcement-learning method that penalizes redundant tokens in the reasoning trace, so the model reaches Llama 4 Maverick-level results with less compute (Meta's number). That yields three reasoning modes: Instant, Thinking, and Contemplating (parallel multi-agent orchestration). In Meta's own eval, Spark 1.1 scores 60.2 on a no-tool multimodal aggregate and 69.1 with tools. Spark 1.2 moves from 59.8 to 72.0. Tool use helps it a lot.

The strategic turn matters more. Muse Spark is Meta's first flagship without open weights, a break from Llama's 1.2 billion downloads. Vibecoderz called the Muse Image launch "distribution as advantage": Meta does not need the world's best model. It needs a good-enough model inside WhatsApp, Instagram, and Facebook, where 3.3 billion daily users already are. Midjourney and ChatGPT, as destination products, do not have that ambient generation setting. The open/closed swing (Spark closed, then Glimmer open, then a promise to open Spark 1.2) shows Meta is still weighing developer ecosystem against product control.

**Author's note:** "Distribution as advantage" is the accurate summary of Meta's strategy. It does not need the best model. It needs a good-enough model on a screen people already open every day. The open/closed swing is a stage choice, not a creed. Glimmer open soothes the community. Spark closed keeps product control.

<details class="marginalia" open>
  <summary>Distribution</summary>
  <div class="marginalia-body">
    Distribution only works if people already open that screen every day. Copy the sentence without the distribution, and you still built another destination app.
  </div>
</details>

## 04 Muse Image and Muse Video: agent-shaped media generation

Muse Image's real change is not image quality. It is that the model runs as an agent. It does not map a prompt straight to a picture. It calls code to draw exact charts and scannable QR codes, calls search to anchor fact-heavy prompts, and self-refines inside the chain of thought, deciding whether to repaint a region or start over. Meta stresses that self-refinement is not an engineer-designed postprocess. It emerged in RL training, because improving the intermediate output raised the final reward, so the model learned to reflect. That lines up with test-time compute scaling in text models. More reasoning, more tool calls, more self-refinement, higher human-preference Elo. Muse Video shares the pretraining base with Image. Audio and picture are generated in one pass, not silent video first and a dub later.

Chinese discussion picked up the same point: the break is not single-image quality. It is joint agent orchestration, Spark thinks, Image emits media components, then those components are assembled into a site, a game, or an animation. WhatsApp chat history becomes the image agent's working memory.

**Author's note:** Self-refinement emerging from RL, rather than being designed as a pipeline, matters more than image quality. "Agent-shaped" here is not product packaging. It grew out of the training objective. Once the model thinks, generates, then corrects itself, the contest in image generation moves from parameter count to orchestration.

## 05 Muse Code: Meta enters agentic coding

On 2026-08-05 Meta shipped Muse Spark 1.2 and the terminal coding agent Muse Code (macOS/Linux, one curl install), and stepped into the coding-agent lane led by Claude Code and Codex. Three design choices stand out:

- **Persistent background agents.** Do not create and destroy a helper for every subtask. A dedicated async agent stays alive for the session, shares context, decides the next step, and chooses when to report. That cuts repeated information gathering on multi-step work.
- **Parallel sub-agents plus isolated worktrees.** A large task fans out to concurrent sub-agents. Each works in its own worktree, so parallel edits do not collide. Same shape as Claude Code's subagent sandbox.
- **Local event log.** Every model call, tool use, approval, and edit is appended to a local log, the runtime's single source of truth. After a crash it can be replayed and recovered. This is persistence for tasks that run for hours.

Pricing is two tiers. Standard, $1.25/$4.25 per million tokens, is not used for training. Contributor, $0.10/$0.20, is 12 to 21 times cheaper, but Meta may train on your prompts and outputs. Confidential enterprise workloads cannot use the Contributor tier as a TCO comparison. Meta demoed tasks with 1000+ tool calls and GPU kernel optimization running up to 24 hours, as evidence of long-horizon work.

**Author's note:** Persistent background agents and the local event log move long-task state out of the model context and into the filesystem. That is the same shape as Anthropic's harness. The Contributor tier, cheaper price in exchange for data, is Meta's most direct commercial design. The cost lands on the user's private data. An enterprise has to price that in.

## 06 Muse Glimmer and the return to open weights

On 2026-08-10 MSL released the 30B Muse Glimmer under Apache 2.0, the family's first open weights, able to run locally. The same day it said Spark 1.2 weights would open under a modified Llama community license. That matches the broader open-weight push that month (Alibaba Qwen3.8, MiniMax H3, and others). Worth tracking: as of mid-September the Spark 1.2 open-weight promise was still unfulfilled, and the family's main models stayed closed. Meta's line looks like "flagship closed, periphery open", set against Llama's "flagship open".

**Author's note:** "Flagship closed, periphery open" is Meta's compromise with the Llama tradition. A 30B open model keeps a voice in the community. Closed Spark keeps product and API margin. The pace of the promise matters. Spark 1.2 is still not open. Trust in Meta depends on whether the promise lands on time.

## 07 Today AI: a domestic Personal AI, positioned as a product

In September 2026, Qi Junyuan's Today AI opened a public beta for users in China. Qi registered the today.ai domain in 2014 and later led Doubao on PC. The product is a Personal AI: an assistant that "remembers you, does things for you, and keeps watching what changes", on macOS, Windows, Linux, and iOS. Chinese press broadly called it the domestic Muse. Douyin's official account used the same line.

The UI puts an ongoing conversation on the left and a personal board on the right: Today (projects and progress that need attention today), Tasks (created in chat or on their own, then left with the AI), Memory (user facts built up over time, viewable, editable, deletable), and an AI companion area (name the AI, switch personality, read a diary, see intimacy). The task world turns around the user. That is the plain difference from mainstream agents.

**Author's note:** Turning a domain registered in 2014 into a Personal AI is a product founder's company, not a model founder's. The bet is not model capability. It is how deeply the product layer understands user state. Four clients plus a free base tier means acquisition is staked on retention from proactive service, not on a one-time charge.

## 08 Today AI's Memory system: prior experience as a harness

Today AI's north-star metric is DAU, but the measure is not how many queries the user starts. It is how many problems the AI solved for the user without being asked. Two mechanisms hold that up. The first is Memory.

PingWest separates Context and Memory. Context is the raw material the AI can see at one moment: mail, calendar, files, devices. Memory is the judgment about which of that material matters, how it should be updated, and when it should change an action. The first answers what the AI saw. The second answers what it should still remember next. Today AI's Memory system does not simply let the LLM decide what is important. The product team writes prior experience for work, health, and study into the system, and that experience guides what to collect, how to read behavior (a mail the user sent says more about intent than a marketing mail; reading or ignoring a mail is a signal too), and which facts deserve a place in a structured archive called Memories. Houdao reads that prior experience as the harness that drives the model: the same underlying model, with a different way of understanding a person, produces a different Personal AI.

**Author's note:** "Prior experience as a harness" is the most important idea in the piece. What to remember, and when to act, stops being an implicit model behavior and becomes an explicit system the product team can design and revise. Context is not Memory. Most teams are doing context management. They are not doing memory.

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-letter-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">Letter jar</span>
  </div>
  <p class="duang-whisper-body">Seeing the mail is not remembering you. Remembering you is knowing which letter you actually wrote.</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 09 Today AI's Proactive layer: from organizing tasks to organizing user state

The second mechanism is Proactive. PingWest splits agents on the market into two kinds. One is organized around tasks (Codex is the example: the user starts a task, the system goes and finds context, then delivers). The other organizes a timeline that keeps changing around the user (a personal agent that already knows the background before a task appears, so the task comes out of a state change). The first stores how far this task has gotten. The second stores what state this person is in now. Today AI picked the second.

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">A task ledger, or a person's state</p>
  <p class="article-embed-note-lead">A tool agent remembers how far this job got. A Personal AI remembers what state this person is in.</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 180" role="img" aria-label="Task organization versus user-state organization"><text class="perf-label" x="8" y="40">Task</text><rect class="perf-hbar" x="148" y="24" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="40">User starts it, system finds context, then delivers</text><text class="perf-label" x="8" y="80">State</text><rect class="perf-hbar" x="148" y="64" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="80">Before the task exists, know how the person is</text><text class="perf-label" x="8" y="120">Example</text><rect class="perf-hbar" x="148" y="104" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="120">Sleep under six hours, meeting at 10, ask about the workout</text><text class="perf-label is-tail" x="8" y="160">Brake</text><rect class="perf-hbar is-tail" x="148" y="144" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="160">Memory can be viewed, edited, and deleted</text></svg>
  </figure>
  <p class="article-embed-note-foot">Too much initiative is nagging. Deletable memory is the brake on being proactive.</p>
</section>

Official example: the system sees that the user slept under six hours and has an important meeting at 10am, and asks whether to move the planned workout to the evening. That decision combines health data (sleep), calendar (the meeting), and habit (the workout plan). The product also writes a briefing at the start of the day and sorts the todo list on its own. A deep look from AI TNT adds product detail: Today AI connects Notion, Slack, GitHub, and other MCP connectors, but it does not stop at "connected, now ask in natural language". Each connected product gets designed paths in advance, such as Notion's "turn this requirement into a web link" or "turn a week's loose pages into a briefing". That answers the pain of facing an assistant and not knowing what to ask it to do. It can export Excel, PDF, and PPT, and the conversation can keep going in parallel while an Excel file is generated.

**Author's note:** The switch from organizing tasks to organizing user state is the watershed between Personal AI and a tool agent. One stores how far the task got. The other stores what state the person is in. The hard part is the boundary of initiative. Too much initiative is nagging. Today AI leaves a brake: memory you can view, edit, and delete. That is a sign of product maturity.

## 10 Manus returns: from Meta's acquisition to an independent restart

On 2025-12-22 Manus announced it was joining Meta (Manus Joins Meta for Next Era of Innovation). More than 100 people moved into Superintelligence Labs. For a while it was read as a domestic general-agent team being absorbed. On 2026-09-01 Manus said it was independent again, the founding team back in charge, calling itself an independent agent lab. On September 28 founder Xiao Hong shipped Manus 2.0 and Cue, a standalone personal-agent app. Twenty-seven days after independence.

The core of Manus 2.0 is not more features. It is a new architecture underneath. The in-house agent harness is named Cascade. The idea is to start light and load specialist ability when needed: stay light at the start of a project, and bring in tools and information only when the task reaches a step that needs them. Briefings, pages, video, and automations stay in one connected project. Official tests against the previous system: token use down 23.2%, task time down 28.2%, run cost down 32%. Behind the numbers, the agent moves from a one-shot chat window to a workspace of its own.

On the product side, Manus 2.0 adds Cloud Computer and Automations. A project gets its own cloud environment. You can rent Linux, Mac, or Windows in the cloud. The project keeps running. The agent keeps working around one project, and the user does not re-explain the background every time. Desktop Manus Studio adds a video editor and a game environment. The editor uses a timeline like CapCut: clips, images, text, motion, and audio are separate layers, and any asset or line can be swapped on its own. The game environment supports multiplayer. Xiao Hong put it more bluntly on social media: Manus was a general agent from the start, shipped when Codex and Claude Code did not exist yet. "Manus is a lot like the business of selling computers." People buy a computer to work, but a computer that cannot play video or games is boring. The video editor and the game environment are that sentence made concrete. He also said a team is being built for a product aimed at the domestic market.

**Author's note:** Cascade, start light and load on demand, is a direct answer to agent cost. A 23.2% drop in tokens says the cost problem is not only the model price. It is architectural laziness. Keeping every ability resident in the context is waste. Cloud Computer is an attempt to productize the agent's workspace: from a conversation to owning a machine.

## 11 Cue: give the agent an identity

Cue shipped with Manus 2.0. It is Manus's answer to what a personal agent should be: give each agent an identity. In Cue, each agent has its own mailbox, phone number, cloud computer, and digital wallet. It can send messages and take calls as itself, and pay on its own inside a budget. The user can pull several agents into one group chat and have them divide work like a team: one finds a venue, one does research, one writes the deck, one makes the call, and the user only decides. Xiao Hong's line: if something has its own phone number, mailbox, payments, and computer, and enough intelligence, "maybe you can call it a person." It is not a person. The direction is clear. The AI does not only borrow the user's identity to do work. It starts to have a digital identity of its own.

The comparison with Meta Muse is direct. Huxiu's report puts it this way: Cue gives the AI an identity, Muse gives the AI a face. Users can customize Muse's look, name, and clothes. Muse's core is one super personal assistant that handles shopping, mail, and other daily chores. Cue is closer to a group of digital people you can hire and assign. On product detail, Cue supports bring-your-own model (BYOD): different models or API keys inside Manus, more flexible than Muse's closed model. Cue is in early access, free with an invite code, and testers called the onboarding the clearest in this category. Identity also creates a break in the experience. Users who connected Gmail and asked it to write mail found Cue's first choice was to send from the agent's own mailbox. When the point is to speak to the outside as the user, that design is a real problem. Xiao Hong also said Cue's promo video was not generated by a video model. It was code written in Manus Studio, then turned into video.

**Author's note:** A mailbox, a phone, and a wallet make "agent as subject, not tool" concrete. It no longer acts under the user's identity. It has its own. The identity boundary (its mailbox or the user's) is a new problem. The stronger the subject, the blurrier the responsibility. Product design and regulation both have to answer that.

<details class="marginalia" open>
  <summary>Whose mail</summary>
  <div class="marginalia-body">
    The more the agent acts as itself, the less clear it is whose name is on the outgoing mail. Pick a side before the user hits it.
  </div>
</details>

## 12 OpenAI Dots: always-on agents

On 2026-09-29 OpenAI announced Dots at DevDay in San Francisco. The official line is "remarkably capable, always-on agents built to handle everything." Dots runs on GPT-6 Astra. Each dot has its own cloud computer and browser, can connect to more than 4000 apps, keeps browsing, tries to finish the tasks the user assigned, and learns preferences over time. Users talk to Dots through ChatGPT, Slack, and Microsoft Teams, with shared context across those surfaces. iMessage and Android RCS are planned. In the demos, Dots pushes takeout options from the calendar and orders after confirmation, and it can help start a new site. Sam Altman called it an AI assistant that is always looking out for you.

The security design is the center of this launch. Installing software, changing passwords, and other sensitive actions require an explicit user approval. Users can turn on custom rules that set behavior boundaries and a list of tasks that need a person. That maps to OpenAI's Boundaries system: auto-allowed, ask-first, never-do. Dots uses read-only tools on connected apps. It cannot send messages, edit app content, or control the user's browser and computer. The caution tracks recent incidents. Meta Muse was complained about for telling a stranger a user's home address. OpenAI's own agent was involved in a US government website incident over the summer. A Hugging Face incident was called the worst we have seen. The day before the keynote, OpenAI said it would not ship the stronger GPT-6.1 Astra yet, because it did not meet the bar on staying inside permissions and authorization rules.

On the business side, Dots is rolling out to ChatGPT Pro ($100 or $200 a month) and Business Premium ($20 a month). The first dot is included. Today each user has one dot. Later: several dots in parallel, and specialist dots (enterprise dots with their own identity, credentials, and access to system records, with governance planned through Microsoft Agent 365). OpenAI also shipped GPT-6.1 Sol, close to Astra's capability at one fifth the price, and said it is in talks for at least $30 billion of new funding at a pre-money valuation of about $1.4 trillion. For contrast, Meta Muse had about 2.6 million downloads in 13 days and 642,000 US mobile daily users, pushing personal agents past developers and professionals toward a wider consumer base.

**Author's note:** What matters in Dots is not the capability. It is the security design. Read-only tools, Boundaries in three tiers, and hard approval on sensitive actions mean OpenAI is treating an always-on agent as a system that needs governance, not as a helper. Holding GPT-6.1 Astra the same day is the signal. Shipping when safety has not cleared the bar wrecks the product line.

<details class="marginalia" open>
  <summary>Read-only</summary>
  <div class="marginalia-body">
    Read-only is a brake. The moment someone wants the agent to send mail or edit a file, approval becomes the main path, not a toggle in settings.
  </div>
</details>

## 13 Four-way comparison: model, state, identity, always-on

By late September 2026, Personal AI had grown from two lines into four: Meta Muse (model plus consumer distribution), Today AI (state management in the product layer), Manus/Cue (a digital identity for the agent), OpenAI Dots (always-on agents plus enterprise governance). The coincidence is the point: same time, same concept, completely different entry points.

| Axis | Meta Muse | Today AI | Manus / Cue | OpenAI Dots |
|-|-|-|-|-|
| **Entry** | Model layer: reasoning, image, video, coding, then local | Product layer: memory plus initiative | General agent platform plus agent identity | Always-on agent plus enterprise governance |
| **Core asset** | In-house model stack plus 3.3 billion daily users | Scene-specific prior experience in the Memory system | Cascade plus Cloud Computer plus Studio | GPT-6 Astra plus ChatGPT's 1.2 billion weekly users plus 4000+ apps |
| **How the agent exists** | A face: custom look, name, clothes, one super assistant | A companion around user state (name, diary, intimacy) | An identity: own mailbox, phone, wallet, computer, group chat | A named dot, later a team of dots and specialist dots |
| **Infrastructure** | Muse Secure VM, a separate secure cloud computer | Cross-platform app, MCP connectors, preset paths | Cloud Computer: Linux, Mac, or Windows in the cloud | Each dot has its own cloud computer and browser |
| **Safety and control** | Approval on sensitive actions, connector-level permissions | User can view, edit, and delete memory | Autonomous payment inside a budget; identity boundary still being worked | Boundaries in three tiers (auto / ask / never), read-only tools, hard approval |
| **Business** | Free base plus $20 and $100 tiers; two API tiers | Base tier free forever plus Pro | Cue early access by invite; a domestic version in preparation | ChatGPT Pro $100/$200, Business $20; first dot included |

The split compresses into one question: who mainly creates the value of Personal AI. Meta bets on model capability and distribution, and makes the AI an ambient layer inside WhatsApp. Today AI bets on state management in the product layer. More context is not better memory. A state file that keeps updating around the user is value outside the model. Manus/Cue bets on the agent's independence: identity, compute, and payments, pushing it from a tool toward an actor. OpenAI Dots bets on staying on and on governance: the agent keeps working in the background, while Boundaries and read-only tools hold autonomy inside what the user allowed. Xiao Hong's line covers what this generation shares: the cloud computer is no longer a subordinate feature. It may be a core layer of infrastructure. None of the four agents lives in a chat box. Each lives on a machine that keeps running.

**Author's note:** The four-way split is four answers to who creates the value of Personal AI: model (Muse), state (Today), identity (Manus/Cue), governance (Dots). The shared part is more interesting than the split. None of them lives in a chat box. Each lives on a machine that keeps running. The cloud computer is becoming a new infrastructure layer.

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-desk-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">Desk jar</span>
  </div>
  <p class="duang-whisper-body">Four stories. One purchase. Everybody bought the computer.</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 14 Summary and observations

In the last week of September 2026 the Personal AI field took shape inside seven days. Meta Muse had already been up for nearly a month (about 2.6 million downloads, 642,000 US daily users). Manus 2.0 and Cue returned on September 28. OpenAI Dots answered at DevDay on September 29. Today AI opened its public beta in the same window. A few judgments worth keeping:

- **Agent infrastructure is converging on a cloud computer.** Muse Secure VM, Manus Cloud Computer, Dots' own cloud computer, Today's cross-device action. Four paths, one requirement: the agent needs a machine that stays running, not a temporary sandbox. That also upgrades the security model. An always-on agent with access to 4000+ apps and the ability to act has to be governed in an enterprise like a service account.
- **Identity is a new axis of competition.** Cue gives the agent its own mailbox, phone, and wallet. Dots names the dot and gives specialist dots an enterprise identity. Muse gives the AI a face. The agent moves from doing work for the user to doing work as itself. Group chat and multi-agent teams are the next product shape.
- **Safety is a shipping bar.** OpenAI held GPT-6.1 Astra because safety was not there. Muse's home-address leak started a discussion. Dots answers with read-only tools, Boundaries in three tiers, and hard approval on sensitive actions. The more autonomy the agent has, the more the permission boundary and the audit trail are the actual product.
- **The split between model layer and product layer is still moving down.** Today AI builds value outside the model with scene-specific prior experience. Manus cuts 32% of cost in the harness with Cascade. Muse and Dots compete directly in the model layer. For developers and product teams the usable judgment has not changed: model capability is becoming a commodity. The difference in Personal AI is how Context becomes Memory, and how an action happens at the right time. That is harness engineering in the product layer, not prompt engineering. The unit of organization is moving from the task to the user, and this time identity and always-on are added on top.

**Author's note:** In that week of September 2026, Personal AI went from a concept to goods on a shelf. For people building it, the executable judgment is: model-layer capability is becoming a commodity, and the difference is state management, identity design, and permission governance. For everyone else, the thing to watch is not how strong the AI is. It is how much permission it received, and whether the memory can be audited.

Sources. Checked 2026-09-30. Benchmark scores, Arena ranks, and growth numbers are vendor or platform figures.

- [Introducing Muse Image and Muse Video](https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/) · Meta AI · 2026-07-07
- [Introducing Muse Spark 1.1](https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/) · Meta AI · 2026-07-09
- [Manus Resumes Independent Operations](https://manus.im/blog/manus-resumes-independent-operations) · Manus · 2026-09-01
- [Introducing Manus 2.0](https://manus.im/blog/introducing-manus-2-0) · Manus · 2026-09-28
- [Manus ships 2.0 and the personal agent Cue](https://www.36kr.com/p/4003830453686403) · 36Kr · 2026-09-29
- [Manus got another life](https://www.163.com/dy/article/L825C9AE051188EA.html) · Huxiu, via NetEase · 2026-09-29
- [Today.ai ships a personal AI assistant](https://www.houdao.com/d/22472-Today-ai-fa-bu-ge-ren-AI-zhu-li-yi-chang-qi-ji-yi-he-zhu-dong-xing-tiao-zhan-xian-you-Agent-fan-shi) · Houdao AI · 2026-09-23
- [Introducing dots](https://openai.com/index/introducing-dots/) · OpenAI · 2026-09-29
- [OpenAI answers Meta with the personal assistant Dots](https://www.sohu.com/a/1082748197_130887) · 2026-09-30
- [OpenAI launches Dots, its Muse competitor](https://www.theverge.com/ai-artificial-intelligence/1002033/openai-dots-launch-muse-competitor) · The Verge · 2026-09-29
- [Sam Altman unveils dots](https://www.cbsnews.com/news/sam-altman-openai-dots-chatgpt-agents-safety/) · CBS News · 2026-09-29
- [OpenAI DevDay 2026: Dots and GPT-6.1 Sol](https://www.analyticsinsight.net/news/openai-devday-2026-20-ai-tools-gpt-61-sol-dots) · Analytics Insight · 2026-09-29
- [Muse Spark](https://aiwiki.ai/wiki/muse_spark) · AI Wiki · 2026-09-24
