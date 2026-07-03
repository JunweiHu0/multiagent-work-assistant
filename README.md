# Multiagent Work Assistant

面向个人开发者的多 agent 工作助理**核心仓库**：聚合 Codex、Claude Code 等
coding agent 的工作状态，决定"用户此刻应该关注谁"，并通过统一信号协议驱动
桌面前端。

## 这个仓库是什么、不是什么

**这里不是桌宠 UI 仓库。** 桌宠（SuperNoNo）的 Electron UI、Live2D、托盘、
面板和 `/signal` 本地桥都在另一个仓库：

> https://github.com/JunweiHu0/codex-task-pet

两个仓库的分工一句话：

```text
codex-task-pet            = 脸 / 显示层（桌宠 UI + 本地桥 + renderer 状态展示）
multiagent-work-assistant = 大脑 / 聚合层（adapter、agent 状态聚合、attention policy、协议）
```

两者通过本地信号协议通信：任何 adapter 向桌宠的本地桥
`POST http://127.0.0.1:4174/signal` 发送 agent-neutral 事件（loopback-only，
只传状态摘要，绝不传 prompt / 源码正文 / 密钥）。桌宠没运行时 adapter 静默
失败，永远不阻塞 agent。

```text
Codex plugin hooks ─┐
Claude Code hooks ──┤→ adapter → 统一信号协议 → POST /signal → SuperNoNo 桌宠
generic CLI ────────┘   （本仓库）                （codex-task-pet）
```

详细边界见 [docs/architecture/repo-boundary.md](docs/architecture/repo-boundary.md)。

## 当前状态（2026-07-03）

- SuperNoNo v1.0 桌宠已定版（tag `v1.0.0`），Codex plugin hooks 真实接入已验证。
- 桌宠端 multiagent core（agentStore：多 agent/session 隔离 + attention policy v0 +
  timeline）已在 codex-task-pet 的 `v2/multiagent-work-assistant` 分支完成并验证。
- 本仓库刚建立，第一阶段的工作是 **Claude Code hooks probe**（调研验证，
  产出实测字段记录和 adapter 方案文档），**不急着做完整 orchestrator**。

## 文档地图

| 文档 | 内容 |
| --- | --- |
| [docs/roadmap.md](docs/roadmap.md) | 阶段路线图（probe → adapter MVP → 双 agent 验收 → 体验增强） |
| [docs/handoff/2026-07-03-multiagent-handoff.md](docs/handoff/2026-07-03-multiagent-handoff.md) | 双仓库交接文档：当前状态、验证记录、家里电脑怎么继续 |
| [docs/architecture/repo-boundary.md](docs/architecture/repo-boundary.md) | 两个仓库的职责边界 |
| [docs/architecture/signal-protocol-v0.2-plan.md](docs/architecture/signal-protocol-v0.2-plan.md) | 信号协议 v0.2 增量计划（本仓库从 v0.2 起持有协议规范） |
| [docs/strategy/supernono-v1-closeout-and-multiagent-strategy.md](docs/strategy/supernono-v1-closeout-and-multiagent-strategy.md) | 战略评审：v1.0 收尾裁决 + multiagent 架构建议 + 任务拆分 |
| [docs/prd/multiagent-work-assistant-prd.md](docs/prd/multiagent-work-assistant-prd.md) | 产品 PRD |

## 原则（对所有 adapter 生效）

1. 不让模型花 token 汇报状态——只用 hook / lifecycle / wrapper 等免 token 机制。
2. 只发送结构化摘要，绝不发送 prompt、源码正文、diff、token、密钥。
3. 桌宠未运行时静默失败，绝不影响 agent 本身。
4. 协议 agent-neutral：不为任何 agent 增加专属事件名，差异在 adapter 内消化。
