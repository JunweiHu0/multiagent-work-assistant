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

## 已知限制（按设计）

- relay 是单点：不开 relay 且 adapter 指着 4175 时，事件既到不了 brain 也到不了
  pet（设计文档 R1）。所以是 opt-in 模式，health-check 会显式报告链路状态。
- 应答不反映转发结果（异步转发）；转发成败看 JSONL 的 `forward` 字段和
  `/health` 的 counters。
- 带 `Origin` 头的请求（浏览器来源）一律 403——本地 adapter 不发该头。
