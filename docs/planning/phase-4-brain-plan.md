# Phase 4 Brain Plan：半自动 SuperNoNo Brain

更新时间：2026-07-08
仓库：`multiagent-work-assistant`

## 目标

Phase 4 的目标不是让 SuperNoNo 自动控制 Codex / Claude Code，而是把 Phase 3 的手动工作流升级成“半自动 brain”：

1. 用户说一个目标。
2. Brain 生成一个可审阅的工作计划草稿。
3. 用户确认后，草稿进入 WorkSession / WorkItem / DecisionRequest。
4. Brain 生成 Codex / Claude Code 的 prompt pack。
5. 用户手动复制 prompt 给 agent。
6. Agent 事件继续通过 relay 进入 work store。
7. Brain 生成 decision brief / summary，提醒用户做判断。

核心原则：**suggest first, execute later**。

## 非目标

Phase 4 仍然不做：

- 不自动启动 agent。
- 不自动授权工具调用。
- 不调用外部 LLM API。
- 不读取 prompt、transcript、源码正文、diff、tool output、token、secret。
- 不把 hooks / relay / CLI 热路径改写成 Python。

## 已实现能力

### 4.1 Plan Draft

命令：

```cmd
node orchestrator\work.js plan draft "实现功能 X" --goal "Codex build, Claude review, user decides"
```

输出：

```text
.supernono/plans/plan-YYYYMMDD-HHMMSS.json
.supernono/plans/plan-YYYYMMDD-HHMMSS.md
```

当前 planner 是 deterministic template，只支持 `review-loop`：

- Codex build WorkItem
- Claude Code review WorkItem
- 一个用户 decision gate
- 一组执行 checklist

### 4.2 Plan Accept

命令：

```cmd
node orchestrator\work.js plan accept .supernono\plans\plan-xxx.json
```

效果：

- 创建 WorkSession。
- 创建 WorkItems。
- 设置 assignedAgent。
- 创建 DecisionRequest。
- 在 plan JSON 里写入 `acceptedAt` / `acceptedSessionId`，默认阻止重复 accept。

### 4.3 Prompt Pack

命令：

```cmd
node orchestrator\work.js prompt pack ws1
```

输出：

```text
.supernono/prompts/ws1/codex-wi1.md
.supernono/prompts/ws1/claude-code-wi2.md
.supernono/prompts/ws1/user-checklist.md
.supernono/prompts/ws1/README.md
```

prompt pack 只是可复制文本，不会自动发送给任何 agent。

### 4.4 Decision Brief

命令：

```cmd
node orchestrator\work.js decision brief dr1
node orchestrator\work.js decision brief dr1 --notify
```

输出：

```text
.supernono/briefs/decision-dr1-YYYYMMDD-HHMMSS.md
```

`--notify` 会以 `agent:"assistant"` / `adapter:"workbench"` / `type:"permission_required"` 发给 pet，让桌宠提醒用户有一个需要拍板的问题。

### 4.5 Python Brain Spike 结论

现阶段不引入 Python 重写。

保留 Node.js 的原因：

- hooks / relay / CLI 是本地、低延迟、少依赖的热路径。
- 当前 planner 是确定性模板，不需要 Python 的生态优势。
- Electron / adapter / relay 已经是 Node 体系，改写成本高，收益低。

以后可以引入 Python 的边界：

- planner / evaluator / memory / RAG。
- 通过 stdin/stdout JSON 或本地服务与 Node CLI 通讯。
- 不进入 hooks 热路径，不读取敏感正文，不直接控制 agent。

## 推荐使用流

```cmd
node orchestrator\relay.js
node orchestrator\work.js plan draft "实现功能 X" --goal "Codex builds, Claude reviews, user decides"
node orchestrator\work.js plan accept .supernono\plans\plan-xxx.json
node orchestrator\work.js prompt pack ws1
```

然后手动把 prompt 分别复制给 Codex 和 Claude Code。Agent 跑完后：

```cmd
node orchestrator\work.js status
node orchestrator\work.js item link wi1 codex:<sessionId>
node orchestrator\work.js item link wi2 claude-code:<sessionId>
node orchestrator\work.js decision brief dr1 --notify
node orchestrator\work.js decision resolve dr1 accept
node orchestrator\work.js item done wi1
node orchestrator\work.js item done wi2
node orchestrator\work.js summary --notify
```

## 验收

自动验收：

```cmd
node --check orchestrator\phase4.js
node --check orchestrator\phase4-fixture-test.js
node --check orchestrator\work.js
node orchestrator\phase4-fixture-test.js
```

真实验收见：`docs/acceptance/phase-4-semi-automatic-brain.md`。
