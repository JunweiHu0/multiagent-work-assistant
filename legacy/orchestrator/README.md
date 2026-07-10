# Orchestrator Manual

`orchestrator/` 是 Multiagent Work Assistant 的本地大脑层。它只做本地记账和文件工件，不 spawn agent、不调用 LLM API、不读 prompt/transcript/source/diff/tool output/token/secret。

## 1. Relay

relay 接收 adapter 发来的 signal envelope，写 JSONL 日志，并逐字节透明转发给桌宠。

```powershell
node orchestrator\relay.js
node orchestrator\health-check.js
```

默认端口：

| 端口 | 用途 |
| --- | --- |
| `4175` | brain relay，adapter 可通过 `SUPERNONO_BRIDGE_PORT=4175` 指向这里 |
| `4174` | SuperNoNo pet bridge，由 `codex-task-pet` 提供 |

关键契约：

- 转发原始 body，不重排 key，不丢未知字段。
- 合法事件先应答 `{ok:true, accepted:true}`，再异步转发。
- 日志只记录 `{at,envelope,forward}`，不记录 HTTP headers 或正文派生内容。
- 浏览器 `Origin` 请求会被拒绝。

测试：

```powershell
node orchestrator\relay-fixture-test.js
node orchestrator\relay-work-integration-test.js
node orchestrator\status-health-fixture-test.js
```

## 2. Work Store

work store 是本地 JSON 记账文件：`.supernono/workbench-state.json`。

核心对象：

- `WorkSession`：一轮工作，例如 `ws1`
- `WorkItem`：一个任务，例如 `wi1`
- `AgentRun`：一个真实 agent 会话，例如 `ar1`，由 `agent:sessionId` 自动归组
- `DecisionRequest`：需要用户拍板的事项，例如 `dr1`

常用命令：

```powershell
node orchestrator\work.js status
node orchestrator\work.js status --all
node orchestrator\work.js session start "Task title" --goal "Goal"
node orchestrator\work.js session close
node orchestrator\work.js item add "Codex implement X" --role build
node orchestrator\work.js item assign wi1 codex
node orchestrator\work.js item link wi1 codex:<sessionId>
node orchestrator\work.js link --auto
node orchestrator\work.js item done wi1
```

当前推荐入口：

```powershell
node orchestrator\work.js go "Implement feature X" --goal "Codex builds, Claude reviews, user decides"
```

`go` 会一次性完成 deterministic plan draft、plan accept、prompt pack。它仍然不启动 agent。

归档规则：

- `session close` 会把该 session 的 linked runs 和该时间窗内的 unassigned runs 标记为 archived。
- 默认 `status` 和 `summary` 隐藏 archived runs。
- `status --all` 显示 archived runs。
- archived run 收到新事件时会自动解除归档。

测试：

```powershell
node orchestrator\work-store-fixture-test.js
node orchestrator\workflow-fixture-test.js
```

## 3. Decisions

决策 brief 是给用户拍板的 metadata-only Markdown。

```powershell
node orchestrator\work.js decision add "Accept review result?" --item wi2
node orchestrator\work.js decision brief dr1 --notify
node orchestrator\work.js decision resolve dr1 accept
node orchestrator\work.js item done wi2 --resolve dr1
```

`--notify` 会以 `agent:"assistant"`、`adapter:"workbench"` 向桌宠发送 attention 事件。`decision resolve` 会发送对应的 resolve/settle 信号，避免 assistant 卡片卡在 waiting 状态。

## 4. Summary

summary 生成可交接的 Markdown handoff。

```powershell
node orchestrator\work.js summary
node orchestrator\work.js summary --notify
```

输出位置：

```text
.supernono/summaries/summary-YYYYMMDD-HHMMSS.md
```

内容包含 item 状态、linked run 事件统计、open decisions、relay forward 统计和下一步建议。它默认隐藏 archived runs，且不包含 prompt/transcript/source/diff/tool output/token/secret。

测试：

```powershell
node orchestrator\summary-fixture-test.js
node orchestrator\workbench-signal-fixture-test.js
```

## 5. Prompt Pack

prompt generator 只生成可复制的任务说明，不发送给 agent。

```powershell
node orchestrator\work.js prompt codex wi1
node orchestrator\work.js prompt claude wi2
node orchestrator\work.js prompt review-loop
node orchestrator\work.js prompt pack ws1
```

`prompt pack` 输出到：

```text
.supernono/prompts/<wsId>/
```

测试：

```powershell
node orchestrator\prompt-fixture-test.js
node orchestrator\phase4-fixture-test.js
```

## 6. Brain Planner

Python brain 是窄边界 spike：Node 把 metadata-only JSON 传给 Python，Python 输出兼容的 `supernono.planDraft.v1`。它不在 hook 热路径里。

```powershell
node orchestrator\work.js brain check
node orchestrator\work.js brain plan "Implement feature X" --goal "Codex builds, Claude reviews"
```

如果本机没有全局 Python，可设置：

```powershell
$env:SN_PYTHON = "C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
```

测试：

```powershell
node orchestrator\brain-fixture-test.js
```

## 7. Full Manual Loop

```powershell
node orchestrator\relay.js
node orchestrator\work.js go "Implement feature X" --goal "Codex builds, Claude reviews, user decides"

# Copy prompts from .supernono/prompts/<wsId>/ into Codex and Claude Code manually.

node orchestrator\work.js status
node orchestrator\work.js link --auto
node orchestrator\work.js decision brief dr1 --notify
node orchestrator\work.js item done wi2 --resolve dr1
node orchestrator\work.js summary --notify
node orchestrator\work.js session close
```

## 8. Full Test Matrix

```powershell
node --check orchestrator\*.js
node orchestrator\relay-fixture-test.js
node orchestrator\work-store-fixture-test.js
node orchestrator\relay-work-integration-test.js
node orchestrator\summary-fixture-test.js
node orchestrator\prompt-fixture-test.js
node orchestrator\workflow-fixture-test.js
node orchestrator\phase4-fixture-test.js
node orchestrator\workbench-signal-fixture-test.js
node orchestrator\status-health-fixture-test.js
```

Optional:

```powershell
node orchestrator\brain-fixture-test.js
```

## 9. Do Not Do Yet

- Do not spawn Codex / Claude Code from orchestrator.
- Do not add MCP server or dispatch before T8 go/no-go.
- Do not call an LLM API from this repo.
- Do not read prompt/transcript/source/diff/tool output/token/secret.
- Do not add npm dependencies for the current hardening phase.
