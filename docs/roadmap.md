# Roadmap

本文件是 `multiagent-work-assistant` 的唯一状态 SoT。其他 phase 文档和 archive 文档是历史记录或设计背景，不作为当前状态来源。

## Current Status

### Phase 2：真实 adapter 接入

- Phase 2.1：Claude Code hooks probe 完成。
- Phase 2.2.0：Claude Code adapter MVP 完成并通过真实桌面测试。
- Phase 2.3：Codex + Claude Code 双 agent 验收完成，用户报告真实测试通过。
- Phase 2.4：multiagent panel 产品化在 `codex-task-pet` 完成。
- Phase 2.5：adapter install / uninstall / health-check 工具完成。
- Phase 2.6：semantic gates 完成；permission/error/testPass 仍 gated on real structured payload evidence。
- Phase 2.7：真实环境运维验证完成。Phase 2 closed。

### Phase 3：本地 orchestrator MVP

- Phase 3.0：orchestrator 设计完成。
- Phase 3.1：brain relay + local event log 完成。
- Phase 3.2：work store + manual CLI 完成。
- Phase 3.3：metadata-only work summary 完成。
- Phase 3.4：manual orchestration CLI 完成 enough for MVP。
- Phase 3.5：Codex -> Claude review-loop template 完成。
- Phase 3.6：real-use acceptance checklist 完成，但真实使用只拿到 partial pass，后续投入必须谨慎。
- Phase 3.7：summary v2 handoff format 完成。
- Phase 3.8：copyable agent prompt generator 完成。

### Phase 4：半自动 brain

- Phase 4.0-4.6 完成：plan draft、plan accept、prompt pack、decision brief、Python spike conclusion、real-use checklist。
- 仍不 spawn agent，不自动授权，不读正文。

### Phase 5：Python brain layer spike

- Phase 5.0 完成：Node -> Python stdin/stdout planner，metadata-only input，compatible plan draft output。
- 结论：Node 继续做 hooks/relay/CLI/Electron-facing local device layer；Python 暂时只保留为窄边界 planner spike，不深化成主实现。

### Phase 6A'：真实闭环 hardening + 摩擦削减

已完成：

- T0：assistant decision lifecycle 修复与 manager product plan 提交。
- T3：`work status` 内嵌 relay/pet 链路健康；relay 端口占用错误更清楚。
- T4：`work go` 合并 plan draft + accept + prompt pack；`item done --resolve` 合并常见收尾。
- T2：`work link --auto` 半自动链接唯一匹配 run；status 提示可自动链接项。
- T5：`session close` 归档历史 runs；`status` / `summary` 默认隐藏，`status --all` 可见。
- T7：入口文档整理完成。

未由本仓库执行：

- T6：pet-only 安全补课，属于 `codex-task-pet` 仓库。
- T8：真实使用验收，属于用户任务。

## Current Recommended Action

T7 提交后，停止加能力。下一步是 T8：用户用当前手动流程跑 2-3 个真实任务，并写下摩擦点与 go/no-go。

建议流程：

```powershell
node orchestrator\relay.js
node orchestrator\work.js go "<task>" --goal "Codex builds, Claude reviews, user decides"
node orchestrator\work.js status
node orchestrator\work.js link --auto
node orchestrator\work.js decision brief dr1 --notify
node orchestrator\work.js item done wi2 --resolve dr1
node orchestrator\work.js summary --notify
node orchestrator\work.js session close
```

成功标准不是“脚本能跑”，而是回答：

> 下周没有人逼你，你还会自愿用它吗？

## Phase 7 Gate

Phase 7（MCP server / supervised dispatch / agent report protocol）现在不做。

开工条件：

1. T8 有 2-3 次真实任务记录。
2. 用户给出书面 go。
3. Fable / Claude Code 对真实使用结果和 Phase 7 设计做 review。

未满足以上条件时，不实现 MCP、dispatch、report protocol、自动 spawn、自动授权或更多 agent。

## Backlog

- Codex adapter 安装产品化。
- Claude Code Notification / permission_required 结构化证据补测。
- PostToolUse error / testPass 结构化证据补测。
- Store 并发写入策略（如果真实使用中出现竞态）。
- Python path 诊断与更友好的 `brain check`。
- Phase 7 候选：MCP server、supervised dispatch、agent report protocol。
