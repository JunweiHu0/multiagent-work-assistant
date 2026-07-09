# Next Task Plan

本文件是 compact 后的短入口。详细历史已归档到：

- `docs/archive/2026-07-09-next-task-plan-archive.md`

当前状态以 `docs/roadmap.md` 为唯一 SoT；如果这里与 roadmap 冲突，以 roadmap 为准。

## 当前阶段

Phase 6A'：真实闭环 hardening + 摩擦削减。

已经完成并提交：

- `T0: Close assistant decision lifecycle and add manager product plan`
- `T3: Embed link health in work status`
- `T4: Add combined work go command`
- `T2: Add semi-automatic run linking`
- `T5: Archive closed session runs`

当前队列状态：

- T7：文档整理完成后，Phase 6 coding 队列在本仓库内暂停。

未在本仓库执行：

- T6 是 `codex-task-pet` 的 pet-only 安全补课，不属于本仓库代码范围。
- T8 是用户真实使用验收，不由 coding agent 代跑。

## 继续工作前先确认

```powershell
cd C:\Users\1\Desktop\project\multiagent-work-assistant
git log --oneline -n 8
git status --short
```

`probe-authcheck.txt` 和 `scratch-probe.txt` 是历史 probe 残留，永远不要提交。

## 当前可用的一轮手动流程

```powershell
node orchestrator\relay.js
node orchestrator\work.js go "Implement small feature" --goal "Codex builds, Claude reviews, user decides"
node orchestrator\work.js status
node orchestrator\work.js link --auto
node orchestrator\work.js decision brief dr1 --notify
node orchestrator\work.js item done wi2 --resolve dr1
node orchestrator\work.js summary --notify
node orchestrator\work.js session close
```

排查历史 run：

```powershell
node orchestrator\work.js status --all
```

## 测试矩阵

提交前至少跑：

```powershell
node --check orchestrator\*.js
node orchestrator\relay-fixture-test.js
node orchestrator\work-store-fixture-test.js
node orchestrator\relay-work-integration-test.js
node orchestrator\summary-fixture-test.js
node orchestrator\prompt-fixture-test.js
node orchestrator\workflow-fixture-test.js
node orchestrator\phase4-fixture-test.js
node orchestrator\workbench-signal-fixture-test.js
node orchestrator\status-health-fixture-test.js
```

如果本机有 Python：

```powershell
$env:SN_PYTHON = "C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
node orchestrator\brain-fixture-test.js
```

## 下一步

下一步不是 Phase 7。

正确顺序：

1. 用户按 T8 跑 2-3 个真实任务。
2. 记录摩擦点和 go/no-go。
3. Fable review 真实使用结果。
4. 只有书面 go + review 通过后，才进入 Phase 7（MCP / dispatch / report protocol）。

## 红线

- 不 spawn agent。
- 不调用 LLM API。
- 不新增 npm 依赖。
- 不读/不记录 prompt、transcript、源码正文、diff、tool output、token、secret。
- 不把 Phase 7 的 MCP / dispatch / report protocol 偷偷提前实现。
