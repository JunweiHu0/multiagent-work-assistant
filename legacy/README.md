# legacy —— v0 探索存档（2026-07）

这里是本项目 **v0 阶段的探索代码**,已在 2026-07-09 产品转向后归档。**原样可跑、不删**,作为新架构挖概念的参考。当前产品方向见 [../docs/prd/multiagent-director-prd-v1.md](../docs/prd/multiagent-director-prd-v1.md)。

## 这是什么

v0 探索验证了一件事:**能不能免 token 地观测多个闭源 agent、并用一套 agent-neutral 协议把它们的工作状态聚合起来。** 结论是能。副产品是一个桌宠(在 `codex-task-pet` 仓库)+ 一个本地观测核心 + 一层手动的 CLI 记账工具。

## 为什么归档

产品从"多 agent 状态展示 / CLI 记账"转向了 **AI 编排总监**(你交一句抽象任务,它组队→派活→盯场→验收返工)。CLI-记账-当主 UX 这条路被证明摩擦太高,已被 director 方向取代。

## 哪些是"要挖回来"的金子

新架构的观测层会从这里重建,直接参考:

- `orchestrator/relay.js` —— 逐字节透明的事件中继(先应答后异步转发、pet 不在也不丢、只记元数据)。观测层的参考实现。
- `orchestrator/event-log.js` —— 按天 JSONL 事件日志。
- `orchestrator/health-probe.js` —— 链路健康探测。
- **agent-neutral 信号协议**(14 个语义事件、metadata-only)—— 已验证,新方向沿用。

> CC 的 hook 集成金子**不在这里**,在顶层 `adapters/claude-code/`(仍在用)。Codex hook 集成 + 桌宠在 `codex-task-pet` 仓库。

## 哪些是已被取代的（别原样复用）

- `orchestrator/`:`work.js` / `work-store.js` / `summary.js` / `prompt.js` / `phase4.js` / `brain.js` / `workflow-*` + 相关测试 —— 手动记账 CLI,director 方向不再以它为主 UX。
- `brain-python/` —— 确定性 Python planner spike,结论是"现在不深化"。

## 现状

保持完整、可跑,供参考。等新观测层建起来后,可整目录删除(`git rm -r legacy/`)。
