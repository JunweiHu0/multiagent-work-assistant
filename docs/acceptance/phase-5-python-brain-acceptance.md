# Phase 5 Python Brain Acceptance

目标：验证 Python 可以作为独立 brain layer 接入，而不破坏 Node 设备层。

## 前置

如果系统没有全局 Python，设置：

```cmd
set SN_PYTHON=C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
```

## 自动验收

```cmd
cd C:\Users\1\Desktop\project\multiagent-work-assistant
node --check orchestrator\brain.js
node --check orchestrator\brain-fixture-test.js
node --check orchestrator\work.js
node orchestrator\brain-fixture-test.js
```

通过标准：

- fixture 输出 `ALL PASS`。
- Python 返回标准 plan draft。
- fixture 中的假 command payload 不出现在 Python 输入、plan JSON、plan Markdown。

## CLI 验收

```cmd
node orchestrator\work.js brain check
node orchestrator\work.js brain plan "一个真实小任务" --goal "Codex builds, Claude reviews, user decides"
node orchestrator\work.js plan accept .supernono\plans\brain-plan-xxx.json
node orchestrator\work.js prompt pack ws1
node orchestrator\work.js status
```

通过标准：

- `brain check` 显示 `OK Python brain planner`。
- `brain plan` 生成 `.supernono/plans/brain-plan-*.json` 与 `.md`。
- `plan accept` 创建 WorkSession / WorkItems / DecisionRequest。
- `prompt pack` 可以继续生成 Codex / Claude Code prompts。

## 不通过标准

如果出现以下情况，不应该继续扩大 Python 层：

- Python 调用让 CLI 变慢或不稳定。
- planner 输出比 Phase 4 deterministic template 更难用。
- Python 层开始想读取源码正文、diff、tool output 或 transcript。
- 需要把 Python 放进 hooks 热路径才能工作。

## Review Prompt

```text
请 review SuperNoNo Phase 5 Python Brain Spike。
重点看：
1. Node / Python 分层是否清晰。
2. Python planner 的 stdin/stdout JSON 接口是否足够稳定。
3. 是否遵守边界：Python 不进 hooks 热路径，不读 prompt/transcript/source/diff/tool output/token/secret。
4. 下一步是否值得把 planner 从 deterministic template 升级为 LLM planner，还是先改善 link/status/decision 的手动成本。
请输出 findings、风险、go/no-go 和下一阶段建议。
```
