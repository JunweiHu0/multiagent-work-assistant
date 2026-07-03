# SuperNoNo v1.0 收尾与 Multiagent 工作助理战略评审

- 评审日期：2026-07-03
- 评审范围：`codex-task-pet`（代码 + 文档 + 打包产物）、`multiagent-work-assistant-prd.md`
- 评审性质：产品 + 架构 review，不改代码
- 风险标记：P0 = 阻塞发布/有实质风险；P1 = 应尽快处理但不阻塞收尾；P2 = 记录在案，别花时间

---

## 1. Executive Summary

**结论先行：v1.0 可以收尾，而且应该立刻收尾。** 这个项目的核心链路是真的，不是 demo：

- Codex Desktop plugin hooks（PreToolUse / PostToolUse / PermissionRequest）已在真实 Codex 任务中端到端验证，事件带 `adapter: "codex-plugin-hooks"` 到达桥接层。这在 handoff 文档里有完整的 root cause 记录（`${PLUGIN_ROOT}`、绝对 node 路径、`shell_command|Bash` matcher），是扎实的工程结论，不是"看起来能跑"。
- notify wrapper 是**独立的 turn-level fallback**，不是主链路，定位正确（见 2.5 节详细判断）。
- 协议、桥接、状态机、UI 分层干净，2000 行左右的 renderer 代码质量高于典型个人项目。

**但"可以收尾"不等于"可以公开发布"。** 当前有一个真正的 P0：**Live2D 模型资产的版权问题**。`vip-nono` 模型大概率来自被 .gitignore 掉的那个克隆参考项目，README 自己都写了"替换为完全原创的公开视觉资产"，而 v1.0.0 的 portable zip 里**打包了这套模型**。此外打包脚本把你本机的 `notify-wrapper.config.json`（含个人路径）一起复制进了公开 zip。这两件事必须在两天内处理，其余都可以推迟。

**两天内必须处理（按优先级）：**

1. **P0** — 资产合规：公开构建剔除 nono Live2D 模型（SVG fallback 已存在，可直接用），或者明确 v1.0 只做私有/展示用途不上传公网。
2. **P0** — 打包卫生：packaging 脚本排除 `notify-wrapper.config.json` / `notify-observed.json`，重新打 zip。
3. **P1** — 桥接安全：`/signal` 无鉴权 + `shell.openPath` 组成一条真实攻击链（浏览器网页可伪造 `completed` 事件塞入恶意 artifact 路径，用户点"打开产物"即执行）。加 Origin/Host 校验 + openPath 白名单约 30 行代码，值得在收尾时做掉。
4. **P1** — 文档收口：一份能让第二个人从 zip 到"宠物动起来"的 README 路径。

**应该推迟、不要阻碍 v1.0 结束的：** Node 路径自动探测安装脚本、installer/签名、legacy_notify 206、多显示器、macOS、renderer 重构、任何动画/视觉打磨。

**Multiagent 是否值得作为下一阶段主线：是，且时机很好。** 三个理由：

1. 你已经把最难的部分做完了——agent-neutral 协议 + 本地桥 + 一个真实验证过的 adapter。multiagent 的边际成本很低。
2. **Claude Code 有官方 hooks 机制**（settings.json 里的 PreToolUse / PostToolUse / Notification / Stop 等，JSON 走 stdin），和你已经趟通的 Codex plugin hooks 高度同构。PRD 里 M3"调研 Claude Code 是否有 hook"这个问题**现在就有答案：有，而且是官方文档化的**。第二个 adapter 会比第一个容易得多。
3. 真正的产品价值点（"多个 agent 并行时，我什么时候需要介入"）只有在 multiagent 场景下才成立。单 agent 桌宠继续打磨是在装饰一个玩具；multiagent 才是把它变成工具。

---

## 2. SuperNoNo v1.0 收尾清单

### 2.1 Must Fix Before v1.0（两天内）

| # | 事项 | 级别 | 为什么 | 怎么做 | 工作量 |
|---|------|------|--------|--------|--------|
| M1 | Live2D 模型资产合规 | **P0** | `src/renderer/assets/live2d/nono/`（moc3/贴图/9 个动作）+ `vip-nono.model3.json` 来源不明，README 与 PRD 均承认非原创（"替换为完全原创的公开视觉资产"、"IP风险：名称和形象接近原超能NONO"）。v1.0.0 zip 已将其打包。公开分发 = 现实的侵权风险。`live2dcubismcore.min.js` 是 Live2D 专有许可，再分发需遵守其发布条款。 | 二选一：(a) 公开构建剔除 nono 模型目录，靠已有的 SVG fallback 出货（pet.js 已实现 Live2D 失败自动降级）；(b) v1.0 定位为私有/面试展示构建，不上传公网，README 明示。推荐 (a)+(b) 组合：仓库开源但模型不进 repo/zip。 | 半天 |
| M2 | 打包脚本泄漏本机运行时文件 | **P0** | `tools/package-win-portable.js` 的 `appFiles` 包含整个 `adapters/` 目录，`fs.cpSync` 会把 .gitignore 无法拦截的 `notify-wrapper.config.json`（含你的 Windows 用户路径、Codex 安装路径、备份文件路径）和 `notify-observed.json` 复制进公开 zip。 | 打包时排除这两个文件（或只复制白名单文件）；重打 zip 并抽查 `resources/app/adapters/`。 | 1 小时 |
| M3 | 桥接 → openPath 攻击链 | **P1** | `/signal` 无任何鉴权且不校验 Content-Type/Origin。浏览器里任意网页可以用 no-CORS 的 simple request POST 到 `127.0.0.1:4174/signal`，伪造 `completed` 事件并携带 `artifacts: [{path: "C:\\...\\evil.exe"}]` 或 UNC 路径；用户在面板点"打开产物"时 `shell.openPath` 直接执行。这是完整的本地社工链路，不是理论风险。 | 三层便宜防御，全做也就 ~30 行：(1) 桥接层拒绝带 `Origin` 头的请求（本地 CLI/adapter 不会带，浏览器一定带）；(2) 校验 `Host` 为 `127.0.0.1:4174`；(3) `sn:open-path` 只打开已存在、且扩展名不在 `.exe/.bat/.cmd/.ps1/.scr/.lnk` 黑名单内的路径，否则改为 `showItemInFolder`。 | 半天 |
| M4 | 文档收口：一条完整的安装路径 | **P1** | 现在的知识分散在 README（还停留在"原型"口径，未提及 bridge/plugin）、INSTALL.md（质量很高）、adapter README、release notes 四处。别人拿到 zip 后没有一条从零到"宠物对真实 Codex 任务有反应"的主线。 | README 增加"v1.0 实际能做什么"和三步 quickstart（跑 app → 装 plugin → trust hooks → 验证），指向 INSTALL.md；release notes 补上资产与隐私说明。不写新内容，只做收口。 | 半天 |

### 2.2 Should Fix Soon（v1.0 后两周内，随 Phase 1 顺手做）

| # | 事项 | 级别 | 说明 |
|---|------|------|------|
| S1 | hooks.json 硬编码 Node 路径 | P1 | `C:\PROGRA~1\nodejs\node.exe` 是本机专属。这是其他用户安装 plugin 的第一摩擦点。做一个 `setup` 脚本：探测 node 路径 → patch hooks.json → 提示刷新 plugin cache + re-trust。INSTALL.md 已把手动改法写清楚了，所以不阻塞 v1.0。 |
| S2 | notify wrapper 不转发 thread-id / turn-id | P1 | probe 已确认 notify payload 携带稳定的 `thread-id`/`turn-id`（不透明、非敏感），但 wrapper 只记录 shape 不转发。multiagent 需要 sessionId 区分并发会话——这是 Phase 1 的第一块砖，改动 ~10 行。 |
| S3 | 桥接连接状态可见性 | P2 | 端口被占时 bridge 静默禁用（只打 console log），用户无法从 UI 分辨"没接上"和"没事件"。托盘或状态栏加一个 connected/demo 指示。 |
| S4 | 事件与优先级：普通事件可覆盖 attention | P2 | 当前 `permission_required` 之后到达的 `turn_ended` 会 `_resetFlags()` 清掉等待授权标志。单会话下 Codex 不会这样发，但双 adapter（plugin + notify）并存时理论上可能。Phase 1 做 attention policy 时一起解决，现在不动。 |

### 2.3 Can Defer（明确推迟，不设时间点）

- Windows installer / 代码签名 / 自动更新（portable zip 对 v1.0 的"可展示"足够；SmartScreen 警告在 README 说明即可）。
- macOS / Linux 构建。
- 多显示器 dock（目前只用 primary display）、全局快捷键冲突处理。
- 无障碍、多语言 UI。
- renderer 引入 TypeScript / 框架 / 单元测试基建。
- `SUPERNONO_BRIDGE_TOKEN` 本地鉴权（M3 的 Origin/Host 校验对当前威胁模型够用；token 等到有真实多用户/多进程需求再说）。

### 2.4 Do Not Spend More Time On（停止投入）

- **legacy_notify Windows 206**：这是 Codex 自己的 notify 链在长会话下超命令行长度限制，你的 plugin hooks 主链路不受影响，wrapper 只是 fallback。文档里已定性为独立问题——保持现状，等 Codex 侧修或者 plugin hooks 完全取代 notify 后自然消亡。
- **宠物动画/视觉打磨**：hover 反应、能量条、气泡节流已经够展示了。每多打磨一天，multiagent 就晚一天。
- **Codex 原生 pet 资产兼容**（`pet.json + spritesheet.webp` 导入）：docs 里作为方向可以留着，v1.x 不做。
- **更多 Codex 事件的精细映射**（比如从 PostToolUse 里区分测试失败原因）：当前 TEST_RX 启发式够用，等 multiagent 面板暴露真实需求再迭代。

### 2.5 重点判断逐条回答

**Codex hook/plugin 接入是否足够真实可用？——是，这是这个项目最有含金量的部分。** 不是 mock：官方 plugin-hooks API、marketplace 注册、trust 流程、`${PLUGIN_ROOT}` 展开、stdin JSON payload、Desktop 与 CLI 的 tool_name 差异，全部经过真机验证并有 handoff 文档背书。lib.js 的防御式解析（永不 throw、脱敏摘要、只取 basename）是正确的工程姿态。剩余问题只是**安装摩擦**（硬编码 node 路径、改动后要 re-trust + 刷 cache），不是可用性问题。

**notify wrapper 是否只是 fallback？——是，且应该保持 fallback 定位。** 它只能提供 turn-level 粗粒度信号（probe 已证实 payload 无 per-tool 信息），wrapper 的实现也很克制（转发前先原样调起 Codex 原 notifier、只记录 shape、默认 `turn_ended` 不庆祝）。不要试图从 notify 榨出细粒度事件。它在 multiagent 阶段的唯一升级点是转发 thread-id/turn-id（S2）。

**Windows release 是否够用？——机制够用，内容不干净。** 无依赖的 portable 打包脚本是合理的 v1 选择（避免为一次发布引入 electron-builder）。问题是打包内容：泄漏本机配置（M2）+ 打包了存疑资产（M1）+ 113MB 里塞了 docs/.agents 等非运行必需内容（可接受，不改也行）。修掉 M1/M2 后，portable zip 对"可发布、可展示"完全够格。

**UI 小窗体验是否够展示？——够。** pet(210×320)/panel(340×660) 双模式窗口、托盘菜单、气泡、任务面板、SVG fallback，作为展示已经完整。**不要再加任何 UI 功能**，下一次动 UI 应该直接是 multiagent 面板。

**安全/privacy 是否有明显风险？——有一条真实链路（M3），其余做得好。** 值得表扬的部分：loopback-only、64KB body 上限、payload 永不执行、hook 端脱敏（token 正则、basename、命令 80 字符截断）、notify shape-only 记录 + 敏感 key 遮蔽。这些边界意识超过多数同类项目。需要修的就是 M3 的浏览器伪造事件链，以及 M2 的打包泄漏。

**文档是否足够让别人安装和理解？——理解够了，安装差一步。** 协议文档和 INSTALL.md 质量很高（甚至记录了失败路径和 root cause），但入口分散且 README 口径过时（M4）。收口后即可。

---

## 3. 当前架构 Review

### 3.1 分层评估

```text
Codex plugin hooks ─┐
Codex notify wrapper ┤→ Unified Signal Protocol → 本地桥(4174) → IPC sn:signal
manual-test 等脚本 ─┘                                              ↓
                                        signalAdapter(上下文) → stateEngine(纯逻辑) → pet/panel/bubble(表现)
```

| 组件 | 评价 | 结论 |
|------|------|------|
| Electron 本地事件桥（main.js） | loopback-only、body 上限、错误不致命（端口占用只禁用 bridge 不影响宠物）、字段归一化容忍两种 envelope 写法。缺 Origin/Host 校验（M3）。 | 保留，小修 |
| Unified signal protocol（v0.1.0） | 这是全项目**最有价值的资产**。事件集小而语义化、明确禁止 agent-specific 事件、未知事件不崩溃、增量友好、文档完整。 | 原样沿用，multiagent 只做增量 |
| Codex plugin hooks | 真实验证过的官方接入。lib.js 分类启发式（looksShell/looksEdit/looksRead + TEST_RX）简单但对味。send-signal 特意 vendor 进 plugin 目录以适配 Codex cache 运行环境——这个细节说明作者理解运行时约束。 | 保留，Phase 1 补 setup 脚本 |
| Codex notify wrapper | 定位克制、实现防御性强、可回滚（config.toml 备份）。硬编码绝对路径是已知 caveat。 | 保留为 fallback，补 sessionId 转发 |
| renderer signalAdapter / stateEngine | 分层正确：adapter 管上下文，engine 是纯函数（signal+prev→next），表现层零业务逻辑。**核心局限：单任务、单 agent 的全局状态**——`context` 是一个 TaskContext，flags/phase 是全局的。 | 这是 multiagent 的主改造点，v1.0 不动 |
| tray / compact pet UI | 双模式窗口 + 托盘收纳 panel/settings/demo，"小而安静"的方向正确。 | 冻结 |
| release packaging | 机制合理，内容有 M1/M2 两个问题。 | 修内容，不换机制 |

### 3.2 优点（值得保持的决策）

1. **协议先行、adapter 消化差异**。"新 agent = 新 adapter，不改桌宠"这条纪律在代码里是真的执行了的（renderer 没有任何 codex-specific 状态）。
2. **不让模型汇报状态**。拒绝 prompt-based 上报、坚持 hook/lifecycle 免 token 接入，这个判断在两个 adapter 上都贯彻了，也是产品能规模化的前提。
3. **处处防御式失败**：hook 永不 throw 进 Codex、sender 静默失败、桥接 bind 失败不杀 app、Live2D 失败降级 SVG。"companion 永远不能伤害 agent"这条隐性原则执行得很一致。
4. **文档诚实**。区分"已验证"和"未确认"（adapter README 里的 candidates, not commitments），记录失败根因而不只是成功路径。这让两天收尾成为可能。

### 3.3 技术债（按是否阻碍 multiagent 排序）

| 债务 | 影响 multiagent？ | 处理 |
|------|-------------------|------|
| signalAdapter/stateEngine 单 agent 全局状态 | **是，直接阻碍** | Phase 1 M1 的核心工作：引入按 `agent+sessionId` 键控的 store，现有单任务视图降级为"focused agent 视图" |
| 事件无 sessionId 贯穿（wrapper 不转发，plugin 用 turn_id 充当 taskId） | **是** | S2 + 协议语义澄清：sessionId 为主键，taskId 尽力而为。注意 Codex 的 turn ≠ 产品意义上的 task，multiagent 面板不要假装能精确切分 task |
| 事件无持久化（actions 只留 8 条内存环） | 部分（timeline 需要更长缓冲） | 内存 ring buffer 扩到 ~200 条即可，不需要数据库 |
| 全局 `SN` 命名空间、无模块系统、无测试 | 否 | 不还。stateEngine 是纯函数，将来想补测试很容易，但现在不是优先级 |
| hooks.json 机器专属路径 | 否（是分发问题） | S1 setup 脚本 |
| 双 adapter 事件流无来源仲裁 | 是（轻度） | attention policy 一并解决 |

### 3.4 不值得现在重构的

- **不要**把 renderer 迁移到 React/Vue/TS。当前体量（~2000 行）下 vanilla JS + IIFE 完全可维护，迁移是纯成本。
- **不要**把本地桥从 HTTP 换成 WebSocket/named pipe。HTTP POST 是 adapter 编写门槛最低的形态，"任何能发 POST 的东西都能接入"是产品卖点。
- **不要**现在抽象"adapter SDK/框架"。两个 adapter（Codex、Claude Code）共享一个 send-signal.js 就够了，第三个 agent 出现之前任何抽象都是猜测。
- **不要**动 stateEngine 的能量/状态机逻辑。它是纯函数、行为已稳定，multiagent 是在它上面套一层聚合，不是改它。

---

## 4. Multiagent 工作助理方向 Review

### 4.1 产品定位是否清晰？

PRD 的定位句是对的："汇报状态、提醒介入、聚合进展"，且明确不做聊天、不控制 agent、不做调度。**但 PRD 还差一句真正的 North Star**。建议明确为：

> **把用户从"轮询多个 agent 窗口"变成"被正确的事情打断"。**

衡量它的唯一北极星指标：**用户切窗口检查 agent 的次数下降**，以及 **permission/blocked 从发生到用户响应的延迟下降**。所有功能决策（面板信息量、气泡频率、优先级规则）都应该服务这一句。PRD 现在的 Story 3（"我只关心最重要的事"）其实就是产品本体，而不是五个 story 之一。

### 4.2 和普通桌宠、普通 agent UI 的区别

- vs 普通桌宠（含 Codex 原生 pet）：普通桌宠是**视觉身份层**（你自己的对比文档已经说清楚了），SuperNoNo 的差异是**跨 agent 的工作状态语义**——它知道"谁在等你授权"，而不只是"播放哪个动画"。
- vs 普通 agent UI（各工具自带的终端/面板）：那些是**单 agent 的全量视图**，信息完整但要求你在场。SuperNoNo 是**多 agent 的注意力路由**，信息刻意不完整（只有摘要），换来的是"不在场也不漏事"。
- 这个定位的推论：**SuperNoNo 永远不应该试图复现 agent 自己 UI 里已有的信息**（diff、对话、完整日志）。它一旦开始复现，就变成了一个更差的终端。

### 4.3 Codex + Claude Code 双 agent 场景是否成立？

**成立，且技术上比 PRD 预期的更近。** PRD M3 列的调研问题现在就能回答：

- Claude Code 有**官方 hooks 系统**（用户/项目 settings.json 中配置），事件包括 `PreToolUse`、`PostToolUse`、`Notification`（权限请求/等待输入时触发）、`Stop`（回合结束）、`SessionStart` 等；hook 以 JSON stdin 接收 `session_id`、`tool_name`、`tool_input` 等字段。
- 这与 Codex plugin hooks **几乎同构**，映射表直接抄 Codex 的：`PreToolUse→command_running/file_reading/file_editing`、`PostToolUse→step_done`、`Notification→permission_required`、`Stop→turn_ended`、`SessionStart→task_start(粗粒度)`。lib.js 的分类逻辑可以大部分复用。
- 比 Codex 更省事的地方：不需要 marketplace/plugin cache/trust 流程，一段 settings.json hooks 配置 + 一个脚本文件即可；`node` 在 Claude Code hook 环境的 PATH 问题仍需在 Windows 上验证（有了 Codex 的经验，这是已知坑型）。

场景本身（Codex 写码、CC 做 review/文档，并行跑不同 issue）就是你现在的真实工作流，需求是自证的。**风险不在接入，在噪音**：两个 agent 的 PreToolUse 事件频率很高，没有 attention policy 的 multiagent 面板会比单 agent 更烦人——所以 attention policy 不能放在 M5 收尾，必须和 state store 一起设计（见第 5 节）。

### 4.4 对用户真正有价值的反馈是什么？

按价值排序：

1. **需要我介入**（permission_required / blocked / error）——这是唯一值得打断用户的事件，必须醒目、必须可靠、必须标明是哪个 agent。
2. **完成了**（completed + artifacts）——值得一条安静的气泡 + 面板可回溯。
3. **还活着 / 卡住了**（长时间无事件 vs 持续 command_running）——"agent 是否 stall"是用户轮询窗口的第二大原因。一个简单的 staleness 指示（agent 卡片上"最后活动 3 分钟前"）价值很高、成本极低。
4. **正在做什么**（当前 action 摘要）——ambient 信息，扫一眼即可，绝不主动打扰。

### 4.5 桌宠应该展示什么、不应该展示什么

| 展示 | 不展示 |
|------|--------|
| 最高优先级 agent 的状态（宠物本体 = 全局 attention 的化身） | 每个工具调用的细节流水（那是面板 timeline 的事，还得截断） |
| 底部状态栏：`[agent名] 当前动作摘要` | prompt / 对话正文 / diff / 源码 |
| 需要介入时的气泡 + 闪烁 | 每个 turn_ended 的提示（继续保持安静回 idle） |
| 面板里的 agent 卡片 + 事件 timeline | token 用量、模型细节等 agent 内部指标（v2 再议） |

### 4.6 dashboard / timeline / agent card / attention policy 的取舍

- **agent card：要，MVP 核心**。status + 当前任务 + 最新动作 + 最后活动时间 + needs-attention 徽标，五个字段封顶。
- **timeline：要，但只是面板里一个 ~50 条的滚动列表**，按 agent 着色。不是独立视图。
- **attention policy：要，且提前到与 state store 同期**。第一版就是 PRD 第 9 节的优先级表 + 两条规则：气泡只为 P0-P2 弹；宠物本体状态 = 所有 agent 中最高优先级状态。
- **dashboard：不要**。独立 dashboard 窗口是 Phase 3+ 的事，且要等真实使用证明面板不够用再做。桌宠的产品形态红利就是"小"，做成 dashboard 就跟普通 agent UI 同质化了。

---

## 5. Multiagent 架构建议

原则：**在现有架构上做加法，不新建系统。** 下面每一项都是对现状的最小增量。

### 5.1 协议：沿用 v0.1.0，做一次 v0.2 增量

- 事件集不动（`task_start` … `turn_ended`），语义映射不动。
- 增量三件事（全部向后兼容）：
  1. `payload.priority`: `low|normal|attention|critical`（PRD §8 已有此意，落进协议文档）；
  2. 语义澄清：`sessionId` 是并发隔离主键，adapter 必须尽力提供；`taskId` 尽力而为，UI 不得依赖其精确性；
  3. `agent` 字段收敛为约定俗成的枚举（`codex` / `claude-code` / `generic-cli`），文档列出，但接收端不强校验。
- `protocolVersion` 提到 `0.2.0`，`/health` 同步。

### 5.2 Adapter 层设计

```text
plugins/supernono-codex/        # 保持不动（Codex 要求 plugin 形态 + vendored sender）
adapters/
├── shared/send-signal.js       # 唯一共享件，保持 dependency-free
├── codex-desktop/              # notify wrapper fallback，保持不动
└── claude-code/                # 新增
    ├── README.md               # 安装说明（settings.json hooks 配置片段）
    ├── hooks-settings.example.json
    ├── lib.js                  # 事件分类/脱敏（从 plugin lib.js 抄，去掉 Codex 特有 fallback）
    ├── pre-tool-use.js / post-tool-use.js / notification.js / stop.js
    └── install.js              # 可选：把 hooks 配置 merge 进 ~/.claude/settings.json（带备份，学 notify installer 的做法）
```

规则不变：adapter 消化 agent 差异、防御式解析、脱敏、静默失败、绝不 vendor 之外的依赖。

### 5.3 Codex adapter 如何保留

- plugin hooks 原样保留为主链路；唯一新工作是 S1 的 setup 脚本（node 路径探测 + hooks.json patch + cache 刷新提示）。
- notify wrapper 保留为 fallback，加 S2（转发 thread-id → sessionId、turn-id → taskId）。
- 不再对 Codex 侧做任何新的接入探索（logs_2.sqlite tail、MCP side-channel 等候选**继续搁置**）。

### 5.4 Claude Code adapter 探索路径

1. **第一天验证三件事**（都是小实验）：hooks 在 Windows 上的可执行环境（node 是否在 PATH，不在就复用绝对路径方案）；`Notification` 事件对权限请求的触发时机；`Stop` 与 subagent 的关系（`SubagentStop` 是否需要单独处理——第一版忽略 subagent）。
2. 映射表（第一版）：

| Claude Code hook | SuperNoNo 事件 |
|---|---|
| `PreToolUse` (Bash) | `command_running`（TEST_RX 判 isTest） |
| `PreToolUse` (Edit/Write/NotebookEdit) | `file_editing` |
| `PreToolUse` (Read/Grep/Glob/WebFetch) | `file_reading` |
| `PostToolUse` | `step_done` / `error` |
| `Notification` (permission) | `permission_required` |
| `Stop` | `turn_ended` |
| `SessionStart` | 可选 `task_start`（title 用 cwd basename，别造假标题） |

3. `session_id` 直接映射 `sessionId`——Claude Code 天然提供，比 Codex 还顺。
4. 不做的：不 tail transcript、不解析对话、不做 statusline 集成、不碰 `UserPromptSubmit`（内容敏感）。

### 5.5 Multiagent state store 设计

renderer 新增 `agentStore.js`，位于 bridge 事件入口与现有 signalAdapter 之间：

```js
// 形态示意（不是实现）
store = {
  agents: Map<agentKey /* `${agent}:${sessionId||'default'}` */, {
    agent, adapter, sessionId,
    context: TaskContext,        // 复用现有 SignalAdapter 实例，一 agent 一个
    lastEventAt, lastEventType,
    attention: null | 'permission' | 'blocked' | 'error',
  }>,
  events: RingBuffer(200),       // {at, agentKey, type, action} — timeline 用
  focus: agentKey | null,        // 最高优先级 agent（attention policy 输出）
}
```

- **关键手法：不重写 SignalAdapter，而是实例化多份。** 现有类已经把单任务上下文管好了，一个 agentKey 一个实例，成本接近零。
- attention policy 是一个纯函数：`pickFocus(agents) -> agentKey`，按 PRD §9 的 P0-P5 表取最高，平级取最近活动。宠物本体渲染 `focus` 对应实例的状态；面板渲染全量。
- 兼容性：无 agent 字段的事件落入 `default` agent，现有单 agent 行为完全不变——这保证 M1 可以独立发布、随时回退。

### 5.6 pet UI 与 panel UI 的职责边界

- **Pet（常驻，210×320）**：全局 attention 的化身。只回答两个问题："现在有没有事需要我？"（状态+气泡+闪烁）、"最忙的 agent 在干嘛？"（状态栏一行：`Codex · 正在运行 npm test`）。
- **Panel（按需，托盘/点击打开）**：回答"全景"：Summary（active/needs-attention/completed 计数）+ agent cards + timeline。现有单任务面板改为点击某个 agent card 后的下钻视图。
- 边界纪律：pet 上**永远**不出现列表/滚动/多行信息；panel **永远**不主动弹出。

### 5.7 是否需要本地数据库？

**MVP 不需要。** 判断标准：只要产品问题还是"现在谁需要我"，内存 ring buffer 就够；只有当产品问题变成"今天/本周 agent 干了什么"（历史统计、跨重启回溯），才值得引入持久化。到那时优先选 **JSONL append-only 日志**（`%APPDATA%/SuperNoNo/events-YYYYMMDD.jsonl`，只存协议事件，天然可 grep、可删、可审计），SQLite 等到有查询需求再说。提前上数据库只会把隐私边界搞复杂。

### 5.8 安全与隐私边界（multiagent 阶段的增量）

沿用现有五条铁律（loopback-only、payload 永不执行、摘要不含正文/密钥、adapter 静默失败、shape-only 日志），增量四条：

1. M3 的 Origin/Host 校验成为桥接标配（进协议文档的"实现必须遵守"一节）。
2. `shell.openPath` 白名单化（存在性 + 扩展名黑名单 + 否则 reveal-in-folder）。
3. 若引入 JSONL 事件日志：默认关闭，设置里可开，文档写明存储位置与删除方式；日志内容 = 协议事件原样（本身已脱敏），绝不另存原始 hook payload。
4. Claude Code adapter 明确不读 transcript / `UserPromptSubmit`，与 Codex 侧"不读 input-messages / last-assistant-message"对齐成一条统一政策，写进 README 的隐私章节。

---

## 6. 下一阶段 Roadmap

### Phase 0：SuperNoNo v1.0 两天收尾（现在 → 后天）

- **目标**：v1.0 定版发布，可展示、可交付他人安装，之后冻结桌宠单 agent 功能。
- **交付物**：M1 资产合规构建（SVG-only 公开包或明确私有定位）、M2 干净的 zip、M3 桥接加固、M4 README 收口、git tag `v1.0.0`。
- **不做什么**：不加任何新功能、不动 renderer 结构、不做 installer、不碰 legacy_notify、不做 S1 setup 脚本。
- **验收标准**：在一台干净 Windows 机器上（或至少干净目录），按 README 从 zip 启动 → 装 plugin → trust → 跑真实 Codex 任务，宠物出现 `command_running`/`step_done` 反应；zip 内无个人路径文件、无存疑资产；浏览器网页 POST `/signal` 被拒绝。

### Phase 1：Multiagent MVP（约 1 周）

- **目标**：一个桌宠同时呈现多个事件源，attention 优先级生效。此阶段**不含** Claude Code adapter，用 manual-test 脚本模拟第二个 agent 即可开发。
- **交付物**：`agentStore.js`（多实例 SignalAdapter + focus 函数）、multiagent panel（Summary + agent cards + timeline）、attention policy v0（P0-P5 + 气泡门槛）、协议 v0.2 文档、S2（wrapper 转发 sessionId）、S1（Codex setup 脚本）。
- **不做什么**：不做 Claude Code adapter（并行调研可以，实现不算此阶段）、不做持久化、不做独立 dashboard 窗口、不改 stateEngine。
- **验收标准**：两个 manual-test 脚本以不同 `agent`/`sessionId` 并发发事件，面板出现两张卡片互不污染；其中一个发 `permission_required` 时宠物与气泡展示它而非另一个的 `command_running`；关闭 multiagent 面板后单 agent 行为与 v1.0 完全一致。

### Phase 2：Codex + Claude Code 双 agent 可用（约 1-2 周）

- **目标**：真实双 agent 日常工作流跑通，你自己每天用。
- **交付物**：`adapters/claude-code/`（hooks 脚本 + settings 配置片段 + 安装文档，可选 install.js）、Windows 环境验证记录、agent 卡片 staleness 指示（"最后活动 N 分钟前"）、双 agent 并发实测记录。
- **不做什么**：不接第三个 agent、不做 subagent 细分、不读任何对话内容、不做跨会话 task 关联。
- **验收标准**：Codex 与 Claude Code 各跑一个真实任务，面板两张卡片实时更新且 agent 归属正确；任一 agent 的 permission/blocked 在 5 秒内成为宠物焦点；杀掉 SuperNoNo 后两个 agent 工作不受任何影响；一周真实使用后你的主观判断是"切窗口检查次数变少了"。

### Phase 3：个人工作助理体验增强（按需，2-4 周弹性）

- **目标**：从"能看"到"好用"，全部由 Phase 2 的真实使用痛点驱动，不预设功能。
- **候选交付物**（先记录痛点再排序）：JSONL 事件日志 + 面板历史回看、staleness 主动提醒（agent 卡住 N 分钟气泡提示）、气泡点击直达对应 agent 窗口（如可行）、attention policy 可配置、connected/demo 状态指示（S3）。
- **不做什么**：不做云端/跨设备、不做 agent 控制（下发指令）、不做团队功能。
- **验收标准**：每个交付物能对应到一条 Phase 2 使用中记录的具体痛点；北极星（介入延迟、切窗次数）无恶化。

### Phase 4：长期产品化（远期，不排期）

- **目标**：让 SuperNoNo 成为 multiagent 工作台的稳定前端层，可给他人使用。
- **候选方向**：installer + 签名、开机自启、generic-cli wrapper（`supernono-run -- <cmd>`）、Cursor/其他 agent adapter、原创角色资产体系（含 Codex pet 资产导入）、可能的 dashboard 形态。
- **不做什么**：在 multiagent 后端（工作助理本体）方向明确前，不投入任何重型产品化。桌宠的天花板取决于 multiagent 主线，别倒着建。
- **验收标准**：至少 3 个非作者用户完成安装并持续使用一周；届时再定义商业/开源策略。

---

## 7. 给 Claude Code / Codex 的可执行任务拆分

以下任务均可直接作为 coding agent 的单次任务下发。**共同约束：不修改 `docs/supernono-signal-protocol.md` 的既有事件语义；不修改 `stateEngine.js` 的状态机逻辑；不引入任何 npm 运行时依赖。**

### Phase 0（两天收尾）

**T0.1 打包脚本卫生修复**
- 目标：公开 zip 不包含本机运行时文件。
- 涉及：`tools/package-win-portable.js`。
- 不要改：`appFiles` 之外的打包机制；不引入 electron-builder。
- 验收：重打包后 `dist/**/resources/app/adapters/codex-desktop/` 下无 `notify-wrapper.config.json`、无 `notify-observed.json`；`node tools/package-win-portable.js` 正常产出 zip。

**T0.2 桥接安全加固（Origin/Host + openPath 防护）**
- 目标：阻断"浏览器伪造 signal → 用户点开恶意 artifact"链路。
- 涉及：`electron/main.js`（bridge handler + `sn:open-path` handler）。
- 不要改：协议 envelope 结构、既有响应码语义（可新增 403）、renderer 代码。
- 验收：带 `Origin` 头的 POST 返回 403；`Host` 非 `127.0.0.1:*` 返回 403；现有 `manual-test.js` 与 plugin hooks 全部照常工作；`sn:open-path` 对 `.exe/.bat/.cmd/.ps1/.scr/.lnk` 及不存在的路径不调用 `openPath`（改为 reveal 或忽略），普通文档路径行为不变。

**T0.3 公开构建资产开关**
- 目标：产出不含 nono Live2D 模型的 public-safe 构建，走 SVG fallback。
- 涉及：`tools/package-win-portable.js`（增加 `--public` 排除 `src/renderer/assets/live2d/nono/`、`vip-nono.model3.json`）；`docs/releases/v1.0.0.md` 说明两种构建差异。
- 不要改：`pet.js` 的 fallback 逻辑（已存在，验证即可）；本地开发构建的资产加载。
- 验收：public 构建启动后无报错、宠物以 SVG 呈现、全部状态切换正常；zip 内搜不到 `moc3`/`texture_00`。

**T0.4 README 与发布文档收口**
- 目标：一条从 zip 到"真实 Codex 任务驱动宠物"的完整主线。
- 涉及：`README.md`（v1.0 能力清单 + 三步 quickstart + 指向 INSTALL.md）、`docs/releases/v1.0.0.md`（补资产/隐私/SmartScreen 说明）。
- 不要改：INSTALL.md 的已验证内容；协议文档；不新写英文/繁体（同步滞后可接受，标注即可）。
- 验收：按 README 步骤（不看其他文档）能完成安装验证；README 不再自称"原型/未接入真实 Codex"。

### Phase 1（Multiagent MVP）

**T1.1 notify wrapper 转发 sessionId/taskId**
- 目标：`turn_ended` 事件携带 `sessionId`（thread-id）与 `taskId`（turn-id）。
- 涉及：`adapters/codex-desktop/notify-wrapper.js`。
- 不要改：shape-only 记录原则（ID 是不透明标识，允许转发；消息内容仍绝不读取）；原 notifier 转发逻辑。
- 验收：真实 Codex turn 结束后桥接收到的 `turn_ended` envelope 含非空 `sessionId`；`SN_NOTIFY_WRAPPER_DRYRUN=1` 下输出确认。

**T1.2 Agent Store（多 agent 状态层）**
- 目标：按 `agent+sessionId` 隔离任务上下文，输出全局 focus。
- 涉及：新增 `src/renderer/js/agentStore.js`；`app.js` 事件入口改为经 store 分发；`index.html` 引入脚本。
- 不要改：`signalAdapter.js`（以多实例方式复用，不改类本身）；`stateEngine.js`；无 agent 字段事件的现有行为。
- 验收：两个不同 `agent` 的 manual-test 并发运行，`SuperNoNo.getContext()`（focused）与新增 `SuperNoNo.getAgents()` 各自正确；单 agent 场景下 UI 行为与改动前逐项一致。

**T1.3 Attention Policy v0**
- 目标：宠物本体与气泡跟随最高优先级 agent。
- 涉及：`agentStore.js`（pickFocus 纯函数）、`app.js`（announce 门槛：仅 P0-P2 弹气泡）、`config.js`（优先级表）。
- 不要改：stateEngine 能量规则；bubble.js 的节流实现。
- 验收：A agent `command_running` 期间 B agent 发 `permission_required`，宠物立即切到 waiting_approval 且气泡标明 B；B `permission_resolved` 后回落到 A 的状态。

**T1.4 Multiagent Panel**
- 目标：面板显示 Summary + agent cards + timeline（~50 条）。
- 涉及：`panel.js`、`index.html`、`styles/panel.css`；托盘菜单文案（`electron/main.js` 仅菜单项）。
- 不要改：panel 窗口尺寸机制（pet/panel 双模式）；单任务下钻视图的数据来源（复用 SignalAdapter context）。
- 验收：两个 agent 并发时面板两张卡片实时更新、timeline 按序滚动；needs-attention 徽标随 P0/P1 事件出现与清除。

**T1.5 Codex setup 脚本**
- 目标：消除 hooks.json 硬编码 node 路径的安装摩擦。
- 涉及：新增 `plugins/supernono-codex/setup.js`；`INSTALL.md` 补一步。
- 不要改：hooks 脚本本身；不自动执行 `codex plugin add`（打印指引即可，避免误操作用户的 config.toml）。
- 验收：在 node 路径非 `C:\Program Files\nodejs` 的环境模拟下，脚本正确探测并 patch `hooks.json`，输出 cache 刷新与 re-trust 指引。

### Phase 2（Claude Code adapter）

**T2.1 Claude Code hooks 环境验证（半天，先做）**
- 目标：确认 Windows 下 Claude Code hook 的执行环境与事件触达。
- 涉及：新增 `adapters/claude-code/probe/`（诊断 hook：回报 cwd/PATH/stdin 字段）；产出 `docs/claude-code-adapter-plan.md` 验证记录。
- 不要改：任何现有文件；不写正式 adapter 代码。
- 验收：文档记录 PreToolUse/PostToolUse/Notification/Stop 四类事件的实测 stdin 字段样例（脱敏）与 node 可执行性结论。

**T2.2 Claude Code adapter MVP**
- 目标：按 5.4 节映射表实现事件转发。
- 涉及：`adapters/claude-code/`（lib.js、四个 hook 脚本、hooks-settings.example.json、README）。
- 不要改：`adapters/shared/send-signal.js`（直接复用）；SuperNoNo core 不得出现任何 claude 专属事件名。
- 验收：真实 Claude Code 会话中，Bash 工具调用产生 `command_running`+`step_done`（`agent:"claude-code"`）；权限请求产生 `permission_required`；SuperNoNo 未运行时 Claude Code 无感知、无报错、无延迟增加。

---

## 附：一句话裁决

**桌宠现在就停止打磨——两天只做 T0.1–T0.4 四件事，然后打 tag。** Multiagent 立刻开始推进：它不是新项目，而是你已验证架构的第二次收割；Claude Code 官方 hooks 的存在把最大的不确定性提前消掉了。真正要警惕的不是"桌宠没做完"，而是"在桌宠上继续寻找完成感"。
