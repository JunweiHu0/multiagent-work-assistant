# Roadmap — Multiagent Work Assistant

- 更新：2026-07-03
- 详细依据：[战略评审文档](strategy/supernono-v1-closeout-and-multiagent-strategy.md)
  第 6 节（Phase 0-4）与第 7 节（任务拆分）。本文件是拆库后的执行视图。

## 已完成（在 codex-task-pet 仓库）

- **Phase 0**：SuperNoNo v1.0 收尾（tag `v1.0.0`）。Codex plugin hooks 真实
  接入已验证；打包卫生与 README 收口已完成。遗留：T0.2 桥接安全加固、
  T0.3 公开构建资产门禁（公开发布前 P0）。
- **Phase 1（pet 端 multiagent core）**：`v2/multiagent-work-assistant` 分支。
  agentStore（agent+sessionId 隔离、attention policy v0、timeline ring buffer、
  focused agent）+ multiagent 面板 + 双 agent manual test。含两个边界修复
  （淘汰保护、no-session settle 路由保护），Node 冒烟 + 端到端均验证通过。

## 进行中 / 下一步（本仓库）

### Phase 2.1 — Claude Code hooks probe（当前第一优先级）

- 目标：用诊断 hook 实测 Windows 下 Claude Code hooks
  （PreToolUse / PostToolUse / Notification / Stop）的 stdin 字段结构、cwd、
  node 可执行性（Codex 那次的已知坑型）。
- 交付物：`adapters/claude-code/probe/` 诊断脚本（✅ 已就绪，自测 24 项通过）+
  `docs/claude-code/claude-code-hooks-probe-plan.md`（接入/触发/判据，✅）+
  `docs/claude-code/claude-code-adapter-mapping.md`（adapter 蓝图，✅ 待 probe 回填）。
  剩余：真实 hook 触发 → 回填 probe 结论。
- 不做：正式 adapter 实现、UI 改动、orchestrator。
- 验收：四类事件的脱敏字段样例齐全；`session_id` 存在性有结论；
  node 路径策略有结论。

### Phase 1.1 — 协议 v0.2 落地（与 2.1 并行可做）

- 目标：按 [signal-protocol-v0.2-plan.md](architecture/signal-protocol-v0.2-plan.md)
  在本仓库落权威规范；pet 端只做版本号与文档指向调整。
- 顺手：把 pet 端的 Node 冒烟测试固化成仓库内脚本（见交接文档第 4 节）。

### Phase 2.2 — Claude Code adapter MVP

- 目标：按 probe 结论实现事件转发（映射表见战略文档 5.4 节）。
- 原则：`session_id` → `sessionId`；复用免依赖 sender；不读 transcript /
  UserPromptSubmit；桌宠未运行静默失败。
- 验收：真实 Claude Code 会话驱动桌宠，`agent: "claude-code"` 卡片正确。

### Phase 2.3 — Codex + Claude Code 双 agent 真实并发验收

- 目标：两个真实 agent 各跑一个任务，日常自用一周。
- 验收：卡片归属正确；permission/blocked 5 秒内成为宠物焦点；杀掉桌宠
  两个 agent 无感知；主观"切窗口检查次数变少"。

### Phase 3 — 个人工作助理体验增强（按真实痛点驱动，不预设）

候选：JSONL 事件日志与历史回看、staleness 主动提醒、attention policy 可配置、
Codex adapter 外部化（脱离 pet 仓库源码树）、generic-cli adapter、agent registry。

### Phase 4 — 长期产品化（不排期）

installer、开机自启、更多 agent、可能的 dashboard 形态。在助理主线明确前
不投入重型产品化。

## 北极星

> 把用户从"轮询多个 agent 窗口"变成"被正确的事情打断"。

衡量：切窗口检查 agent 的次数下降；permission/blocked 从发生到用户响应的
延迟下降。所有功能取舍以此为准。
