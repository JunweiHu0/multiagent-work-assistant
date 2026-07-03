# 仓库边界：codex-task-pet 与 multiagent-work-assistant

- 日期：2026-07-03
- 状态：已决策，生效中

## 决策

桌面宠物与 multiagent 工作助理拆成两个仓库：

| | codex-task-pet | multiagent-work-assistant |
| --- | --- | --- |
| GitHub | https://github.com/JunweiHu0/codex-task-pet | https://github.com/JunweiHu0/multiagent-work-assistant |
| 定位 | **脸 / 显示层** | **大脑 / 聚合层** |
| 一句话 | SuperNoNo 桌宠 UI + `/signal` 本地桥 + Codex pet v1.0 | adapter、agent 状态聚合、attention policy、协议与架构文档 |

两者唯一的运行时耦合点是本地信号协议：
`POST http://127.0.0.1:4174/signal`（loopback-only）。任何一侧都可以独立
开发、独立发布——桌宠没运行时 adapter 静默失败；没有任何 adapter 时桌宠
照常以 demo/单 agent 模式工作。

## codex-task-pet 保留什么

- Electron 桌宠 UI（透明窗口、拖拽、托盘、面板、气泡、设置）
- Live2D / SVG 视觉资产与渲染
- `/signal` 本地桥（Electron main 进程内的 loopback HTTP 服务）
- renderer 状态展示层（signalAdapter / stateEngine / pet / panel）
- Codex plugin hooks 的 **pet-side 验证**（`plugins/supernono-codex/`、
  `adapters/codex-desktop/` 的既有实现原样保留，作为已验证的第一个接入）
- `v2/multiagent-work-assistant` 分支里的 **agentStore**：视作 pet 端的
  展示层实验（多 agent 状态在 UI 侧如何呈现、focus 如何切换）。它解决的是
  "桌宠如何显示多个 agent"，不承担聚合层的长期职责

## multiagent-work-assistant 负责什么

- multiagent 的 PRD / strategy / handoff / roadmap 等产品与架构文档（本仓库）
- **Claude Code adapter**（probe → 方案文档 → MVP 实现）
- **Codex adapter 的外部化设计**：把 codex-task-pet 里验证过的接入方式
  （plugin hooks + notify wrapper）抽象成可独立安装、不依赖 pet 仓库源码树的形态
- **generic-cli adapter**（`supernono-run -- <cmd>` 一类的包装器）
- **agent registry**：注册/发现有哪些 agent、adapter、会话
- **attention policy**：跨 agent 的优先级与提醒策略（pet 端 v0 只是展示层
  实现，策略的长期归属在这里）
- **event timeline 与未来的持久化**（JSONL 事件日志等，按战略文档 5.7 节
  的判断，MVP 不上数据库）
- **signal protocol v0.2+**：从 v0.2 起，协议规范的权威版本在本仓库维护
  （见 [signal-protocol-v0.2-plan.md](signal-protocol-v0.2-plan.md)）；
  codex-task-pet 是协议的实现方之一
- 后续真正的个人工作助理逻辑（聚合、路由、可能的 orchestrator——**现阶段
  明确不做**）

## 边界纪律

1. 不在 pet 仓库里加聚合层逻辑；不在本仓库里做 UI。
2. 协议改动一律先在本仓库落规范文档，再到 pet 仓库改实现。
3. adapter 代码的长期家在本仓库；pet 仓库里的 `plugins/supernono-codex/`
   与 `adapters/` 保持可用但冻结，外部化完成后再决定是否收敛。
4. 两个仓库都遵守同一套隐私铁律：只传摘要，不传 prompt / 源码正文 /
   diff / token / 密钥；adapter 静默失败。
