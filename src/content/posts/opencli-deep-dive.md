---
author: Duang
pubDatetime: 2026-09-01T09:00:00+08:00
modDatetime: 2026-09-01T09:00:00+08:00
title: OpenCLI 深度解析：把浏览能力收成 Agent 能调用的命令
featured: true
draft: false
tags:
  - Agent 拆解专栏
  - OpenCLI
description: 拆 jackwener/OpenCLI。它不是爬虫也不是大模型，而是把需要浏览器上下文的能力，收成可发现、可编排、可输出结构化结果的 CLI。
revisions:
  - date: 2026-09-01
    note: 首发。论述按成稿对齐；边注、动态图解与词卡另加，不改论述。
---

**拆解说明**｜这是 [Agent 拆解专栏](/posts/agent-breakdown/) 的一篇。对象是 [`jackwener/OpenCLI`](https://github.com/jackwener/opencli)，不是同名的 OpenCLI Specification（OCS）或其他同名仓库。资料口径截至 2026-09-01（Asia/Shanghai）；站点数量、命令列表和版本会持续变化，应以仓库当前的 `opencli list -f json` 为准。

## 1. 先给结论：OpenCLI 到底是什么

**OpenCLI 是一个 AI 原生的 CLI 运行时和适配器平台**。它把三类原本分散的能力统一到一个命令入口：

- 网站能力：把 B 站、知乎、小红书、Twitter/X、Reddit、Hacker News 等网站的读取或操作包装成命令。
- 浏览器能力：让 AI Agent 通过用户已经登录的 Chrome/Chromium，执行导航、读取、点击、输入、提取和网络观察。
- 工具与桌面能力：把本地 CLI 二进制、Electron 桌面应用和自定义插件接入同一棵命令树。

它最重要的价值不是“再做一个网页爬虫”，而是把**需要浏览器上下文的能力，收敛成可发现、可编排、可输出结构化结果的命令接口**：

```
人类 / AI Agent
      │  opencli <site> <command> [args]
      ▼
统一命令注册表 + 参数校验 + 执行器 + 输出格式化
      ├── 公开 API / 页面抓取
      ├── Browser Bridge → 本地 daemon → 已登录 Chrome
      ├── 直接 CDP → Chrome 或 Electron
      └── 外部 CLI 透传 / 插件
```

**一句话判断**：OpenCLI 适合把“人可以在浏览器里完成、但没有好用官方 API”的工作，变成 Agent 可以稳定重复调用的 CLI；它不等于大模型，也不等于通用爬虫，更不保证所有网站改版后永远不需要维护。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="opencli"
      src="/images/childlike-sketch-opencli-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">命令瓶</span>
  </div>
  <p class="duang-whisper-body">人在浏览器里能做的事，才值得收成命令。猜页面那套留给侦察，别留给每次运行。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：三类能力，一个入口</p>
  <p class="article-embed-note-lead">网站、浏览器、工具与桌面，最后都挂到同一棵命令树上。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="网站、浏览器、工具与桌面三类能力">
        <rect class="mixup-panel" x="24" y="36" width="180" height="120" rx="12"/>
        <text class="mixup-title" x="114" y="88" text-anchor="middle">网站</text>
        <text class="mixup-caption" x="114" y="116" text-anchor="middle">站点命令</text>
        <rect class="mixup-panel is-accent" x="230" y="36" width="180" height="120" rx="12"/>
        <text class="mixup-title" x="320" y="88" text-anchor="middle">浏览器</text>
        <text class="mixup-caption" x="320" y="116" text-anchor="middle">已登录 Chrome</text>
        <rect class="mixup-panel is-soft" x="436" y="36" width="180" height="120" rx="12"/>
        <text class="mixup-title" x="526" y="88" text-anchor="middle">工具与桌面</text>
        <text class="mixup-caption" x="526" y="116" text-anchor="middle">CLI / Electron</text>
        <circle class="mixup-dot is-live" cx="320" cy="186" r="6"/>
        <text class="mixup-caption" x="320" y="204" text-anchor="middle">opencli &lt;site&gt; &lt;command&gt;</text>
      </svg>
    </div>
  </figure>
</section>

## 2. 定位：它解决的不是“如何浏览”，而是“如何把浏览能力产品化”

### 2.1 它面向的核心问题

传统自动化通常在两端之间摇摆：

- 直接调用 API：稳定、快、适合脚本，但很多产品没有公开 API，或需要单独申请密钥、处理 OAuth 和风控。
- 直接操作浏览器：覆盖面广，但选择器、页面状态、登录态和异常处理容易散落在一次性脚本里，难以复用。
- 让 LLM 每次临时浏览：灵活，但结果可能不稳定，运行时需要消耗模型 token，难以像普通命令一样做 CI、批处理和错误分支。

OpenCLI 的做法是：**第一次通过浏览器侦察和适配器开发解决“怎么做”，以后用命令和固定输出解决“重复做”**。如果页面或接口变化，再通过诊断、验证和修复流程更新适配器。

### 2.2 三类使用者

| 使用者 | 主要诉求 | OpenCLI 提供的表面 |
| --- | --- | --- |
| 人类用户 | 少切换网页，直接完成搜索、读取、下载或桌面操作 | `opencli <site> <command>` |
| AI Agent | 有稳定的工具发现、参数、结构化输出和错误信号 | `opencli list -f json`、Browser skill、退出码 |
| 适配器开发者 | 把新网站或新工具接入，并能验证、发布和维护 | adapter、pipeline、plugin、fixture、verify |

### 2.3 它不是什么

- **不是 LLM**：OpenCLI 不负责理解自然语言本身；自然语言可以由 Agent 转换为命令，OpenCLI 负责执行。
- **不是 MCP 协议实现本身**：MCP 是模型调用工具的一种协议；OpenCLI 是 CLI 运行时和命令生态，可以被 Agent、脚本或其他工具包装和调用。
- **不是万能爬虫**：它更强调“登录态下的产品操作”和“结构化命令”，不以大规模并发抓取为主要目标。
- **不是安全绕过工具**：它复用当前浏览器已经合法拥有的会话，不应被用来绕过验证码、访问控制、签名保护或网站条款。

<details class="marginalia" open>
  <summary>谁转成命令</summary>
  </div>
</details>

## 3. 范式：OpenCLI 的五个关键设计选择

这里的“范式”不是某一种编程语言语法，而是它组织自动化能力的方式。

### 3.1 CLI-first：先把能力设计成命令

CLI（Command-Line Interface，命令行界面）天然适合组合：一个命令可以被 shell、CI、脚本和 Agent 调用，也可以通过管道交给 `jq`、Python 或另一个命令。OpenCLI 因此把网站能力组织成类似下面的形式：

```bash
opencli bilibili hot --limit 5 -f json
opencli zhihu search "AI Agent" -f md
opencli twitter profile openai -f yaml
```

命令不是简单的“点击录制”，而是一个带有名称、参数、权限属性、访问策略、输出列和错误语义的能力单元。

### 3.2 Adapter-first：用适配器隔离站点差异

**Adapter（适配器）**是把某个站点或应用的具体协议，转换成 OpenCLI 统一命令契约的代码或配置。调用者只需要知道“搜索、读取、下载”等意图，不需要知道站点内部 API、Cookie 名称、DOM 结构或字段编码。

适配器负责：

- 解析命令参数；
- 选择访问策略；
- 导航或调用接口；
- 处理登录态、分页、限流和失败；
- 把异构响应归一化成稳定的行和列；
- 声明这是只读操作还是会改变远端状态的写操作。

### 3.3 Browser-as-credential-runtime：浏览器是登录态运行时

OpenCLI 不要求把密码复制到脚本，也不把每个网站的 token 都重新实现一遍。对需要登录的场景，它让浏览器继续承担 Cookie、页面会话、同源策略和用户交互的职责，CLI 负责发出动作和接收结果。

这不是“没有风险”，而是**把凭证边界放在用户控制的浏览器会话里**。只要命令拥有浏览器上下文，理论上就可能读取或改变该账号能看到的内容，因此仍需使用专用浏览器 profile、限制插件来源并审查写操作。

### 3.4 Deterministic after discovery：发现阶段允许探索，运行阶段追求确定性

Deterministic（确定性）指相同输入在相同环境下，尽量得到相同的命令路径、输出形状和错误分类。OpenCLI 的理想流程是：

1. 通过浏览器侦察、网络观察和字段解码找到可靠路径；
2. 把路径固化为 adapter 或 pipeline；
3. 后续运行不再让 LLM 每次重新猜页面，而是执行已验证的逻辑；
4. 网站改变时，利用 `doctor`、`verify`、trace 和 fixture 发现回归。

因此它可以同时拥有“浏览器覆盖面”和“脚本的可复现性”，但二者之间的桥梁是**适配器维护**，不是魔法。

### 3.5 Dual-engine：声明式 pipeline + 命令式 TypeScript

OpenCLI 同时支持两种实现风格：

- **YAML pipeline（声明式管道）**：描述要经过哪些步骤，例如 fetch、download、browser、intercept、tap、transform。适合简单的数据抓取、字段映射和下载流程。
- **TypeScript adapter（命令式适配器）**：可以写多步骤逻辑、浏览器上下文代码、复杂字段解码、分页、错误处理和交互式流程。

声明式的优点是短、易审查、适合数据流；命令式的优点是表达力强、适合复杂站点。实际选型不是“YAML 一定更好”，而是看流程复杂度和维护成本。

## 4. 功能地图

| 功能域 | 能力 | 典型入口 | 适合场景 |
| --- | --- | --- | --- |
| 站点适配器 | 内置站点命令，返回表格、JSON、YAML、Markdown 或 CSV | `opencli list`、`opencli bilibili hot` | 信息检索、内容读取、下载、部分账号操作 |
| Browser Use | 打开页面、DOM 状态、点击、输入、选择、等待、提取、截图、网络观察 | `opencli browser <session> ...` | 未有现成 adapter 的一次性浏览器任务 |
| Adapter 工程 | 站点侦察、接口发现、字段解码、生成骨架、验证 fixture | `opencli browser recon ...`、`opencli browser verify ...` | 把一次性任务沉淀为可复用命令 |
| Electron 控制 | 通过 CDP 驱动 Cursor、Codex、ChatGPT 等桌面应用 | 具体桌面 adapter | 让 Agent 控制本地 AI/生产力应用 |
| 外部 CLI 枢纽 | 注册并透传 `gh`、`docker`、`vercel`、`lark-cli` 等已有二进制 | `opencli external register` | 统一发现入口，不重写成熟工具 |
| 插件系统 | 从 GitHub、Git URL 或本地目录安装 JS/TS 命令 | `opencli plugin install` | 团队或社区共享扩展 |
| 工程诊断 | 检查 daemon、扩展、浏览器连通性和环境 | `opencli doctor` | 首次安装和故障排查 |
| 可组合输出 | `table`、`json`、`yaml`、`md`、`csv` | `-f json`、`-f csv` | 管道、脚本、报表、Agent 消费 |
| 运行语义 | 结构化错误、稳定退出码、会话和 tab 管理 | `-v`、session、exit code | CI、重试、自动分支和调试 |

官方仓库当前列出的站点和桌面适配器会持续增删，**不要把 README 中的数量当成稳定 API**；程序化发现应优先使用：

```bash
opencli list -f json
opencli <site> --help
opencli <site> <command> --help
```

## 5. 技术架构详解

### 5.1 命令发现与统一注册表

OpenCLI 启动时会合并多个来源的命令：

```
内置 adapter                 clis/
用户 adapter                 ~/.opencli/clis/
插件                         ~/.opencli/plugins/
外部 CLI 注册                 external-clis.yaml + 本地配置
                              │
                              ▼
                        Command Registry
                              │
                              ▼
               opencli list / completion / execution
```

注册表中的一条命令通常包含这些元数据：

- `site`：命令所属的站点、应用或工具命名空间；
- `name`：命令名；
- `description`、`example`：给人和 Agent 看的说明；
- `args`：位置参数、可选参数、类型、默认值和帮助文本；
- `access`：`read` 或 `write`；
- `strategy`：公开 API、Cookie、拦截或 UI 等访问策略；
- `browser`：是否需要浏览器运行时；
- `columns`：结果行的预期字段；
- `func`：真正执行命令的函数。

它的意义是把“如何执行”与“如何发现”分开：Agent 不必读源码才能知道有哪些命令、参数和输出字段。

### 5.2 执行层与输出层

一次命令调用大致经历：

1. CLI 入口解析全局参数和子命令；
2. discovery 找到命令定义，并按需加载 adapter；
3. execution 校验参数，建立运行上下文；
4. adapter 或 pipeline 选择访问策略并执行；
5. 结果转换成统一行结构；
6. output 层根据 `--format` 渲染；
7. 成功或失败通过内容和退出码返回。

`--format json` 的价值不只是“好看”，而是让结果成为下游机器可消费的契约；`--format table` 适合人读，`csv` 适合表格处理，`md` 适合文档，`yaml` 适合配置和 Agent 上下文。

### 5.3 Browser Bridge：CLI 如何连接登录态 Chrome

浏览器型命令的主要链路是：

```
opencli 进程
    ⇄ WebSocket
本地 daemon（默认监听 localhost:19825）
    ⇄
Browser Bridge Chrome/Chromium 扩展
    ⇄
已登录的 Chrome 页面 / 隔离窗口
```

- **Daemon（守护进程）**：在后台持续运行、接收 CLI 请求、管理连接和会话生命周期的本地进程。
- **Browser Bridge**：安装在 Chrome/Chromium 中的轻量扩展，负责把命令转交给页面或浏览器目标。
- **WebSocket**：一种支持双向长连接的通信协议；CLI 可以发送动作，扩展可以持续回传页面状态、响应和错误。
- **隔离窗口 / profile**：OpenCLI 可以使用独立的浏览器上下文，避免把普通浏览和自动化混在一起；多个 Chrome profile 可以通过别名选择。

Browser Bridge 执行的是页面上下文中的 JavaScript 和浏览器动作，因此可以自然复用页面已经拥有的 Cookie、localStorage、同源权限和前端运行时。官方隐私说明强调扩展与本地 daemon 通过 localhost 通信，并宣称不采集或上传个人数据；但这不等于第三方 adapter、插件或本机日志都天然安全。

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：CLI 接到已登录 Chrome</p>
  <p class="article-embed-note-lead">命令先到本机 daemon，再经 Browser Bridge 扩展落到 Chrome 页面。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="CLI 经 daemon 和扩展到达 Chrome">
        <rect class="mixup-panel" x="16" y="50" width="118" height="90" rx="12"/>
        <text class="mixup-title" x="75" y="90" text-anchor="middle">CLI</text>
        <text class="mixup-caption" x="75" y="116" text-anchor="middle">opencli</text>
        <rect class="mixup-pipe" x="144" y="82" width="40" height="24" rx="10"/>
        <circle class="mixup-dot is-live" cx="164" cy="94" r="5"/>
        <rect class="mixup-panel is-accent" x="194" y="50" width="130" height="90" rx="12"/>
        <text class="mixup-title" x="259" y="90" text-anchor="middle">daemon</text>
        <text class="mixup-caption" x="259" y="116" text-anchor="middle">:19825</text>
        <rect class="mixup-pipe" x="334" y="82" width="40" height="24" rx="10"/>
        <circle class="mixup-dot is-live" cx="354" cy="94" r="5"/>
        <rect class="mixup-panel" x="384" y="50" width="118" height="90" rx="12"/>
        <text class="mixup-title" x="443" y="90" text-anchor="middle">扩展</text>
        <text class="mixup-caption" x="443" y="116" text-anchor="middle">Bridge</text>
        <rect class="mixup-pipe" x="512" y="82" width="28" height="24" rx="10"/>
        <circle class="mixup-dot is-live" cx="526" cy="94" r="5"/>
        <rect class="mixup-panel is-soft" x="550" y="50" width="74" height="90" rx="12"/>
        <text class="mixup-title" x="587" y="90" text-anchor="middle">Chrome</text>
        <text class="mixup-caption" x="587" y="116" text-anchor="middle">已登录</text>
      </svg>
    </div>
  </figure>
</section>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="opencli"
      src="/images/childlike-sketch-opencli-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">登录瓶</span>
  </div>
  <p class="duang-whisper-body">密码不用抄进脚本。账号权限还在那个 Chrome 窗口里。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

### 5.4 直接 CDP：连接远程 Chrome 或 Electron

**CDP（Chrome DevTools Protocol，Chrome DevTools 调试协议）**是 Chrome、Chromium 和 Electron 暴露的调试接口，支持导航、执行 JavaScript、读取 DOM、获取网络信息和控制页面。

OpenCLI 在不能使用扩展、需要远程浏览器或需要控制 Electron 应用时，可以通过：

```bash
export OPENCLI_CDP_ENDPOINT="http://127.0.0.1:9222"
export OPENCLI_CDP_TARGET="example.com"
```

连接到指定调试端点。远程 CDP 通常需要 SSH 反向隧道或受控网络，不能把调试端口裸露到公网；谁能访问 CDP，谁就可能控制该浏览器中的页面和会话。

### 5.5 访问策略：从稳定契约到脆弱内部接口

适配器开发最关键的决策不是“API 看起来比 DOM 高级”，而是**数据源是否有可依赖的外部契约**。建议按下面的梯度选择：

| 策略 | 含义 | 稳定性倾向 | 优点 | 主要代价 |
| --- | --- | --- | --- | --- |
| `PUBLIC_API` | 不需要登录，Node 侧直接请求公开 API | 高 | 快、简单、适合 CI | 只能拿公开能力 |
| `COOKIE_API` | 带浏览器 Cookie/CSRF 信息访问接口 | 较高 | 结构化、速度快、复用登录态 | 会话过期、认证细节需维护 |
| `DOM_STATE` | 读取 SSR HTML、hydration/bootstrap JSON 或页面状态 | 中 | 不一定依赖私有接口 | 页面结构或状态字段可能变化 |
| `UI_SELECTOR` | 通过可见 UI、DOM 或无障碍语义执行操作 | 中 | 对写操作和用户可见流程自然 | 需要处理弹窗、页面状态和选择器漂移 |
| `PAGE_FETCH` | 在页面同源上下文中发起 fetch | 中低 | 可以借用页面运行时和同源权限 | 内部 API 无外部契约，改版易坏 |
| `INTERCEPT` | 触发页面自然动作并拦截目标网络响应 | 中低 | 能处理复杂签名或请求生成 | 归因、分页、响应匹配和回归成本高 |

官方 adapter-author 流程建议优先 `PUBLIC_API` / `COOKIE_API`；只有公开接口不可用、UI 无法表达目标或页面请求必须由运行时产生时，才承担 `PAGE_FETCH` / `INTERCEPT` 的维护成本。

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：访问策略从稳到脆</p>
  <p class="article-embed-note-lead">能走公开契约就别碰页面内部。越往右，维护账越重。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="PUBLIC_API COOKIE_API PAGE_FETCH INTERCEPT 策略梯度">
        <rect class="mixup-chip is-accent" x="16" y="46" width="140" height="96" rx="10"/>
        <text class="mixup-title" x="86" y="88" text-anchor="middle">PUBLIC_API</text>
        <text class="mixup-caption" x="86" y="114" text-anchor="middle">外部契约</text>
        <rect class="mixup-chip" x="172" y="46" width="140" height="96" rx="10"/>
        <text class="mixup-title" x="242" y="88" text-anchor="middle">COOKIE_API</text>
        <text class="mixup-caption" x="242" y="114" text-anchor="middle">复用登录态</text>
        <rect class="mixup-chip" x="328" y="46" width="140" height="96" rx="10"/>
        <text class="mixup-title" x="398" y="88" text-anchor="middle">PAGE_FETCH</text>
        <text class="mixup-caption" x="398" y="114" text-anchor="middle">页面同源</text>
        <rect class="mixup-chip is-accent" x="484" y="46" width="140" height="96" rx="10"/>
        <text class="mixup-title" x="554" y="88" text-anchor="middle">INTERCEPT</text>
        <text class="mixup-caption" x="554" y="114" text-anchor="middle">拦截响应</text>
        <circle class="mixup-dot is-live" cx="86" cy="172" r="5"/>
        <text class="mixup-caption" x="320" y="196" text-anchor="middle">左稳右脆 · 先公开再拦截</text>
      </svg>
    </div>
  </figure>
</section>

### 5.6 Pipeline 引擎：把数据处理拆成步骤

Pipeline（管道）把一个命令拆成可组合步骤。官方架构文档列出的步骤包括：

- `fetch`：请求并取得响应；
- `browser`：让浏览器完成导航或交互；
- `intercept`：观察或捕获目标请求/响应；
- `tap`：在数据流某个节点观察或记录；
- `transform`：字段映射、过滤、扁平化、类型转换；
- `download`：把媒体或文件写入本地。

Pipeline 内通常还需要模板展开：把上一步的字段作为下一步 URL、文件名或参数。它很像 Unix 管道，但每个节点不只是文本，而可能是 JSON、页面状态、网络响应或文件对象。

### 5.7 Agent-native Browser：为什么不是简单的“点第几个按钮”

给 Agent 用的 `opencli browser` skill 设计了一个更严格的目标契约：

1. 先 `state` 或 `find` 检查页面，不能凭记忆猜元素；
2. 交互目标可以是数字 ref，也可以是 CSS selector；
3. 每个动作返回 `matches_n` 和 `match_level`；
4. `exact` 表示精确匹配，`stable` 表示软属性发生变化但仍是同一元素，`reidentified` 表示旧 ref 失效后重新识别到了唯一候选；
5. 失败返回结构化 `{ error: { code, message, hint, candidates } }`，调用者应根据 `code` 分支，而不是解析自然语言错误；
6. 写入后需要验证，例如输入后读取 value，提交后检查页面状态。

这套设计把“页面可能动态变化”变成显式信号，降低 Agent 因为旧索引、重复按钮或 SPA 重渲染而误操作的概率。

### 5.8 Session、tab 与 profile

- **Session（会话）**：一组连续的浏览器操作上下文；同一个 session 名称用于复用状态。
- **Tab target / target ID**：浏览器调试层识别某一个标签页的 ID；多标签时可以明确把命令路由到指定 tab。
- **Tab lease（标签页租约）**：运行时暂时占用某个 tab 的所有权；命令结束或显式 close 后释放。
- **Ephemeral session**：一次性会话，任务结束后释放 tab。
- **Persistent session**：持久会话，同一站点的连续命令复用稳定页面，适合多步交互。

相关配置包括：

| 配置 | 作用 |
| --- | --- |
| `OPENCLI_PROFILE` | 多个 Chrome profile 时选择别名或 contextId |
| `OPENCLI_WINDOW` | 覆盖前台或后台窗口策略 |
| `OPENCLI_SITE_SESSION` | 覆盖 adapter 的 ephemeral/persistent 会话策略 |
| `OPENCLI_BROWSER_CONNECT_TIMEOUT` | 等待浏览器连接的秒数 |
| `OPENCLI_BROWSER_COMMAND_TIMEOUT` | 单个浏览器动作的超时秒数 |
| `OPENCLI_CDP_ENDPOINT` | 直接 CDP 端点 |
| `OPENCLI_CDP_TARGET` | 按 URL 子串筛选 CDP target |
| `OPENCLI_VERBOSE` | 输出详细日志 |
| `DEBUG_SNAPSHOT` | 输出 DOM snapshot 调试信息 |

## 6. 一次调用是怎样完成的：端到端数据流

以 `opencli bilibili hot --limit 5 -f json` 为例：

1. **解析**：CLI 识别站点、命令、`limit` 和输出格式。
2. **发现**：从统一注册表加载 Bilibili 的 `hot` adapter，并读取其参数、访问策略和列定义。
3. **选择运行时**：因为命令需要浏览器会话，execution 层唤起或连接 daemon 和 Browser Bridge。
4. **解析目标**：选择合适的 Chrome profile、窗口模式、session 和 tab。
5. **执行策略**：adapter 可能在页面上下文中调用接口、读取页面状态，或使用 UI / network intercept。
6. **拿到响应**：返回 JSON、HTML、页面 DOM 状态或拦截到的网络响应。
7. **字段解码**：把站点内部字段、单位、时间戳和嵌套对象转换成对外列。
8. **校验结果**：处理空结果、未登录、超时、分页和字段缺失。
9. **格式化**：输出成 JSON；如果是终端交互则也可以渲染为表格。
10. **结束**：返回结果和退出码；调用者可以用 shell 或 Agent 继续处理。

公开数据命令的差别在于第 3～5 步可以直接 `fetch`，不需要浏览器。Electron 适配器则把第 3～5 步切换为直接 CDP target。

## 7. 怎么安装和使用

### 7.1 安装运行时

桌面用户可以安装 OpenCLIApp；纯 CLI、服务器或 CI 场景可以使用 npm：

```bash
node --version
npm install -g @jackwener/opencli
```

当前官方入门文档要求 npm 安装时使用 **Node.js >= 20.18.1**。

浏览器型命令还需要安装 OpenCLI Browser Bridge 扩展：

1. 从 Chrome Web Store 安装 OpenCLI 扩展，或从 GitHub Releases 下载扩展压缩包；
2. 手动安装时，打开 `chrome://extensions`，启用开发者模式并加载已解压目录；
3. 运行诊断：

```bash
opencli doctor
```

在 `doctor` 通过前，不要把“站点返回空数据”直接归因于 adapter；可能只是扩展、daemon、Chrome 或调试端口没有连接。

### 7.2 使用内置命令

```bash
opencli list
opencli hackernews top --limit 5
opencli bilibili hot --limit 5
opencli zhihu search "大模型"
```

建议在自动化和 Agent 场景显式指定 JSON：

```bash
opencli bilibili hot --limit 5 -f json | jq '.[0:5]'
opencli hackernews top --limit 10 -f csv > hackernews.csv
opencli zhihu hot -f md > zhihu-hot.md
```

所有命令的参数和当前支持范围都可能变化，先查帮助：

```bash
opencli <site> --help
opencli <site> <command> --help
```

### 7.3 直接驱动任意网页

当没有现成 adapter，或只需要一次性完成任务时，可以使用 Browser Use 原语。`<session>` 是必填的位置参数：

```bash
opencli browser work open https://example.com
opencli browser work state
opencli browser work find "button[type=submit]"
opencli browser work click "button[type=submit]"
opencli browser work fill "input[name=q]" "OpenCLI"
opencli browser work get text "main"
opencli browser work extract
opencli browser work network
opencli browser work close
```

更稳妥的操作顺序是：

1. `state` 或 `find` 查看当前页面；
2. 优先使用刚刚得到的数字 ref，避免手写脆弱选择器；
3. 页面导航、提交或 SPA 路由变化后重新 `state`；
4. 输入、选择或提交后重新读取值或页面状态；
5. 重要写操作完成后显式核对结果。

AI Agent 可以安装官方 skills：

```bash
npx skills add jackwener/opencli
```

也可以只安装需要的 skill：

```bash
npx skills add jackwener/opencli --skill opencli-browser
npx skills add jackwener/opencli --skill opencli-adapter-author
npx skills add jackwener/opencli --skill opencli-autofix
npx skills add jackwener/opencli --skill opencli-usage
```

### 7.4 自定义 adapter：从一次任务到可复用命令

推荐的完整流程：

```bash
# 1. 环境检查
opencli doctor

# 2. 侦察目标站点，识别页面模式和候选接口
opencli browser recon analyze https://example.com

# 3. 生成适配器骨架
opencli browser recon init mysite/search

# 4. 编辑 ~/.opencli/clis/mysite/search.js 或 .ts
# 5. 验证真实运行、输出形状和 fixture
opencli browser recon verify mysite/search
```

快速的本地私人 adapter 路径也可以使用：

```bash
opencli browser init mysite/search
# 编辑 ~/.opencli/clis/mysite/search.js
opencli browser verify mysite/search
opencli mysite search "keyword" -f json
```

开发时不要从“我能看到一个请求”直接跳到生产 adapter。应记录：

- 站点模式：SPA、SSR、JSONP、Token 或 Streaming；
- 请求或页面状态的来源；
- Cookie、CSRF、localStorage 或页面 runtime 的认证来源；
- 多个输入下的 replay 结果；
- 分页、空结果和错误行为；
- 输出列与网页可见值的对应关系。

### 7.5 安装和开发插件

```bash
opencli plugin install github:ByteYue/opencli-plugin-github-trending
opencli plugin list
opencli plugin update --all
opencli plugin uninstall github-trending
```

长期维护的个人命令建议放在自己的 Git 仓库，再通过 `file://` 安装；临时命令可以放在 `~/.opencli/clis/`。插件本质上是在本机被发现、加载并执行的 JS/TS 代码，应像安装依赖一样审查来源和版本。

### 7.6 接入已有本地 CLI

如果能力已经由一个成熟二进制提供，不要为了统一入口重写它：

```bash
opencli external register my-tool \
  --binary my-tool \
  --install "npm i -g my-tool" \
  --desc "My internal CLI"

opencli external list
opencli my-tool --help
```

外部 CLI 透传通常保留原始 stdin/stdout/stderr 和退出码，所以它更像统一发现和分发层，而不是数据转换层。

## 8. Adapter 开发的技术方法

### 8.1 先做站点侦察，再决定策略

站点侦察（recon）要回答三件事：

1. 数据在浏览器里是否真的可见；
2. 数据是否是 HTTP、JSON、HTML 或可观察的页面状态；
3. 是否需要实时推送；如果只有实时推送而没有可用的 HTTP 读取路径，OpenCLI 的常规 adapter 方式可能不合适。

API 发现通常按以下顺序进行：

```
network 观察
   → 页面初始状态 / hydration JSON
      → bundle / script 搜索
         → token / Cookie 来源追踪
            → interceptor 兜底
```

**Hydration（注水）**是 SSR 页面把服务器初始数据交给前端 JavaScript 接管的过程；很多 SPA 会把初始数据放在脚本或全局状态里。它有时比抓最终 DOM 更稳定，但不代表字段格式就是公开契约。

### 8.2 用证据而不是猜测写 adapter

官方 adapter-author 约束在写代码前形成 strategy note：

```
Strategy: PUBLIC_API | COOKIE_API | PAGE_FETCH | INTERCEPT | DOM_STATE | UI_SELECTOR
Contract: stable | visible-ui | internal-unstable
Evidence:
- observed request/state: 观察到的 endpoint 或页面状态
- auth source: none / browser cookie / csrf / localStorage / page runtime
- replay result: 状态码、内容类型、非空样本形状
```

如果选择 `PAGE_FETCH` 或 `INTERCEPT`，还要说明为什么公开 API、Cookie API、DOM 或 UI 不足够。这个记录的意义是让未来维护者知道：这条路径是有外部契约，还是只能依赖当前站点实现。

### 8.3 输出设计优先于字段堆砌

好的 adapter 输出应该：

- 使用稳定、语义清晰的 camelCase 字段；
- 把识别列放在前面，例如 `id`、`url`、`title`；
- 明确金额、计数、百分比、时间的单位；
- 对可空字段保持一致，不要把缺失值随意变成字符串；
- 列表命令尽量返回能直接喂给详情命令的 ID；
- 不把整份原始响应无差别倾倒给 Agent。

### 8.4 TypeScript adapter 的核心契约

官方 TypeScript 指南的核心结构类似：

```tsx
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

cli({
  site: 'mysite',
  name: 'search',
  description: 'Search MySite',
  access: 'read',
  example: 'opencli mysite search <query> -f yaml',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'query', required: true, help: 'Search query' },
    { name: 'limit', type: 'int', default: 10, help: 'Max results' },
  ],
  columns: ['title', 'url', 'date'],
  func: async (page, kwargs) => {
    const { query, limit = 10 } = kwargs;
    await page.goto('https://www.mysite.com');
    const data = await page.evaluate(async (q) => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(String(q))}`, {
        credentials: 'include',
      });
      return (await res.json()).results;
    }, query);
    if (!Array.isArray(data)) {
      throw new CommandExecutionError('Unexpected response');
    }
    if (!data.length) {
      throw new EmptyResultError('mysite search', 'Try another keyword');
    }
    return data.slice(0, Number(limit)).map((item) => ({
      title: item.title,
      url: item.url,
      date: item.created_at,
    }));
  },
});
```

重点不是照抄代码，而是理解其边界：

- `cli(...)` 把命令注册到统一 registry；
- `access: 'read' | 'write'` 是副作用提示，不是完整权限系统；
- `Strategy.COOKIE` 表示利用浏览器会话；
- `page.evaluate` 在页面上下文执行，Node 侧变量要通过可序列化参数传入；
- `columns` 是对外输出契约；
- 预期失败应使用专门的错误类型，以便顶层统一渲染和返回退出码。

### 8.5 验证、fixture 与回归

- **Fixture（测试夹具）**：保存一份可重复使用的输入与期望输出，用来验证字段、列、类型和行数，不必每次都依赖实时页面。
- `opencli browser verify`：验证 adapter 是否能运行、输出是否满足约定；通过后应收紧 `patterns`、`notEmpty` 和 `rowCount` 等检查。
- 真实网页肉眼对照仍然必要：fixture 通过只说明“输出形状匹配”，不自动证明字段语义没有错位。
- 私人消息、邮箱、账号信息等高敏数据不应直接落盘到长期 fixture；应使用合成样本或脱敏样本。

## 9. 错误处理、退出码与自动化

OpenCLI 的退出码遵循 Unix `sysexits.h` 风格，便于 shell、CI 和 Agent 分支处理：

| 退出码 | 含义 | 典型原因 |
| --- | --- | --- |
| `0` | 成功 | 命令正常完成 |
| `1` | 通用错误 | 未分类异常 |
| `2` | 用法错误 | 参数错误或未知命令 |
| `66` | 空结果 | 请求成功但没有数据 |
| `69` | 服务不可用 | Browser Bridge 未连接 |
| `75` | 临时失败 | 超时，可按策略重试 |
| `77` | 需要认证 | 目标站点未登录 |
| `78` | 配置错误 | 凭证或配置缺失、格式不正确 |
| `130` | 被中断 | Ctrl-C / SIGINT |

脚本不要只检查“输出是不是空字符串”，可以根据退出码分支：

```bash
opencli spotify status -f json
case $? in
  0) echo "ready" ;;
  69) echo "start or repair Browser Bridge" ;;
  75) echo "retry with backoff" ;;
  77) echo "login is required" ;;
  *) echo "opencli failed" ;;
esac
```

注意：重试只适用于读操作或明确幂等的操作。发送消息、发布内容、点赞、关注、购买、删除等写操作可能已经在远端生效，超时后不能盲目重放。

<details class="marginalia interview" open>
  <summary>写操作别盲着重放</summary>
  </div>
</details>

## 10. 安全、隐私与现实边界

### 10.1 “不存密码”不等于“零风险”

OpenCLI 的优势是复用浏览器登录态，减少把密码、OAuth token 或 API key 复制进脚本的需要；但浏览器会话本身就是高权限能力。一个有问题的 adapter 或插件可能读取页面内容、调用账号权限或执行远端写操作。

建议：

- 使用专用 Chrome profile，不要直接暴露个人主账号；
- 把读操作和写操作分开，写操作要求明确确认；
- 只安装可信来源、可审查、可锁定版本的插件；
- 不把包含 Cookie、消息、邮箱、订单或个人资料的原始响应写入日志和 fixture；
- 远程 CDP 只绑定 localhost 或受控隧道；
- 开启详细日志前确认不会泄露页面数据；
- 遇到验证码、风控、签名或访问控制时，走合法的 UI / 官方 API 路径，不尝试绕过。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="opencli"
      src="/images/childlike-sketch-opencli-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">固化瓶</span>
  </div>
  <p class="duang-whisper-body">先侦察，再固化。网站改版不是意外，是这个模式的日常。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

### 10.2 站点变更是第一类故障

浏览器适配器依赖的契约可能来自公开 API、Cookie 会话、可见 UI 或站内未文档化接口。站点改版可能导致：

- 选择器找不到或对应到错误元素；
- JSON 字段、单位、分页和排序改变；
- token / CSRF 生成方式变化；
- 200 状态但返回登录页、风控页或空数据；
- 业务动作成功但响应超时，造成“结果不确定”。

因此生产使用应把 `doctor`、focused verify、fixture、日志留存、失败告警和 adapter 版本管理视为必需品，而不是可选优化。

### 10.3 合规与产品边界

使用前应检查目标网站的服务条款、隐私要求、版权和数据处理规则。尤其是公开可见，不代表可以无限制复制、再分发或自动化操作；登录态可见，更不代表可以绕过产品设计的访问边界。

## 11. 与相邻技术的区别

| 技术 | 强项 | 与 OpenCLI 的关键差别 |
| --- | --- | --- |
| 官方 API 客户端 | 契约清晰、稳定、适合大规模服务化 | 需要官方开放能力和独立认证；OpenCLI 可补足“只有网页登录能力”的场景 |
| Playwright / Puppeteer | 底层浏览器自动化能力强，适合测试和复杂流程 | 它们是自动化库；OpenCLI 在其上增加命令注册、adapter 生态、输出契约和 Agent 发现面 |
| 通用 LLM Browser Agent | 面对未知页面灵活，能临时规划路径 | 每次运行可能重新推理，成本和结果稳定性更难控制；OpenCLI 的 adapter 让重复路径更确定 |
| Scrapy / Crawl4AI | 大规模抓取、并发和爬虫工程能力 | 目标不同；OpenCLI 更偏登录态产品操作、命令组合和桌面应用控制 |
| MCP | 为模型提供工具发现和调用协议 | MCP 是协议层；OpenCLI 是运行时/命令生态，可以被 Agent 作为工具执行，但二者不是同一个东西 |
| OpenCLI Specification（OCS） | 定义 CLI 应如何被机器理解和调用的规范 | 与 `jackwener/OpenCLI` 是不同项目，不要因为名字相同而混为一谈 |

<details class="marginalia" open>
  <summary>别跟 OCS 混</summary>
  </div>
</details>

## 12. 适合落地的使用模式

### 模式 A：Agent 的网站工具层

```
用户目标
  → Agent 判断需要什么数据
  → opencli list -f json 发现命令
  → 调用具体 adapter
  → JSON 进入分析、总结或下一步动作
```

适合做热点汇总、内容检索、账号内信息读取、跨站点研究和资料下载。

### 模式 B：一次性 Browser Use 到稳定 adapter

```
一次性浏览器探索
  → 记录网络 / 页面状态 / 认证来源
  → 选择最稳定策略
  → 固化字段和错误语义
  → verify + fixture
  → 以后使用 opencli <site> <command>
```

适合某个站点有固定高频任务，但没有成熟 API 或现成命令的团队。

### 模式 C：统一 CLI Hub

```
opencli gh ...
opencli docker ...
opencli my-company-tool ...
opencli xiaohongshu ...
```

适合个人工作站或 Agent 主机：已有 CLI 不必重写，网站 adapter 也不必另起入口。

### 模式 D：让 Agent 控制桌面 AI 应用

通过 CDP 把 Cursor、Codex、ChatGPT 等 Electron 应用变成命令表面，形成“Agent 控制另一个 Agent 或桌面工具”的自动化链路。但这类能力的权限和误操作风险更高，应先从读取、状态查询和草稿生成开始。

## 13. 专业名词解释

| 名词 | 通俗解释 |
| --- | --- |
| CLI | Command-Line Interface，命令行界面；通过文字命令调用程序，容易脚本化和组合 |
| Runtime | 运行时；真正负责加载、执行命令并连接浏览器或系统的程序环境 |
| Adapter | 适配器；把某个站点的具体实现转换成统一命令和输出契约 |
| Registry | 注册表；记录所有可发现命令及其参数、策略和输出元数据的目录 |
| Manifest | 清单；用文件描述 adapter、插件或命令的名称、版本和能力 |
| Agent-native | 面向 Agent 设计；强调机器可发现、结构化输入输出、明确错误和副作用 |
| Deterministic | 确定性；相同输入和环境下尽量复现相同路径、结果形状和错误分类 |
| Browser Bridge | 浏览器桥接扩展；把本地 CLI/daemon 与 Chrome 页面连接起来 |
| Daemon | 守护进程；后台持续运行并管理连接、会话或任务的本地进程 |
| WebSocket | 双向长连接协议；适合 CLI 与浏览器扩展持续交换动作和事件 |
| CDP | Chrome DevTools Protocol；控制 Chrome、Chromium 或 Electron 的调试协议 |
| DOM | Document Object Model；浏览器把 HTML 页面表示成可查询、可交互的树结构 |
| DOM snapshot | DOM 快照；在某一时刻对页面结构和可交互元素的结构化观察 |
| CSS selector | CSS 选择器；用标签、属性或层级表达要操作的页面元素 |
| Ref | 页面快照给元素分配的短引用；页面变化后可能失效，不能跨快照盲用 |
| Target ID | 浏览器调试层的页面或 tab 标识；多 tab 时用于精确路由命令 |
| Tab lease | 标签页租约；运行时暂时取得某个 tab 的使用权，结束后释放 |
| Session | 会话；一组可连续复用的浏览器操作上下文 |
| API endpoint | 接口端点；服务接收请求的 URL、方法和参数组合 |
| Cookie | 浏览器保存的小段会话数据；常用于表示登录状态或偏好 |
| CSRF | 跨站请求伪造防护；网站用来确认请求来自可信页面或会话的机制 |
| Same-origin | 同源；协议、域名和端口都相同，浏览器据此限制页面间访问权限 |
| Intercept | 拦截；在页面自然发起请求时捕获目标网络请求或响应 |
| Hydration | 注水；SSR 输出的 HTML 被前端 JavaScript 接管并恢复交互状态的过程 |
| SSR | Server-Side Rendering，服务端渲染；服务器先生成 HTML，再由浏览器接管 |
| SPA | Single-Page Application，单页应用；页面不完全刷新，前端通过路由和 API 更新内容 |
| JSONP | 一种较旧的跨域数据模式；服务返回 JavaScript 调用而不是纯 JSON |
| Streaming | 流式传输；响应不是一次性完成，而是持续发送数据片段或事件 |
| Pipeline | 管道；把请求、浏览器动作、转换、拦截和下载拆成可组合步骤 |
| Declarative | 声明式；描述想要的步骤和结果，不详细规定每一步如何实现 |
| Imperative | 命令式；按程序顺序明确写出每个动作、条件和分支 |
| Structured envelope | 结构化信封；结果中同时包含值、匹配数、置信级别或错误代码等机器字段 |
| Fixture | 测试夹具；保存输入和期望输出，用于重复验证 adapter 是否回归 |
| Replay | 重放；用相同或替换参数再次执行已观察到的请求或流程，以验证可靠性 |
| Idempotent | 幂等；同一操作重复执行，最终状态与执行一次相同；发布、购买、删除通常不是天然幂等 |
| TTY | 终端设备；程序可据此区分交互式输出和被管道接收的机器输出 |
| Exit code | 退出码；进程结束时返回给 shell/CI 的整数状态，用于自动分支和重试 |
| Passthrough | 透传；不重写外部 CLI 的参数、标准输入输出和退出码，只统一入口 |
| Supply-chain risk | 供应链风险；第三方插件、依赖或安装脚本可能夹带恶意代码或脆弱依赖 |

## 14. 最终评价

OpenCLI 最有价值的抽象可以概括成：

> **把“用户通过浏览器已经能完成的能力”，经过侦察、适配、验证和结构化输出，变成 Agent 与脚本都能调用的命令表面。**

它的技术护城河不只是“能控制浏览器”，而是下面这条完整链路：

- 多来源命令发现和统一 registry；
- Browser Bridge、daemon、CDP 和外部 CLI 的运行时编排；
- `PUBLIC_API`、`COOKIE_API`、UI、DOM、页面 fetch、拦截等策略选择；
- adapter / pipeline 的可复用封装；
- 面向 Agent 的结构化状态、匹配置信度和错误代码；
- 输出格式、退出码、fixture、verify 和插件分发。

如果只是偶尔打开网页，直接使用浏览器或现成 API 更简单；如果要让 Agent 高频、可重复、可组合地操作多个没有好 API 的网站和桌面应用，OpenCLI 是一个值得评估的“浏览器能力产品化层”。落地时应从只读命令开始，固定 JSON 输出，使用独立登录 profile，锁定插件来源，并为站点改版和写操作建立明确的验证与审计机制。

## 15. 参考资料

- [OpenCLI 官方仓库](https://github.com/jackwener/opencli)
- [中文 README](https://github.com/jackwener/opencli/blob/main/README.zh-CN.md)
- [Getting Started](https://github.com/jackwener/opencli/blob/main/docs/guide/getting-started.md)
- [Architecture](https://github.com/jackwener/opencli/blob/main/docs/developer/architecture.md)
- [Extending OpenCLI](https://github.com/jackwener/opencli/blob/main/docs/guide/extending-opencli.md)
- [Plugins](https://github.com/jackwener/opencli/blob/main/docs/guide/plugins.md)
- [TypeScript Adapter Guide](https://github.com/jackwener/opencli/blob/main/docs/developer/ts-adapter.md)
- [opencli-browser skill](https://github.com/jackwener/opencli/tree/main/skills/opencli-browser)
- [opencli-adapter-author skill](https://github.com/jackwener/opencli/tree/main/skills/opencli-adapter-author)
- [Exit Codes](https://github.com/jackwener/opencli/blob/main/docs/guide/exit-codes.md)
- [Privacy Policy](https://github.com/jackwener/OpenCLI/blob/main/PRIVACY.md)
- [OpenCLI 官网](https://opencli.info/)
