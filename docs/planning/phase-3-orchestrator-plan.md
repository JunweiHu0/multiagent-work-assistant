# Phase 3 Orchestrator 设计（Phase 3.0 方案文档）

- 日期：2026-07-07
- 状态：设计定稿，未实现（Phase 3.0 只交付本文档与最小架构决策）
- 前置：Phase 2.7 已完成——Codex + Claude Code 双 agent 真实接入、multiagent
  panel 产品化、adapter install/health-check/uninstall 运维链路全部跑通
- 关联：[signal protocol v0.1.0](../../../codex-task-pet/docs/supernono-signal-protocol.md)（pet 仓库）、
  [协议 v0.2 计划](../architecture/signal-protocol-v0.2-plan.md)、
  [repo 边界](../architecture/repo-boundary.md)

---

## 1. 产品目标

Phase 2 结束时，用户拥有的是**可见性**：谁在干活、卡在哪、focus 谁。
Phase 3 要给的是**工作组织能力**：

> 用户给出一个工作目标，把它拆成 Codex / Claude Code 可执行的任务，
> 系统跟踪每个任务的进展，在需要决策时提醒用户，结束后给出一份可读的总结。

北极星不变：**把用户从"轮询多个 agent 窗口"变成"被正确的事情打断"**——
Phase 3 把"正确的事情"从 agent 级（谁在等授权）提升到工作级（这个目标进行到哪了、
哪一项需要我拍板）。

衡量 Phase 3 是否成立的标准（对自己诚实）：

1. 你自己连续两周用它组织真实工作，而不是回到"开两个窗口各干各的"。
2. `work summary` 产出的总结你真的会读、会存档。
3. 决策等待从"碰巧看见"变成"总能在 5 秒内被桌宠提醒"。

## 2. 非目标（本轮铁律）

- 不做云端、不做账号系统、不做跨设备同步。
- 不做复杂数据库（JSON 状态文件 + JSONL 事件日志封顶）。
- **不做自动授权**：orchestrator 永远不替用户批准任何 agent 的权限请求。
- 不读 prompt / transcript / 源码正文 / diff / tool output——orchestrator 只消费
  已脱敏的协议事件，隐私边界与 adapter 完全一致。
- 不控制 agent：不 spawn、不注入指令、不替用户在 Codex / Claude Code 里操作。
  第一版 orchestrator 是**记账员 + 中继站 + 发言人**，不是调度器。
- 不做自动任务分解（见 §4.2 的理由）。
- 不改 codex-task-pet、不改 Claude Code adapter live hooks、
  不实现 permission_required / error / testPass 的新映射（沿用 2.6 语义门结论）。

## 3. Agent 角色划分

| Agent | 角色 | 适合承担 | 不适合 |
| --- | --- | --- | --- |
| **Codex** | Builder（执行者） | 代码修改、工程实现、跑测试、仓库操作（commit/branch）、批量机械改动 | 长文档、跨方案权衡叙述 |
| **Claude Code** | Advisor / Reviewer（评审者） | code review、方案推演、文档/PRD、第二意见、风险检查、跨文件理解 | 不适合与 Codex 同时改同一批文件 |
| **generic-cli** | 未来扩展 | 构建/部署脚本、定时任务等"哑"执行源 | Phase 3 不实现，仅在数据模型里留位 |

两条使用约定（写进文档而不是代码，靠人执行）：

1. **复核模式**是默认协作形态：一个 WorkItem 可以先由 Codex 执行、再由
   Claude Code 评审——数据模型允许一个 WorkItem 关联多个 AgentRun。
2. **写冲突回避**：同一时间同一批文件只允许一个 builder。orchestrator 第一版
   不做冲突检测，靠 WorkItem 划分自然隔离；这是已知风险（§9-R4）。

## 4. Orchestrator MVP 架构

### 4.0 一句话架构

```text
adapters ──(SUPERNONO_BRIDGE_PORT=4175)──► brain relay(4175) ──转发──► pet bridge(4174)
                                               │
                                        WorkSession store
                                     (JSON state + JSONL 事件日志)
                                               │
                                        workbench CLI（intake / assign / decide / summary）
                                               │
                                    以 agent:"assistant" 身份向 pet 发信号
```

**关键决策 D1 —— 事件中继（relay），而不是第二事件源。**
orchestrator 需要看到全部 agent 事件，但 pet 的桥接与 adapter 都不能改。
利用现成的 `SUPERNONO_BRIDGE_PORT` 环境变量：adapter 把事件发给 brain（4175），
brain 原样转发给 pet（4174），顺路落盘。**adapter 零代码改动、pet 零代码改动**，
两个仓库的边界完全不破。不启用 orchestrator 时，adapter 直连 4174，一切如旧
（opt-in 架构，随时可退）。

**关键决策 D2 —— orchestrator 通过 signal protocol 向 pet 汇报，自己就是一个 agent。**
brain 以 `agent: "assistant"`、`adapter: "workbench"` 的身份向 pet 发送
WorkSession 级别的事件：需要用户决策 → `permission_required`（pet 已有的最高
优先级 attention 链路），阶段完成 → `completed` + artifacts（summary 文件路径）。
pet 零改动就能显示一张"助理"卡片。协议是 agent-neutral 的，新 agent 名不需要
任何协议变更。

**关键决策 D3 —— 任务分解第一版是人工的。**
自动分解是模型能力问题，不是架构问题；分解错误会把成本放大到多个 agent。
第一版：用户手动拆（可以让任何 LLM 会话帮忙拆，但结果由用户确认后用 CLI 录入）。
架构上 task decomposition 是一个独立步骤，将来可以替换成模型辅助实现，
不影响其余环节。

**关键决策 D4 —— 决策入口留在原工具，orchestrator 只记录。**
权限批准仍在 Codex / Claude Code 自己的界面完成（不做自动授权，也不做远程
批准按钮）。orchestrator 检测到关联会话进入 waiting/blocked 时，生成
DecisionRequest 并向 pet 提升 attention；用户处理后（原工具里），orchestrator
标记 resolved。手动决策（"方案 A 还是 B"）通过 `work decide` 记录。

### 4.1 六个环节的第一版实现

| 环节 | MVP 实现 | 明确不做 |
| --- | --- | --- |
| task intake | CLI：`work new "修复登录并补文档"` 创建 WorkSession | 不做 GUI、不做 pet 上的输入框 |
| task decomposition | CLI：`work add "修 auth 模块" --role build`（人工拆，见 D3） | 不做自动分解 |
| agent assignment | CLI：`work assign <item> codex`（记录意图；用户自己去对应工具开工）；`work link <item> <agent:sessionId>` 把真实会话挂到任务上 | 不 spawn agent、不注入 prompt |
| event aggregation | brain relay 落盘全部协议事件；按 `agent:sessionId` 归组为 AgentRun；已 link 的 run 进度自动挂到 WorkItem | 不解析事件正文、不推断语义 |
| user decision gate | 关联 run 出现 `permission_required` / `blocked` → 生成 DecisionRequest → 以 assistant 身份向 pet 发 attention；`work decide <id> --note "..."` 记录人工决策 | 不自动授权、不催办升级 |
| final summary | `work summary` 从 store 生成 Markdown（每个 item：状态/关联 run/事件计数/耗时/待决），可选向 pet 发 `completed` + artifact 路径 | 不做日报排版美化、不做图表 |

### 4.2 运行形态

- 一个本地 Node 进程 + 一组 CLI 子命令（零 npm 依赖，复用 `send-signal.js` 风格）。
- relay 与 CLI 共享同一 store 目录（建议 `%USERPROFILE%\.supernono-workbench\`）。
- 与 health-check 集成：Phase 2.5 的 `health-check.js` 后续加一项
  "brain relay 是否在线"（Phase 3.1 顺手做，不阻塞）。

## 5. 最小数据模型草案

```jsonc
// WorkSession —— 一个工作目标（一天可能有 1-3 个）
{ "id": "ws_20260707_a", "title": "修复登录 + 补文档", "goal": "……一句话目标",
  "status": "active | closed", "createdAt": "...", "closedAt": null, "items": ["wi_1"] }

// WorkItem —— 拆出来的可执行任务
{ "id": "wi_1", "sessionId": "ws_20260707_a", "title": "修 auth 模块",
  "role": "build | review | doc | test", "assignedAgent": "codex | claude-code | generic-cli | null",
  "status": "todo | in_progress | waiting_user | done | dropped",
  "runs": ["ar_1"], "createdAt": "...", "updatedAt": "..." }

// AgentRun —— 一个真实 agent 会话（从事件流自动建立）
{ "id": "ar_1", "agent": "codex", "agentSessionId": "<协议 sessionId>",
  "adapter": "codex-plugin-hooks", "workItemId": "wi_1 | null",
  "startedAt": "...", "lastEventAt": "...",
  "eventCounts": { "command_running": 5, "step_done": 5, "turn_ended": 2 } }

// DecisionRequest —— 需要用户拍板的事
{ "id": "dr_1", "workItemId": "wi_1 | null", "agentRunId": "ar_1 | null",
  "kind": "approval | blocked | manual", "summary": "npm install 需要批准（脱敏摘要）",
  "createdAt": "...", "resolvedAt": null, "resolution": "approved | denied | noted | null" }
```

存储：`workbench-state.json`（sessions/items/runs/decisions 的当前态）+
`events-YYYYMMDD.jsonl`（协议事件原样追加，本身已脱敏）。不上数据库；
state 文件超过管理能力（比如 >1MB）就是产品做错了的信号，不是换存储的信号。

## 6. 与现有 signal protocol 的关系

- **协议零变更**。brain 只消费/转发既有 v0.1.0 事件；orchestrator 的对 pet 汇报
  也完全用既有事件类型（`permission_required` / `completed` / `task_start` /
  `idle`），走 agent-neutral 通道。
- 一个已识别的 v0.2 增量候选（**本轮不做**，记入 v0.2 计划的待议）：
  `payload.project = basename(cwd)`——AgentRun 与 WorkItem 的自动关联目前只能靠
  人工 `work link`；带一个非敏感的项目目录名能让 brain 按项目自动建议关联。
  等 Phase 3.2 用出真实痛感再决定。

## 7. 与 codex-task-pet 的边界

- **pet 只显示和交互（focus/pin 属于显示层交互），不承担任何调度逻辑**。
- orchestrator 不画 UI：它对用户的输出是 CLI + Markdown 摘要 + 通过协议驱动的
  pet 表现（assistant 卡片、attention、庆祝）。
- 用户决策入口第一版**不**放在 pet 上（不做批准按钮）——pet 变成控制台是一个
  需要单独论证的产品决定，先用"pet 提醒 + 原工具操作"闭环。
- pet 仓库在整个 Phase 3 期间预期**零提交**（除非发现显示层 bug）。

## 8. Phase 3.1 / 3.2 / 3.3 拆分

| 阶段 | 交付 | 验收 |
| --- | --- | --- |
| **3.1 本地 WorkSession store + relay** | `brain/relay.js`（4175→4174 透明转发 + JSONL 落盘）、`workbench-state.json` 读写模块、`work status` 只读 CLI | ① 双 agent 仿真脚本把 `SUPERNONO_BRIDGE_PORT=4175` 指向 relay，pet 侧行为与直连**逐项一致**；② 事件完整落盘；③ relay 停止时 adapter 静默失败不伤 agent（与直连 pet 缺席时行为相同） |
| **3.2 手动 WorkItem + 分配** | `work new/add/assign/link/decide/done` 子命令；AgentRun 从事件流自动建立；未关联 run 的提示 | 一次真实双 agent 工作（Codex 改码 + CC 评审）被完整记录，`work status` 能如实回答"现在到哪了、谁在等我" |
| **3.3 事件流生成用户摘要** | `work summary` 生成 Markdown；可选 assistant→pet 的 `completed` 汇报 | 真实半天工作产出一份**你愿意读**的摘要；摘要中不出现任何敏感正文；桌宠能以 assistant 卡片提示"总结已生成" |

3.1 先做的原因：relay 是唯一有架构风险的部件（透明性、稳定性），必须最先证伪；
store 和 CLI 都是低风险的纯增量。

## 9. 风险清单与验证方式

| # | 风险 | 等级 | 缓解 / 验证 |
| --- | --- | --- | --- |
| R1 | relay 单点：brain 没开时 adapter 事件全丢（pet 也看不到） | P1 | opt-in 模式（不用 orchestrator 就直连 4174）；health-check 加 relay 在线项；Phase 3.x 再评估 adapter 双投递。验证：kill relay 后 agent 无感知、pet 恢复直连后一切如常 |
| R2 | 人工 link 遗忘 → 事件成孤儿，summary 失真 | P1 | `work status` 显著提示未关联 run；§6 的 `payload.project` 候选。验证：3.2 真实使用中统计漏 link 次数 |
| R3 | 事件粒度太粗（command/step/turn 级），summary 读起来没营养 | P1 | 3.3 的验收就是"你愿意读"；不达标就砍 summary 或等语义门补齐 error/testPass 后重试。不允许用读取 tool output 来"丰富"摘要 |
| R4 | 双 builder 写冲突（Codex 和 CC 改同一文件） | P2 | 角色约定（§3）+ WorkItem 划分；不做代码级冲突检测 |
| R5 | orchestrator 滑向第二个项目管理工具（过度设计） | P1 | 护栏：每个 CLI 命令必须在两周真实使用中被用到，否则删除；state 文件 >1MB 视为设计错误 |
| R6 | 隐私面扩大：事件日志持久化 | P1 | 只存协议事件（已脱敏）；文档写明位置与删除方式；启用 relay 即知情同意，不做暗中记录。验证：对日志跑与 adapter 相同的泄漏标记检查 |

## 10. Phase 3.1 实现记录（2026-07-07）

Phase 3.1（relay + local store）已实现并验证，交付物在 `orchestrator/`：

| 文件 | 内容 |
| --- | --- |
| `relay.js` | 透明中继（4175→4174）：字节级原样转发、先应答后异步转发（上游延迟与 pet 状态解耦）、64KB 上限、Origin 头 403、回环自检（`SN_RELAY_PET_PORT` 与监听端口相同拒绝启动）、uncaught 兜底不死 |
| `event-log.js` | 按天 JSONL 追加（`.supernono/events-YYYYMMDD.jsonl`，已 gitignore），`append()` 永不 throw |
| `health-check.js` | relay/pet/转发路径/数据目录/回环配置五项检查，pet 缺席为 WARN 非 FAIL |
| `relay-fixture-test.js` | 22 项断言：3 个透明转发用例（含未知字段与 key 顺序保持）、4 个校验拒绝用例、pet-down 行为（ok 应答 <5ms、计数、无崩溃）、日志卫生（行结构恰为 `{at,envelope,forward}`、无 HTTP 头泄漏） |
| `README.md` | 三条契约、启动方式、env 说明、已知限制 |

验证结果：

- fixture 测试 **22/22 PASS**；`node --check` 全过。
- 真实端到端：pet + relay 同时运行，双 agent 仿真脚本以
  `SUPERNONO_BRIDGE_PORT=4175` 投递 **7/7**，relay counters
  `received=7 forwarded=7 missed=0 rejected=0`，pet renderer 零报错，
  行为与直连 4174 一致；JSONL 逐条含 envelope+forward，敏感关键词扫描 0 命中。
- 实现期发现并修复：Node 19+ 默认 keep-alive 连接池会复用被 413 用例销毁的
  socket（测试客户端加 `agent:false`）；`port:0` 临时端口被 `||` 默认值吞掉
  （改显式 `!== undefined` 判断）。均为测试/选项处理问题，转发语义无改动。

尚未做（留给 3.2+）：`workbench-state.json` 与 `work status` CLI（3.1 原计划
含只读 CLI，实际交付把它并入 3.2 与 WorkItem 一起做，避免先造一个没有数据
模型消费者的空壳命令）；health-check 与 Phase 2.5 adapter health-check 的整合。

## 11. Phase 3.0 结论

1. Orchestrator MVP = **记账员 + 中继站 + 发言人**，不是调度器：不 spawn agent、
   不自动分解、不自动授权。
2. relay 架构让 pet 与 adapter **双双零改动**就能获得完整事件流——两仓库边界
   在 Phase 3 全程保持不破。
3. orchestrator 以 `assistant` 身份复用 signal protocol 向 pet 汇报，pet 免费获得
   "助理"卡片与决策提醒。
4. 数据模型四个对象（WorkSession / WorkItem / AgentRun / DecisionRequest），
   JSON + JSONL 存储，明确的膨胀红线。
5. 从 3.1 relay 开始做，因为它是唯一需要证伪的架构部件。
