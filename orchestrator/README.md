# Brain Relay（Phase 3.1）

orchestrator 的第一块砖：**透明事件中继 + 本地事件记录**。不做调度、不做分解、
不控制任何 agent。

```text
agent adapters ──(SUPERNONO_BRIDGE_PORT=4175)──► brain relay (127.0.0.1:4175)
                                                     │ 记录 envelope + 转发状态（JSONL）
                                                     ▼
                                          pet bridge (127.0.0.1:4174 /signal)
```

设计依据：[docs/planning/phase-3-orchestrator-plan.md](../docs/planning/phase-3-orchestrator-plan.md) §4（决策 D1）。

## 三条契约

1. **透明**：转发的是原始请求字节，逐字节不变——不改任何字段、不重排 key、
   不丢未知字段。pet 看到的与 adapter 直连时完全一致。
2. **绝不伤害 agent**：合法事件**立即**应答 `{ok:true, accepted:true}`，转发在
   应答之后异步进行——上游 hook 的延迟与 pet 是否在线无关；pet 不在时事件
   照常落盘（`forward: "missed"`），relay 不崩溃。
3. **隐私**：日志只含 `{at, envelope, forward}` 三个字段。envelope 是 adapter
   已脱敏的协议事件；不记录 HTTP 头、不派生任何内容。启动 relay 即表示同意
   本机记录事件日志——删除 `.supernono/` 目录即清除全部记录。

## 使用

```powershell
# 启动 relay（默认 127.0.0.1:4175 → 127.0.0.1:4174）
node orchestrator/relay.js

# 让 adapter 指向 relay（临时，作用于该会话启动的 hooks）：
#   Claude Code hooks / Codex plugin hooks 的 sender 都读 SUPERNONO_BRIDGE_PORT。
#   在启动 agent 的环境里设：
#     PowerShell:  $env:SUPERNONO_BRIDGE_PORT = "4175"
#     cmd:         set SUPERNONO_BRIDGE_PORT=4175
#   不设置时 adapter 直连 4174，一切与 Phase 2 相同（opt-in，可随时退回）。

# 健康检查（relay、pet、转发路径、数据目录、回环配置）
node orchestrator/health-check.js

# 完整 fixture 验证（22 项断言：透明性/校验/pet-down/日志卫生）
node orchestrator/relay-fixture-test.js
```

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SN_BRAIN_PORT` | `4175` | relay 监听端口 |
| `SN_RELAY_PET_PORT` | `4174` | 下游 pet 桥端口。**故意不用** `SUPERNONO_BRIDGE_PORT`——否则全局导出 4175 会让 relay 转发给自己；relay 启动时有回环自检 |
| `SN_BRAIN_DATA_DIR` | `<repo>/.supernono` | JSONL 日志目录（已 gitignore），文件按天：`events-YYYYMMDD.jsonl` |

## Work Store 与 CLI（Phase 3.2）

relay 之上的最小"工作记账"：手动创建工作会话与任务、分配 agent，relay 收到的
事件自动归组为 AgentRun，由你把 run 挂到任务上。**不做调度、不 spawn agent、
不读任何正文**——记账数据只来自 signal envelope 和你的手动输入。

状态文件：`.supernono/workbench-state.json`（gitignored；损坏时报错并拒绝
覆盖，绝不静默重建——修复或移走该文件后重试）。

```powershell
# 典型一轮
node orchestrator/work.js session start "实现 Claude adapter" --goal "把 hooks 事件接进桌宠"
node orchestrator/work.js item add "让 Codex 实现 relay" --role build
node orchestrator/work.js item assign wi1 codex
#   ……让 agent 干活（事件经 relay 进来，自动出现为 AgentRun）……
node orchestrator/work.js status                     # 会列出"未关联的 AgentRun"
node orchestrator/work.js item link wi1 codex:<sessionId>
node orchestrator/work.js item done wi1
node orchestrator/work.js decision add "是否接受这个方案？" --item wi1
node orchestrator/work.js decision resolve dr1 accept
node orchestrator/work.js session close
```

数据模型（设计文档 §5）：WorkSession（`ws1`）→ WorkItem（`wi1`，role =
build/review/doc/test）→ 关联 AgentRun（`ar1`，按 `agent:sessionId` 从事件流
自动建立）；DecisionRequest（`dr1`）记录需要你拍板的事。

状态流转规则：run 状态由事件类型驱动（working / waiting_user / completed /
idle）；已关联 item 会自动 待办→进行中、等待用户↔进行中；**done 永远手动**。
无 sessionId 的事件（notify wrapper）不参与记账，只走转发与日志。

已知 MVP 限制：relay 与 CLI 是两个进程对同一文件做 read-modify-write，理论上
存在并发竞态；人类操作尺度下可接受，出问题再收敛为单写者。

测试：

```powershell
node orchestrator/work-store-fixture-test.js       # 30 项：领域操作/归组/损坏保护
node orchestrator/relay-work-integration-test.js   # 20 项：relay+store+CLI 端到端
```

## 已知限制（按设计）

- relay 是单点：不开 relay 且 adapter 指着 4175 时，事件既到不了 brain 也到不了
  pet（设计文档 R1）。所以是 opt-in 模式，health-check 会显式报告链路状态。
- 应答不反映转发结果（异步转发）；转发成败看 JSONL 的 `forward` 字段和
  `/health` 的 counters。
- 带 `Origin` 头的请求（浏览器来源）一律 403——本地 adapter 不发该头。

## Phase 3.3-3.5 MVP usage

Phase 3 now has a complete local MVP loop: relay -> work store -> summary -> manual review workflow. It is still intentionally manual: the orchestrator records and summarizes work, but does not spawn agents, auto-authorize tools, or read prompt/source/diff/transcript/tool output.

### Generate a metadata-only summary

```powershell
node orchestrator/work.js summary
node orchestrator/work.js summary --notify
```

`summary` writes `.supernono/summaries/summary-YYYYMMDD-HHMMSS.md`. The report contains item status, linked runs, event type counts, elapsed time, open decisions, and relay forwarding totals. It deliberately excludes prompt, transcript, source, diff, tool output, tokens, and secrets.

With `--notify`, the workbench sends a normal signal envelope as `agent:"assistant"`, `adapter:"workbench"`, `type:"completed"` with the summary path as an artifact. Point `SN_BRAIN_PORT` / `SUPERNONO_BRIDGE_PORT` as usual if you want the notification to go through relay or direct bridge.

### Create the first fixed multiagent workflow

```powershell
node orchestrator/work.js workflow review-loop "Implement feature X" --goal "Codex builds, Claude reviews, user decides"
```

This creates:

- a WorkSession (`ws...`)
- a Codex build WorkItem
- a Claude Code review WorkItem
- a DecisionRequest for accepting/rejecting the review result

It does **not** launch Codex or Claude Code. You still run the agents manually, then link observed runs with:

```powershell
node orchestrator/work.js status
node orchestrator/work.js item link wi1 codex:<sessionId>
node orchestrator/work.js item link wi2 claude-code:<sessionId>
node orchestrator/work.js item done wi1
node orchestrator/work.js decision resolve dr1 accept
```

### Tests

```powershell
node orchestrator/work-store-fixture-test.js
node orchestrator/relay-work-integration-test.js
node orchestrator/relay-fixture-test.js
node orchestrator/summary-fixture-test.js
node orchestrator/workflow-fixture-test.js
```

## Phase 3.6-3.8 real-use, summary v2, and prompt generation

The local MVP is now meant to be tested on real work before adding automation.

### Real-use acceptance

Use the checklist in `docs/acceptance/phase-3-6-real-use.md`. The pass/fail question is product usefulness, not just script success: does the workflow reduce coordination load enough to justify more automation?

### Summary v2

```powershell
node orchestrator/work.js summary
node orchestrator/work.js summary --notify
```

The summary is a handoff-style Markdown report with:

- Snapshot
- Next Actions
- Completed
- In Progress
- Waiting For User
- Todo / Not Started
- Agent Activity
- Unassigned Agent Runs
- Open Decisions
- Files
- Safety Note

It is still metadata-only. It does not include prompt, transcript, source, diff, tool output, tokens, or secrets.

### Prompt generator

```powershell
node orchestrator/work.js prompt codex wi1
node orchestrator/work.js prompt claude wi2
node orchestrator/work.js prompt review-loop
```

Prompts are written to `.supernono/prompts/` and also printed to stdout for copying. They are task instructions only: the orchestrator does not send them to agents and does not spawn Codex or Claude Code.

### Recommended manual loop

```powershell
node orchestrator/relay.js
node orchestrator/work.js workflow review-loop "Implement feature X" --goal "Codex builds, Claude reviews, user decides"
node orchestrator/work.js prompt review-loop
# copy prompts into agents manually
node orchestrator/work.js status
node orchestrator/work.js item link wi1 codex:<sessionId>
node orchestrator/work.js item link wi2 claude-code:<sessionId>
node orchestrator/work.js decision resolve dr1 accept
node orchestrator/work.js item done wi1
node orchestrator/work.js item done wi2
node orchestrator/work.js summary --notify
```

Additional tests:

```powershell
node orchestrator/summary-fixture-test.js
node orchestrator/prompt-fixture-test.js
node orchestrator/workflow-fixture-test.js
```
