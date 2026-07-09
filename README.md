# Multiagent Work Assistant

SuperNoNo / Multiagent Work Assistant 的大脑仓库：负责接收 Codex、Claude Code 等 coding agent 的本地 hook 信号，记录工作进展，并生成可交接的计划、提示词、决策 brief 与总结。

桌宠 UI 不在本仓库。显示层在 `codex-task-pet`；本仓库只做 adapter、relay、work store、CLI 和文档工件。

## 当前状态

唯一状态来源是 [docs/roadmap.md](docs/roadmap.md)。截至 2026-07-09：

- Codex 与 Claude Code 的真实 hook 接入已经验证过。
- 本仓库已有 Claude Code adapter、brain relay、本地事件日志、work store、summary、prompt pack、decision brief、Python planner spike。
- Phase 6 hardening 已完成本仓库内的 T0/T3/T4/T2/T5/T7。
- 仍然不做自动 spawn agent、不调用 LLM API、不读 prompt/transcript/source/diff/tool output/token/secret。
- Phase 7（MCP server / dispatch / report protocol）仍是未来工作，开工条件见 roadmap。

## 仓库边界

```text
codex-task-pet
  = 脸 / 显示层 / Electron 桌宠 / 127.0.0.1:4174 /signal

multiagent-work-assistant
  = 大脑 / adapter / relay / work store / CLI / Markdown 工件
```

边界说明见 [docs/architecture/repo-boundary.md](docs/architecture/repo-boundary.md)。

## 5 分钟上手

前提：Windows 上已有 Node.js / npm；不需要新增 npm 依赖。

1. 启动 SuperNoNo 桌宠（另一个仓库）：

```powershell
cd C:\Users\1\Desktop\project\codex-task-pet
npm.cmd start
```

2. 启动 brain relay：

```powershell
cd C:\Users\1\Desktop\project\multiagent-work-assistant
node orchestrator\relay.js
```

3. 在启动 agent 的终端里把 adapter 指向 relay：

```powershell
$env:SUPERNONO_BRIDGE_PORT = "4175"
```

4. 创建一轮手动 review-loop：

```powershell
node orchestrator\work.js go "Implement small feature" --goal "Codex builds, Claude reviews, user decides"
```

它会一次性完成：

- 写 `.supernono/plans/*.json` 和 `.md`
- accept 成 WorkSession / WorkItems / DecisionRequest
- 写 `.supernono/prompts/<wsId>/` 下的 Codex / Claude prompt pack

5. 把 prompt 手动复制给 Codex / Claude Code，等 hook 事件进入 relay 后查看状态：

```powershell
node orchestrator\work.js status
node orchestrator\work.js link --auto
node orchestrator\work.js status
```

6. 收尾：

```powershell
node orchestrator\work.js decision brief dr1 --notify
node orchestrator\work.js item done wi2 --resolve dr1
node orchestrator\work.js summary --notify
node orchestrator\work.js session close
```

连续使用后，`session close` 会归档旧 run；默认 `status` / `summary` 不显示 archived run，排查时用：

```powershell
node orchestrator\work.js status --all
```

## 常用命令

```powershell
node orchestrator\health-check.js
node orchestrator\work.js status
node orchestrator\work.js status --all
node orchestrator\work.js link --auto
node orchestrator\work.js summary
node orchestrator\work.js prompt pack ws1
node orchestrator\work.js brain check
```

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [docs/roadmap.md](docs/roadmap.md) | 唯一状态 SoT，下一步看这里 |
| [docs/planning/codex-execution-brief.md](docs/planning/codex-execution-brief.md) | Codex 执行队列、红线和提交标准 |
| [orchestrator/README.md](orchestrator/README.md) | relay / work store / summary / prompt / brain 使用手册 |
| [docs/reviews/2026-07-08-fable5-architecture-code-product-review.md](docs/reviews/2026-07-08-fable5-architecture-code-product-review.md) | Fable5 架构与产品评审 |
| [docs/strategy/2026-07-08-manager-product-plan.md](docs/strategy/2026-07-08-manager-product-plan.md) | Phase 7+ 产品方向，当前只作为未来规划 |

历史规划快照在 `docs/archive/`，不要把它们当作当前状态。

## 安全边界

- 不读、不记录、不发送 prompt / transcript / 源码正文 / diff / tool output / token / secret。
- 只处理 agent hook 已经脱敏后的 signal envelope 元数据和用户手动输入。
- relay 逐字节透明转发，不改协议字段语义。
- adapter / relay / CLI 失败时应尽量不影响 agent 工作。
