# Signal Protocol v0.2 增量计划

- 日期：2026-07-03
- 状态：计划（未实施）
- 当前生效版本：**v0.1.0**，规范在
  [codex-task-pet/docs/supernono-signal-protocol.md](https://github.com/JunweiHu0/codex-task-pet/blob/v2/multiagent-work-assistant/docs/supernono-signal-protocol.md)
- 归属决策：**从 v0.2 起，协议规范的权威版本在本仓库维护**；
  codex-task-pet（桌宠/桥接）是协议的实现方之一。

## v0.1.0 现状回顾

- 传输：`POST http://127.0.0.1:4174/signal`（loopback-only），`GET /health`。
- Envelope：`type`（必填）+ `agent` / `adapter` / `sessionId` / `taskId` / `payload`（可选）。
- 事件集：`task_start` / `plan_ready` / `file_reading` / `file_editing` /
  `command_running` / `test_running` / `step_done` / `permission_required` /
  `permission_resolved` / `blocked` / `error` / `completed` / `idle` / `turn_ended`。
- 铁律：agent-neutral（禁止 agent 专属事件名）、未知事件不崩溃、payload 只放
  摘要、绝不执行 payload 内容、adapter 静默失败。

**v0.2 不改事件集，不改语义映射，全部是向后兼容的增量。**

## v0.2 增量内容

### 1. `payload.priority`（新增可选字段）

```text
priority: "low" | "normal" | "attention" | "critical"
```

adapter 可显式标注事件的注意力级别；接收端没有该字段时按事件类型的默认
优先级处理（见 PRD §9 的 P0-P5 表）。接收端对未知取值按 `normal` 处理。

### 2. `sessionId` 语义澄清（文档级，无代码变更）

- `sessionId` 是**并发隔离主键**：adapter 必须尽力提供；接收端按
  `agent + sessionId` 隔离状态。
- `taskId` 尽力而为：Codex plugin hooks 里它实际是 turn_id，**turn ≠ 产品
  意义上的 task**，UI 不得依赖其精确性。
- Claude Code 天然提供 `session_id`，直接映射 `sessionId`。

### 3. no-session settle 事件路由规则（把 pet 端已实现的行为写进规范）

携带 `agent` 但无 `sessionId` 的 **settle 事件**（`turn_ended` / `idle` /
`completed`，即 notify wrapper 一类粗粒度源能发出的事件）：

- 路由到该 agent **最近活跃**的会话；
- **跳过 `requiresUserAction`（等待授权/阻塞）的会话**——另一个会话的
  turn_ended 绝不能清掉当前会话的等待授权；
- 若该 agent 的全部会话都在等用户：事件只记入 timeline，不落到任何会话。

（该行为已在 codex-task-pet 的 `agentStore.js` 实现并有回归测试；v0.2 把它
从实现细节升格为协议接收端的规范要求。）

### 4. `agent` 字段取值约定（文档级）

约定俗成的枚举：`codex` / `claude-code` / `cursor` / `generic-cli`。
文档列出但接收端**不强校验**——未知 agent 名照常按独立 agent 处理。

### 5. 版本号

- `protocolVersion` 升至 `0.2.0`，`GET /health` 同步返回。
- 兼容性：v0.1 的 adapter 无需任何修改即可继续工作。

## 待议（不进 v0.2）

- `SUPERNONO_BRIDGE_TOKEN` 本地鉴权：等有真实需求再议；当前威胁模型下
  优先做接收端的 Origin/Host 校验（属于 pet 仓库的 T0.2，非协议变更）。
- staleness / heartbeat 事件：等 Phase 2 双 agent 真实使用暴露需求后再定。
- 事件持久化格式（JSONL）：与协议解耦，放 Phase 3。

## 实施顺序

1. 本仓库新建 `docs/protocol/signal-protocol.md` 作为 v0.2 权威规范
   （以 v0.1.0 全文为底，合入上述增量）。
2. codex-task-pet 侧：`/health` 版本号提升 + 协议文档改为指向本仓库规范
   （实现文档保留）。
3. 第一个消费方：Claude Code adapter（probe 结论出来后按 v0.2 写）。
