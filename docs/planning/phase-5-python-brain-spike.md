# Phase 5 Python Brain Spike

更新时间：2026-07-08
仓库：`multiagent-work-assistant`

## 目标

Phase 5 验证最初的分层设想：

```text
Node / npm：设备层、本地桥接层、hooks、relay、CLI、Electron-facing glue
Python：更深的 agent brain、planner、evaluator、memory、RAG、复杂 multiagent 编排
```

本阶段只做一个安全的 Python brain spike：Node CLI 通过 stdin/stdout JSON 调用 Python planner，Python 返回标准 `supernono.planDraft.v1` 草稿。它不调用 LLM、不启动 agent、不读仓库正文、不进入 hooks 热路径。

## 新增组件

| 文件 | 职责 |
| --- | --- |
| `brain-python/planner.py` | 依赖为零的 deterministic Python planner：stdin JSON -> plan draft JSON。 |
| `brain-python/README.md` | Python brain 边界说明。 |
| `orchestrator/brain.js` | Node <-> Python 边界：发现 Python、构造 metadata-only 输入、调用 planner、校验 draft、写 `.json/.md`。 |
| `orchestrator/brain-fixture-test.js` | 验证 Node->Python 边界、plan draft schema、payload 不泄漏。 |
| `orchestrator/work.js` | 新增 `brain check` / `brain plan` CLI。 |

## 命令

如果系统没有全局 Python，先设置 `SN_PYTHON`：

```cmd
set SN_PYTHON=C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
```

检查 Python brain 是否可用：

```cmd
node orchestrator\work.js brain check
```

用 Python brain 生成计划草稿：

```cmd
node orchestrator\work.js brain plan "实现功能 X" --goal "Codex builds, Claude reviews, user decides"
```

输出：

```text
.supernono/plans/brain-plan-YYYYMMDD-HHMMSS.json
.supernono/plans/brain-plan-YYYYMMDD-HHMMSS.md
```

后续沿用 Phase 4：

```cmd
node orchestrator\work.js plan accept .supernono\plans\brain-plan-xxx.json
node orchestrator\work.js prompt pack ws1
```

## 数据边界

Node 传给 Python 的输入是 metadata-only：

- `title`
- `goal`
- `mode`
- active WorkSession 的 id/title/goal/status
- WorkItem 的 id/title/role/assignedAgent/status
- AgentRun 的 id/agent/state/lastEventType
- open DecisionRequest 的 id/summary/workItemId/kind

明确不传：

- prompt
- transcript
- source body
- diff
- tool output
- command payload body
- token / secret
- HTTP headers

## Python 失败策略

- Python 不存在：Node 报错，提示设置 `SN_PYTHON`。
- Python 返回非 0：Node 报错并截断显示 stderr。
- Python 返回非法 JSON / 非 plan schema：Node 拒绝写入 plan。
- Python 失败不影响 hooks、relay、pet；它只在用户主动执行 `brain plan` 时运行。

## 设计结论

当前不做全仓库 Python 重写。合理分层是：

- Node 保留在本地设备层与热路径：hooks / relay / CLI / Electron-facing glue。
- Python 只承接未来更深的 brain：planner / evaluator / memory / RAG / heavier orchestration。
- Node <-> Python 之间使用 JSON 边界，先 stdin/stdout，未来需要时再改成本地服务。

## 验收

```cmd
set SN_PYTHON=C:\Users\1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
node --check orchestrator\brain.js
node --check orchestrator\brain-fixture-test.js
node --check orchestrator\work.js
node orchestrator\brain-fixture-test.js
node orchestrator\work.js brain check
node orchestrator\work.js brain plan "Python brain smoke" --goal "Validate Phase 5 CLI"
```

完成标准：

- Python planner 返回 `supernono.planDraft.v1`。
- plan 可被 `plan accept` 接受。
- prompt pack 可继续生成。
- 测试证明事件 payload 不进入 Python 输入/输出。
