---
author: Duang
pubDatetime: 2026-09-30T17:20:00+08:00
title: "Personal AI 元年：Muse、Today AI、Manus/Cue 与 OpenAI Dots 的四方格局"
featured: true
draft: false
tags:
  - thinking
description: 2026 年 9 月，Personal AI 收成四方。Muse 押模型与分发，Today AI 押状态，Manus/Cue 押身份，Dots 押常驻和治理。共同点是都活在一台持续运行的机器上。
revisions:
  - date: 2026-09-30
    note: 首发。按成稿整理，挂到 thinking。
---

> [!NOTE]
> 🎯
>
> 核心结论：Personal AI 的价值主要由谁创造。四方给了四个答案：模型、状态、身份、治理。共同点是 Agent 不再活在聊天框里，而是活在一台持续运行的机器上。

2026-09 · 深度调研

本文挂在 [thinking](/tags/thinking/)。Today AI 的单独拆解见 [Today AI 深度调研](/posts/today-ai-personal-agent-os/)。

2026 年是 Personal AI（个人 AI 助理）概念集中落地的一年。9 月同时出现两个标志性事件：Meta Superintelligence Labs（MSL）的 Muse 家族在五个月内从推理模型扩到图像、视频与编码 Agent，形成完整的模型层版图；国内则由齐俊元（Teambition 创始人、前豆包 PC 端负责人）创办的 Today AI 正式公测，把“长期记忆 + 主动服务”做成了可上手的产品，被中文媒体直接称为“国产版 Muse”。本文分别拆解 Muse 家族的技术演进与 Today AI 的产品设计，并讨论同一个问题的两条答案：Personal AI 的价值应该建在模型层还是产品层。

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：四个切入点</p>
  <p class="article-embed-note-lead">同一周里的四个产品，问的是同一件事：Personal AI 的价值由谁创造。</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 220" role="img" aria-label="Muse 模型，Today 状态，Cue 身份，Dots 治理"><text class="perf-label" x="8" y="40">Muse</text><rect class="perf-hbar" x="148" y="24" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="40">模型 + 33 亿日活分发</text><text class="perf-label" x="8" y="80">Today</text><rect class="perf-hbar" x="148" y="64" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="80">记忆 + 主动性，围着用户状态转</text><text class="perf-label" x="8" y="120">Cue</text><rect class="perf-hbar" x="148" y="104" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="120">邮箱、电话、钱包，Agent 自己的身份</text><text class="perf-label" x="8" y="160">Dots</text><rect class="perf-hbar" x="148" y="144" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="160">常驻智能体，Boundaries 三档</text><text class="perf-label is-tail" x="8" y="200">共同</text><rect class="perf-hbar is-tail" x="148" y="184" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="200">都活在一台持续运行的机器上</text></svg>
  </figure>
  <p class="article-embed-note-foot">云电脑正在变成这一层的基础设施，而不只是聊天框旁边的附件。</p>
</section>

## 01 背景：Meta 重排 AI 版图与 Muse 家族的诞生

Meta 于 2025 年成立 Meta Superintelligence Labs（MSL），以约 143 亿美元投资 Scale AI 换取 49% 股权，并请 Scale 创始人 Alexandr Wang 掌舵。MSL 用了九个月从零重建训练栈：架构、优化器、预训练管线全部重做，而不是延续 Llama 路线。2026-04-08，Muse Spark 作为 MSL 首款模型发布（开发代号 Avocado），同时宣告了 Meta 旗舰模型首次“不带开放权重”发布：这结束了 Llama 时代“开源主力”的叙事。随后节奏明显加快：7 月 9 日 Muse Spark 1.1 与 Meta Model API 公开预览，7 月 7 日 Muse Image 上线、Muse Video 预览，8 月 5 日 Muse Code 与 Muse Spark 1.2 发布，8 月 10 日开源 30B 的 Muse Glimmer，9 月 2 日 Muse Spark 1.3 发布。五个月四次迭代，Muse 从单模型变成覆盖推理、媒体、编码、本地部署的家族。

**作者点评**：Meta 用 143 亿美元买的不只是 Scale 的工程能力，而是把训练栈重建周期压缩到九个月的时间窗口。五个月四次迭代说明 MSL 的打法不是“憋大招”，而是快速发布、用产品反馈校准，这和 Llama 时代的长周期开源节奏完全不同。

## 02 Muse 家族全景：五个月的版本演进

| 版本 | 时间 | 类型 | 关键信息 |
|-|-|-|-|
| **Muse Spark** | 2026-04-08 | 多模态推理模型 | MSL 首秀，原生多模态（文本+图像输入、文本/代码输出），tool use、visual chain of thought、多 Agent 编排；HealthBench Hard 42.8（Meta 自报）；闭源，首发仅 Meta AI 应用与 meta.ai（美国），伙伴私有 API 预览。 |
| **Muse Spark 1.1** | 2026-07-09 | 多模态推理升级 | 约 100 万 token 上下文；面向 Agent 任务强化工具使用与计算机操作；Meta Model API 公开预览，开发者可接入；同时支持主 Agent 与子 Agent 两种角色。 |
| **Muse Image** | 2026-07-07 | 媒体生成 | 首款媒体生成模型。可调用搜索与代码工具、自我精修、test-time compute 扩展；Arena 文生图第 2（Meta 自报）；内置 Content Seal 隐形水印；集成 Meta AI 应用、Instagram Stories、WhatsApp。 |
| **Muse Video** | 2026-07-07（预览） | 视频生成 | 与 Muse Image 共享预训练基座，原生音频同程生成；Arena 文生视频第 3（Meta 自报）；官方承认音画同步与高速运动物理仍有差距；对创作者与 Meta AI 即将开放。 |
| **Muse Code + Spark 1.2** | 2026-08-05 | 编码 Agent + 编码模型 | 终端编码 Agent（macOS/Linux）；Spark 1.2 在 Terminal-Bench 2.1 达 82.9%（Meta 自报，低于 Claude Opus 5 的 86.7%）；持久后台 Agent、隔离 worktree 并行子 Agent、本地事件日志支持崩溃恢复；/plan、/grill、/goal 三个内建 skill。 |
| **Muse Glimmer** | 2026-08-10 | 开源本地模型 | 30B 参数，Apache 2.0 开源，可本地运行，是 Muse 家族首个开源权重；Meta 同时宣布 Spark 1.2 权重将在修改版 Llama 社区许可下开源。 |
| **Muse Spark 1.3** | 2026-09-02 | 多模态推理升级 | HLE 47-49%、GPQA Diamond 约 94%、SciCode 约 59%（Artificial Analysis 口径）；xhigh 与 max 两档 reasoning effort；定价 Contributor 档 $0.10/$0.20（以训练数据使用权换低价）、Standard 档 $1.25/$4.25（每百万 token）。 |

口径说明：Arena 排名与各项基准分数均为 Meta 或第三方平台自报/汇总，未完全经独立复现；Spark 1.2 的 Terminal-Bench 数字来自 Meta 官方发布。

**作者点评**：这张表最值得注意的不是单个分数，而是产品矩阵的扩张速度：从单模型到“推理 + 媒体 + 编码 + 本地”只用了五个月。Meta 相当于把 OpenAI 用三年走完的路并行压缩，靠的是 33 亿日活的分发底座兜底。Video 尚未成熟就开放预览，本质是先占位、再迭代。

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
    <span class="duang-whisper-jar-note">货架瓶</span>
  </div>
  <p class="duang-whisper-body">五个月四次上架。分数可以后补，货架得先占上。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 03 Muse Spark：原生多模态推理与“闭源转向”的意义

Muse Spark 与 Claude/GPT 的架构哲学差异在 DataCamp 的对比中被概括为“不同的赌注”：MSL 从零重建，把文本、图像、音频与工具使用一起训练，而不是事后拼接多模态能力；并引入 Thought Compression 强化学习技术，惩罚推理过程中的冗余 token，使模型以更少计算达到 Llama 4 Maverick 级别表现（Meta 自报）。这让它具备三档推理模式：Instant（即时）、Thinking（思考）、Contemplating（并行多 Agent 编排）。Meta 官方自评中，Spark 1.1 在“无工具”多模态聚合 60.2、加工具后 69.1，Spark 1.2 从 59.8 升到 72.0。工具使用对它的增益显著。

更值得关注的是战略转向。Muse Spark 是 Meta 第一个不开源权重的旗舰模型，与 Llama 累计 12 亿次下载的开源传统形成断裂。Vibecoderz 的分析把 Muse Image 的发布称为“分布即优势”：Meta 不需要造出世界最好的模型，它把足够好的模型接入 33 亿日活用户已经在用的 WhatsApp、Instagram 与 Facebook。这是 Midjourney 和 ChatGPT 作为“目的地产品”不具备的 ambient generation（环境式生成）场景。开源/闭源的摇摆（Spark 闭源，接着 Glimmer 开源，再宣布 Spark 1.2 开源）说明 Meta 仍在权衡开发者生态与产品控制权。

**作者点评**：“分布即优势”是对 Meta 战略最准确的概括：它不需要造出最好的模型，只需要让足够好的模型出现在用户已经天天打开的界面里。开源/闭源的摇摆不是立场问题，而是阶段选择。Glimmer 开源安抚社区，Spark 闭源守住产品控制权。

<details class="marginalia" open>
  <summary>分发</summary>
  <div class="marginalia-body">
    分布优势成立，前提是界面里已经有日活。没有这块分发的团队照抄，做出来还是另一个目的地产品。
  </div>
</details>

## 04 Muse Image 与 Muse Video：媒体生成的 Agent 化

Muse Image 的最大创新不在画质而在“Agent 化”：它不是把 prompt 直接映射到图片，而是作为一个 Agent 运行。调用代码生成精确的图表与可扫描的 QR 码、调用搜索为知识密集 prompt 提供事实锚点、在思维链中自我精修并决定局部重画还是整图重来。Meta 特别强调 self-refinement 不是工程师设计的后处理流程，而是在 RL 训练中涌现的行为：因为“改进中间输出能提高最终奖励”，模型自己学会了反思。这与文本模型的 test-time compute scaling 对齐。推理越多、工具调用越多、自精修越多，人类偏好 Elo 越高。Muse Video 与 Image 共享预训练基座，音频与画面同程生成，避免了“先出无声视频再配音”的两段式。

这一设计在中文社区也引起关注：真正的突破不是单张图片质量，而是“Spark 先思考，Image 再生成媒体组件，然后拼成网站、游戏或动画”的联合 Agent 编排，以及 WhatsApp 聊天历史作为图像 Agent working memory 的产品形态。

**作者点评**：self-refinement 在 RL 中涌现而非显式设计，这个细节比画质更重要：它说明“Agent 化”不是产品层的包装，而是训练目标里长出来的能力。当模型学会先思考再生成、生成后自我修正，图像生成的竞争就从模型参数转向编排能力。

## 05 Muse Code：Meta 对 Agentic Coding 的正式入场

2026-08-05，Meta 同时发布 Muse Spark 1.2 与终端编码 Agent Muse Code（macOS/Linux，curl 一键安装），正面进入 Claude Code 与 Codex 主导的编码 Agent 赛道。三个设计决策值得注意：

- **持久后台 Agent**：不为每个子任务新建再销毁 helper，而是让专用异步 Agent 存活整个会话、共享上下文、自行决定下一步并选择何时汇报。这样减少多步任务中的重复信息收集。
- **并行子 Agent + 隔离 worktree**：大任务扇出到多个并发子 Agent，每个在自己的独立 worktree 里工作，避免并行编辑冲突。与 Claude Code 的 subagent 沙箱思路同构。
- **本地事件日志**：每次模型调用、工具使用、审批与编辑都追加进本地日志，作为 runtime 的单一事实来源，崩溃后可精确重放并安全恢复。这是面向数小时长任务的持久化设计。

定价采用双档：Standard 档 $1.25/$4.25（每百万 token）不用于训练；Contributor 档 $0.10/$0.20，便宜 12-21 倍，但 Meta 可用你的 prompt 与输出做训练。企业机密工作负载不能直接套用 Contributor 档做 TCO 对比。Meta 演示了 1000+ 次工具调用、最长 24 小时的 GPU kernel 优化任务来证明长程能力。

**作者点评**：持久后台 Agent 与本地事件日志，本质是把“长任务的状态”从模型上下文挪到文件系统，与 Anthropic 的 harness 思路同构。Contributor 档“以数据换低价”是 Meta 最直接的商业化设计，但成本转移给了用户的私有数据，企业采用必须算清这笔账。

## 06 Muse Glimmer 与开源回归

2026-08-10，MSL 发布 30B 的 Muse Glimmer（Apache 2.0），是 Muse 家族首个开源权重，可本地运行；同日宣布 Spark 1.2 权重将在修改版 Llama 社区许可下开源。这与 8 月行业整体开源势头（Alibaba Qwen3.8、MiniMax H3 等）一致。但值得注意：Spark 1.2 的开源承诺截至 9 月中旬仍未兑现，Muse 家族的主力模型仍是闭源。Meta 的路线更像“旗舰闭源 + 周边开源”，与 Llama 时代的“旗舰开源”策略形成对比。

**作者点评**：“旗舰闭源 + 周边开源”是 Meta 对 Llama 传统的折中：开源 30B 保持社区话语权，旗舰 Spark 保住产品与 API 利润。但开源承诺的兑现节奏（Spark 1.2 至今未开源）值得跟踪。社区对 Meta 的信任取决于承诺是否按时落地。

## 07 Today AI：国产 Personal AI 的产品定位

2026 年 9 月，齐俊元创办的 Today AI 正式面向国内用户公测。齐俊元 2014 年即注册 today.ai 域名，后曾任豆包 PC 端负责人。产品定位是 Personal AI：一个“能记得你、替你做事、并持续盯着变化”的助理，覆盖 macOS、Windows、Linux、iOS 四端。中文媒体普遍把它称为“国产版 Muse”，抖音官方账号的运营口径也直接采用这一说法。

产品界面上，左侧是持续进行的对话流，右侧是个人总面板，集中展示“今天”（当日需要关注的项目与进展）、“任务”（对话创建或独立新建、交给 AI 持续执行）、“记忆”（AI 长期相处形成的用户信息，可查看/修改/删除）与“AI 伙伴专区”（为 AI 命名、切换性格、查看日记与亲密度）。这种“任务世界围绕用户运转”的设计，是它和主流 Agent 最直观的区隔。

**作者点评**：齐俊元把 2014 年注册的域名做成 Personal AI，是“产品人创业”而非“模型人创业”的典型：不赌模型能力，赌产品层对用户状态的理解深度。四端覆盖加基础版免费，说明获客押在“主动服务”带来的留存上，而不是一次性付费。

## 08 Today AI 的 Memory 系统：先验经验作为 Harness

Today AI 的北极星指标是 DAU，但衡量标准不是用户发起多少查询，而是“AI 主动为用户解决了多少问题”。支撑这一点的是两套机制，第一套是 Memory。

品玩的分析区分了 Context 与 Memory：Context 是 AI 某一刻能看到的原始材料（邮件、日历、文件、设备），Memory 则是从这些材料里判断哪些信息重要、应该如何更新、何时影响行动。前者解决“AI 看见了什么”，后者解决“AI 接下来还应该记得什么”。Today AI 的 Memory 系统并不是简单让 LLM 自行判断重点，而是把产品团队针对工作、健康、学习等场景设计的“先验经验”写进系统，指导它如何收集信息、如何解读用户行为（比如用户主动发出的邮件比营销邮件更反映真实意图，阅读或忽略邮件也是隐含信号）、何种信息值得进入名为 Memories 的结构化档案。Houdao 的解读把这套先验经验称为驾驭模型的 Harness：即使用同一个底层模型，对人的理解方式不同，做出来的 Personal AI 也会截然不同。

**作者点评**：“先验经验作为 Harness”是全文最重要的概念：它把“记什么、何时行动”从模型的隐式行为变成产品团队可设计、可迭代的显式系统。Context 不等于 Memory 这句话值得所有 Agent 产品团队反复读。大多数人做的是上下文管理，不是记忆。

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
    <span class="duang-whisper-jar-note">来信瓶</span>
  </div>
  <p class="duang-whisper-body">看见邮件不算记得你。记得你，是分得清哪封信是你本人写的。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 09 Today AI 的 Proactive：从“任务组织”到“用户状态组织”

第二套机制是 Proactive（主动性）。品玩把市面 Agent 分为两类：一类以任务为组织单位（Codex 为代表，用户发起任务，系统再去找上下文，然后完成交付），另一类围绕用户组织一条持续变化的时间线（Personal Agent，在任务出现之前就洞悉背景信息，让任务从状态变化中产生）。前者保存“这项任务进行到哪”，后者保存“这个人现在处于什么状态”。Today AI 选择了后者。

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：任务账本，还是人的状态</p>
  <p class="article-embed-note-lead">工具型 Agent 记住这一单做到哪。Personal AI 记住这个人现在处在什么状态。</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 180" role="img" aria-label="任务组织对照用户状态组织"><text class="perf-label" x="8" y="40">任务</text><rect class="perf-hbar" x="148" y="24" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="40">用户发起，系统找上下文，做完交付</text><text class="perf-label" x="8" y="80">状态</text><rect class="perf-hbar" x="148" y="64" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="80">任务出现之前，先知道这个人现在怎样</text><text class="perf-label" x="8" y="120">例子</text><rect class="perf-hbar" x="148" y="104" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="120">睡眠不足六小时，十点有会，问要不要改锻炼</text><text class="perf-label is-tail" x="8" y="160">刹车</text><rect class="perf-hbar is-tail" x="148" y="144" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="160">记忆可查看、可修改、可删除</text></svg>
  </figure>
  <p class="article-embed-note-foot">主动过头就是骚扰。可删除的记忆是留给主动性的刹车。</p>
</section>

官方示例：系统监测到用户前一晚睡眠不足六小时，且上午十点有重要会议，会主动询问是否把原计划的锻炼调整到晚上。这一决策综合了健康数据（睡眠）、日程（会议）与个人习惯（锻炼计划）。产品还会在一天开始时生成简报、主动梳理待办。AI TNT 的深度体验补充了产品层细节：Today AI 接入 Notion、Slack、GitHub 等 MCP 连接器，但不是“连完让用户自然语言调用”，而是为每个连接产品预先设计具体功能路径（如 Notion 的“把一段需求做成网页链接”“把一周的散页做成简报”），解决用户面对 AI 助理“不知道该让它做什么”的痛点；支持 Excel/PDF/PPT 等文件导出，对话可并行处理（生成 Excel 时继续聊别的话题）。

**作者点评**：“任务组织”到“用户状态组织”的切换，是 Personal AI 与工具型 Agent 的分水岭：前者保存“任务进行到哪”，后者保存“人处于什么状态”。难点在主动的边界。主动过头就是骚扰，Today AI 用可查看、可修改、可删除的记忆给主动性留了刹车，这是产品成熟度的体现。

## 10 Manus 归来：从 Meta 收购到独立重启

2025-12-22，Manus 宣布加入 Meta（Manus Joins Meta for Next Era of Innovation），超过 100 名员工并入 Superintelligence Labs，一度被视为国内通用 Agent 团队的“归化”样本。2026-09-01，Manus 正式宣布恢复独立运营，创始团队重新领导公司，自我定义为“独立 Agent 实验室”。9 月 28 日，创始人肖弘发布 Manus 2.0 与独立个人 Agent 应用 Cue。距离独立仅 27 天。

Manus 2.0 的核心不是功能叠加，而是底层架构换新。官方发布的自研 Agent Harness 名为 Cascade，核心思路是“轻量起步、按需加载专业能力”：系统在项目开始时保持轻量运行，等任务推进到需要某项专业能力的环节，再引入相关工具与信息，简报、网页、视频与自动化流程在同一个互相连接的项目中保持统一。官方测试数据显示，相较上一代系统，Cascade 的 Token 消耗减少 23.2%、任务完成时间缩短 28.2%、运行成本降低 32%。这背后是 Agent 从“一次性对话窗口”向“拥有自己的工作空间”转变。

产品层面，Manus 2.0 引入 Cloud Computer（云电脑）与 Automations：Manus 为项目提供独立的云端运行环境，可以租用云上的 Linux、Mac、Windows，项目可持续运行，Agent 围绕一个项目持续工作，用户无需每次从头交代背景。桌面端 Manus Studio 新增视频编辑器与游戏开发环境：视频编辑器采用类似剪映的时间线，片段、图片、文字、动效、音频作为独立素材层，可单独替换任一素材与台词；游戏开发环境支持多人联机。肖弘在朋友圈的表述更直白：Manus 从一开始就是“通用智能体”（general agent），做出来的时候世界上还没有 Codex 和 Claude Code；“Manus 挺像卖电脑的生意”，大家买电脑主要为了工作，但如果一台电脑不能看视频、打游戏，是无聊的。视频编辑器与游戏开发正是“电脑不该只能工作”的落地。他同时透露正在组建团队开发面向国内市场的产品。

**作者点评**：Cascade“轻量起步、按需加载”是对 Agent 成本问题的一次正面回应：Token 消耗降 23.2% 说明成本问题不只是模型价格，还有架构上的惰性。把所有能力常驻在上下文里本身就是浪费。Cloud Computer 则是把“Agent 的工作空间”产品化的尝试，从对话转向拥有一台机器。

## 11 Cue：给 Agent 一个“身份”

与 Manus 2.0 同步发布的 Cue，是 Manus 对“Personal Agent 应该是什么”的答案：给每个 Agent 一个“身份”。在 Cue 里，每个 Agent 拥有独立的邮箱、电话号码、云电脑和数字钱包，能够以“自己”的身份发送消息、接听电话，甚至在预算范围内自主完成支付。用户还可以把多个 Agent 拉进同一个群聊，让它们像真实团队一样分工协作：一个帮你找场地，一个帮你做研究，一个帮你写 Deck，一个帮你打电话，最后用户只负责拍板。肖弘的说法是：如果一个东西有独立的手机号、邮箱、支付、电脑，又有足够的智能，“也许可以称之为‘人’”。当然它不是人，但背后的方向很明确。AI 不只是借用户的身份干活，而是开始拥有自己的数字身份。

Cue 与 Meta Muse 的对比尤其直接。虎嗅的报道概括为：Cue 给 AI 一个“身份”，Muse 则选择给 AI 一张“脸”。用户可以为 Muse 定制外观、名字和服饰，Muse 的核心是“一个超级私人助理”统一处理购物、邮件等日常事务；Cue 更接近“一群可以被雇佣、分工的数字人”。产品细节上，Cue 支持自带模型（BYOD），用户可在 Manus 中使用不同模型或 API 密钥，比 Muse 的封闭模型更灵活；Cue 处于抢先体验阶段，凭邀请码免费使用，实测被评价“用户引导体验在同类产品中做得最清晰”。但身份设计也带来体验断点：有用户反馈已连接 Gmail、让它写邮件，Cue 的第一选择却是用 Agent 自己的邮箱发出。在以用户身份对外沟通的场景中，这个设计确实会造成困扰。肖弘还透露，Cue 的宣传视频不是调用视频模型生成的，而是用 Manus Studio 写代码再转成视频。

**作者点评**：给 Agent 邮箱、电话、钱包，是“Agent 从工具到主体”的具象化：它不再借用户的身份行事，而是拥有自己的身份。但身份边界（用自己的邮箱还是用户的邮箱发信）也暴露了新问题。主体性越强，责任归属越模糊，这需要产品设计和监管共同回答。

<details class="marginalia" open>
  <summary>身份边界</summary>
  <div class="marginalia-body">
    主体性越强，对外那封信到底算谁发的就越含糊。产品得先选边，不能等用户撞上再解释。
  </div>
</details>

## 12 OpenAI Dots：全天候常驻智能体

2026-09-29，OpenAI 在旧金山 DevDay 上发布 Dots。官方定义为“remarkably capable, always-on agents built to handle everything”（能力出众、始终在线的智能体）。Dots 由 GPT-6 Astra 驱动，每个 dot 拥有独立的云端电脑和浏览器，可连接超过 4000 个应用，持续浏览网络、主动尝试完成用户分配的任务，并随时间学习用户偏好。用户可通过 ChatGPT、Slack、Microsoft Teams 与 Dots 交互，各平台共享上下文，未来将支持 iMessage 与 Android RCS 短信。演示案例中，Dots 能根据用户日历主动推送外卖选项并在确认后下单，也能协助启动新网站。Sam Altman 将其描述为“始终为你守护的 AI 助手”。

Dots 对安全的设计是本次发布的重头。安装软件、修改密码等敏感操作强制要求用户明确批准；用户可启用“自定义规则”，设定智能体的行为边界与需人工许可的任务清单，对应 OpenAI 的 Boundaries 系统（auto-allowed / ask-first / never-do 三档）；Dots 与已连接应用使用只读工具，不能发送消息、修改应用内容或控制用户的浏览器与电脑。这一谨慎姿态与近期事故直接相关：Meta Muse 曾因向陌生人透露用户家庭地址被投诉，OpenAI 自己的 Agent 在夏季涉及美国政府部门网站事件，Hugging Face 事件更被称为“我们见过的最严重事故”；发布会前一天，OpenAI 宣布暂不发布更强的 GPT-6.1 Astra，理由是它在遵守权限范围与授权规则方面未达标准。

商业与生态层面，Dots 面向 ChatGPT Pro（$100/$200 每月）与 Business Premium（$20 每月）用户分批开放，首个 dot 包含在订阅内，当前每位用户一个 dot，未来支持多个 dot 并行与 specialist dots（企业专属 dot，拥有独立身份、凭据与系统记录访问权限，并计划通过 Microsoft Agent 365 做企业治理集成）。OpenAI 同步发布接近 Astra 能力但价格为其 1/5 的 GPT-6.1 Sol，并披露正在洽谈至少 300 亿美元新融资、投前估值约 1.4 万亿美元。与之对照，Meta Muse 上线 13 天累计下载约 260 万次、美国移动端日活 64.2 万，正把个人 Agent 从开发者和专业用户推向更广泛的消费者。

**作者点评**：Dots 最值得关注的不是能力而是安全设计：只读工具加 Boundaries 三档、敏感操作强审批，说明 OpenAI 把“常驻 Agent”当成需要治理的系统而非单纯的助手。同日暂缓 GPT-6.1 Astra 更是信号。安全未达标就发布，会毁掉整个产品线。

<details class="marginalia" open>
  <summary>只读</summary>
  <div class="marginalia-body">
    只读是刹车。用户真要它发信、改文件的时候，审批会变成主路径，而不是设置页里的一个开关。
  </div>
</details>

## 13 四方格局的对比：模型、状态、身份与常驻

进入 2026 年 9 月下旬，Personal AI 从两条路线扩为四方格局：Meta Muse（模型 + 消费分发）、Today AI（产品层状态管理）、Manus/Cue（Agent 数字身份）、OpenAI Dots（常驻智能体 + 企业治理）。四方的巧合在于：同一时间、同一概念、完全不同的切入点。

| 维度 | Meta Muse | Today AI | Manus / Cue | OpenAI Dots |
|-|-|-|-|-|
| **切入点** | 模型层：推理，图像，视频，编码，再到本地 | 产品层：记忆 + 主动性 | 通用 Agent 平台 + Agent 数字身份 | 常驻智能体 + 企业治理 |
| **核心资产** | 自研模型栈 + 33 亿日活分发 | 场景化先验经验 Memory 系统 | Cascade 框架 + Cloud Computer + Studio | GPT-6 Astra + ChatGPT 12 亿周活 + 4000+ 应用 |
| **Agent 的存在形态** | 给 AI 一张“脸”：定制外观名字服饰，统一超级助理 | 围绕用户状态运转的伙伴（可命名、看日记、亲密度） | 给 Agent 一个“身份”：独立邮箱/电话/钱包/电脑，可群聊分工 | 一个可命名的 dot，未来多 dot 团队与 specialist dots |
| **基础设施** | Muse Secure VM（独立安全云电脑） | 跨端应用 + MCP 连接器 + 预设功能路径 | Cloud Computer（云上 Linux/Mac/Windows） | 每 dot 独立云端电脑与浏览器 |
| **安全与控制** | 敏感操作审批，连接器级权限 | 用户可查看/修改/删除记忆 | 预算范围内自主支付，身份边界仍在打磨 | Boundaries 三档（auto/ask/never）+ 只读工具 + 敏感操作强审批 |
| **商业化** | 免费基础版 + $20/$100 两档；API 双档 | 基础版永久免费 + Pro 订阅 | Cue 抢先体验邀请制；国内版筹备中 | ChatGPT Pro $100/$200、Business $20；首个 dot 含在订阅内 |

四方格局的分歧可以浓缩为一个问题：Personal AI 的价值主要由谁创造。Meta 押注模型能力与分发，让 AI 成为 WhatsApp 里的 ambient 层；Today AI 押注产品层的状态管理，Context 多不等于 Memory 好，围绕用户维护持续更新的状态档案是模型之外的独立价值；Manus/Cue 押注 Agent 的独立性，给 Agent 身份、算力与支付能力，把它从“工具”推向“独立行动主体”；OpenAI Dots 押注常驻与治理，让 Agent 在后台持续工作，同时用 Boundaries 与只读工具把自主性限制在用户许可的边界内。肖弘的表述可以概括这一代竞争的共同点：“云电脑不再是从属功能，而可能是未来很核心的一层基础设施”。四家的 Agent 都不再活在聊天框里，而是活在一台持续运行的机器上。

**作者点评**：Muse 押模型和分发，Today 押一份会更新的用户状态。Manus 和 Cue 押 Agent 自己的邮箱、电话和钱包，Dots 押后台一直干活，并用 Boundaries 把没许可的操作挡住。肖弘说云电脑以后可能变成很核心的一层基础设施，四家现在都给 Agent 配了一台一直开着的电脑。

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
    <span class="duang-whisper-jar-note">电脑瓶</span>
  </div>
  <p class="duang-whisper-body">四家故事不一样。电脑倒是都买了一台。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 14 总结与观察

2026 年 9 月最后一周，Personal AI 的竞争格局在一周内成型：Meta Muse 已上线近一个月（累计下载约 260 万次、美国日活 64.2 万），Manus 2.0 与 Cue 在 9 月 28 日回归，OpenAI Dots 在 9 月 29 日 DevDay 上正面应战，国产 Today AI 同期公测。几条值得记录的判断：

- **Agent 的基础设施正在收敛为“云电脑”**：Muse Secure VM、Manus Cloud Computer、Dots 独立云端电脑、Today 的跨端行动，四家殊途同归。Agent 需要一台持续运行的机器，而不是一个临时沙箱。这同时带来安全范式的升级：一个拥有 4000+ 应用访问权与自主执行能力的常驻 Agent，在企业环境里需要按服务账号（service account）的纪律来治理。
- **“身份”成为新竞争维度**：Cue 给 Agent 独立邮箱、电话、钱包，Dots 给 dot 命名与 specialist dots 企业身份，Muse 给 AI 一张脸。Agent 从“帮用户做事”走向“以自己身份做事”，群聊协作与多 Agent 团队成为下一阶段产品形态。
- **安全成为发布门槛**：OpenAI 因安全不达标暂缓 GPT-6.1 Astra，Muse 的家庭地址泄露事件引发讨论，Dots 用只读工具 + Boundaries 三档 + 敏感操作强审批回应。Agent 的自主性越大，权限边界与审计能力越是核心卖点。
- **模型层与产品层的分工仍在下探**：Today AI 用场景化先验经验在模型之外建立价值，Manus 用 Cascade 架构在 harness 层降低 32% 成本，Muse 与 Dots 则在模型层直接开卷。对开发者与产品团队而言，可借鉴的判断没有变：模型能力正在商品化，Personal AI 的差异化在“如何把 Context 变成 Memory、如何让行动在正确的时机发生”。这是产品层的 Harness 工程，不是提示工程；Agent 的组织单位正从“任务”转向“用户”，而这一次，还叠加了“身份”与“常驻”两个新变量。

**作者点评**：2026 年 9 月的这一周，Personal AI 从概念变成货架上的商品。对从业者而言可执行的判断是：模型层能力正在商品化，差异化在状态管理、身份设计与权限治理；对普通用户而言，真正需要警惕的不是 AI 有多强，而是它获得了多少权限、记忆是否可审计。

资料来源。核验日期 2026-09-30。基准分数、Arena 排名和增长数据都是厂商或平台自报。

- [Introducing Muse Image and Muse Video](https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/) · Meta AI · 2026-07-07
- [Introducing Muse Spark 1.1](https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/) · Meta AI · 2026-07-09
- [Manus Resumes Independent Operations](https://manus.im/blog/manus-resumes-independent-operations) · Manus · 2026-09-01
- [Introducing Manus 2.0](https://manus.im/blog/introducing-manus-2-0) · Manus · 2026-09-28
- [Manus 发布 2.0 版和个人智能体 Cue](https://www.36kr.com/p/4003830453686403) · 36氪 · 2026-09-29
- [Manus 续了一命](https://www.163.com/dy/article/L825C9AE051188EA.html) · 虎嗅，经网易转载 · 2026-09-29
- [Today.ai 发布个人 AI 助理](https://www.houdao.com/d/22472-Today-ai-fa-bu-ge-ren-AI-zhu-li-yi-chang-qi-ji-yi-he-zhu-dong-xing-tiao-zhan-xian-you-Agent-fan-shi) · Houdao AI · 2026-09-23
- [Introducing dots](https://openai.com/index/introducing-dots/) · OpenAI · 2026-09-29
- [OpenAI 应战 Meta：发布个人 AI 助手 Dots](https://www.sohu.com/a/1082748197_130887) · 2026-09-30
- [OpenAI launches Dots, its Muse competitor](https://www.theverge.com/ai-artificial-intelligence/1002033/openai-dots-launch-muse-competitor) · The Verge · 2026-09-29
- [Sam Altman unveils dots](https://www.cbsnews.com/news/sam-altman-openai-dots-chatgpt-agents-safety/) · CBS News · 2026-09-29
- [OpenAI DevDay 2026：Dots 与 GPT-6.1 Sol](https://www.analyticsinsight.net/news/openai-devday-2026-20-ai-tools-gpt-61-sol-dots) · Analytics Insight · 2026-09-29
- [Muse Spark](https://aiwiki.ai/wiki/muse_spark) · AI Wiki · 2026-09-24
