# Multiagent Work Assistant 下一阶段任务规划

- 日期：2026-07-06
- 主仓库：`multiagent-work-assistant`
- 关联显示层仓库：`codex-task-pet`
- 当前阶段：Phase 2.2.0 adapter MVP 已完成并通过真实测试，当前进行 **Phase 2.3 双 agent 并发验收**
- 本文目的：在上下文 compact 或换电脑后，继续按本文推进，不依赖聊天历史。

---

## 0. Compact 后先看这里

当前最新可靠进展（2026-07-06 晚更新）：

- `multiagent-work-assistant` 的 `main` 已提交到：`9859124 Add Claude Code adapter MVP`。
- ✅ Phase 2.1 probe 完成（结论在 `docs/claude-code/claude-code-hooks-probe-plan.md` §7）：
  真实记录覆盖 `SessionStart` / `PreToolUse`(Bash/Read/Write) / `PostToolUse` / `Stop`；
  `Notification` 未观测到；失败态无可靠结构化字段。
- ✅ **Phase 2.2.0 Claude Code adapter MVP 完成并通过真实测试**（`adapters/claude-code/`）：
  fixture 24/24（含泄漏自检、无桥接 <50ms 静默退出）、真实桌宠端到端投递通过。
  范围 = `Bash -> command_running`、`Read/Grep/Glob/WebFetch/WebSearch -> file_reading`、
  `Write/Edit/MultiEdit/NotebookEdit -> file_editing`、`PostToolUse -> step_done`、`Stop -> turn_ended`。
- 🔄 **Phase 2.3 当前目标**：真实 Codex + Claude Code 双 agent 并发验收。
  验收文档 `docs/acceptance/phase-2-3-dual-agent-acceptance.md` + 仿真脚本
  `adapters/shared/manual-realistic-dual-agent-test.js` 已就绪；仿真层已通过
  （pet 端断言 19/19、真实桌宠投递 7/7、旧 manual-multiagent-test 9/9 不受影响、
  未发现 pet 端 multiagent bug）；**真实层人工并发测试待执行**（验收文档 §3）。
- ⛔ 仍明确不在本阶段：`Notification -> permission_required`（桌面版实测未触发该
  hook，待新证据）、`permission_resolved` 合成、`PostToolUse -> error`、`testPass`
  能量规则。

当前工作树注意事项：

- 可能还存在两个 probe 测试残留未跟踪文件：`probe-authcheck.txt`、`scratch-probe.txt`。它们不应提交。
- `.claude/`、`probe-observed.jsonl`、`probe-fixture-output.jsonl` 已被 ignore。

---

## 1. 项目边界

SuperNoNo 已拆成两个仓库方向：

1. `codex-task-pet`：桌宠显示层。
   - 负责 Electron 桌宠 UI、托盘、小窗、面板、Live2D/SVG、`127.0.0.1:4174/signal` 本地桥。
   - `main` 可视为 v1.0 桌宠稳定线。
   - `v2/multiagent-work-assistant` 分支已经完成 pet-side Multiagent Core MVP。

2. `multiagent-work-assistant`：multiagent 工作助理核心。
   - 负责 agent adapter、协议演进、Claude Code 接入、事件聚合、attention policy、未来个人工作助理逻辑。
   - 这是后续主战场。

一句话边界：

> `multiagent-work-assistant` 是大脑，`codex-task-pet` 是脸。大脑产生/聚合事件，脸通过 `/signal` 接收并展示事件。

---

## 2. 已完成状态

### 2.1 `codex-task-pet` 已完成

- v1.0 桌宠基础可用。
- Codex Desktop plugin hooks 已真实跑通。
- Codex plugin hooks 主链路可发送：
  - `command_running`
  - `step_done`
  - `permission_required`
- Codex notify wrapper 只作为粗粒度 fallback，发送 `turn_ended`。
- 本地桥：`POST http://127.0.0.1:4174/signal`。
- 统一事件协议文档：`docs/supernono-signal-protocol.md`。
- `v2/multiagent-work-assistant` 分支已完成 pet-side Multiagent Core MVP：
  - `src/renderer/js/agentStore.js`
  - `SuperNoNo.getAgents()`
  - `SuperNoNo.getTimeline()`
  - `SuperNoNo.getFocusedAgent()`
  - `adapters/shared/manual-multiagent-test.js`

### 2.2 `multiagent-work-assistant` 已完成

文档与仓库结构：

- `docs/architecture/`
- `docs/handoff/`
- `docs/prd/`
- `docs/strategy/`
- `docs/roadmap.md`
- `docs/planning/next-task-plan.md`

Claude Code probe 交付：

- `adapters/claude-code/probe/probe-hook.js`
- `adapters/claude-code/probe/fixture-test.js`
- `docs/claude-code/claude-code-hooks-probe-plan.md`
- `docs/claude-code/claude-code-adapter-mapping.md`

验证结果：

- `node --check adapters/claude-code/probe/probe-hook.js` 通过。
- `node --check adapters/claude-code/probe/fixture-test.js` 通过。
- `node adapters/claude-code/probe/fixture-test.js` 为 `ALL PASS`。
- fixture 输出通过 `SN_CC_PROBE_OUT` 分离，不再污染真实 probe 日志。

---

## 3. Phase 2.1 真实 probe 结论

真实 Claude Code 桌面版路 A probe 已观测：

| hook / tool | 记录数 | 结论 |
| --- | ---: | --- |
| `SessionStart` | 3 | 会话启动会触发；字段含 `session_id` / `transcript_path` / `cwd` / `hook_event_name` / `source` |
| `PreToolUse:Bash` | 3 | 字段含 `tool_input.command` / `tool_input.description` / `tool_use_id` |
| `PostToolUse:Bash` | 2 | 字段含 `tool_response.stdout` / `stderr` / `interrupted` / `isImage` / `noOutputExpected` / `duration_ms` |
| `PreToolUse:Read` | 1 | 字段含 `tool_input.file_path` |
| `PostToolUse:Read` | 1 | `tool_response.file.content` 会出现为 `string(len=N)`，正式 adapter 必须忽略正文 |
| `PreToolUse:Write` | 1 | 字段含 `tool_input.file_path` / `tool_input.content`，正式 adapter 只取 basename |
| `PostToolUse:Write` | 1 | `tool_response.content` / `structuredPatch` 会出现，正式 adapter 必须忽略正文和 patch |
| `Stop` | 1 | 字段含 `last_assistant_message: string(len=N)`，正式 adapter 只发 `turn_ended` |
| `Notification` | 0 | 未观测到，不能上线权限识别 |

已确认：

- 裸 `node` 在桌面版 Claude Code hook 环境可解析。
- `cwd` 稳定为项目目录。
- 已观测事件全部携带 `session_id: string(len=36)`。
- 环境变量里有 `CLAUDE_CODE_SESSION_ID`，可作为 sessionId fallback。
- 本轮 13 次 hook 调用未观察到明显卡顿。

未确认：

- `Notification` 是否能表示权限请求或空闲等待。
- `PostToolUse` 是否有可靠结构化失败字段。

直接结论：

> Phase 2.2 可以做 Claude Code adapter MVP，但第一版不要做 `permission_required` 和通用 `error`。

---

## 4. 现在不要做什么

为了避免重新陷入桌宠打磨，本阶段明确不做：

- 不继续优化桌宠 UI、Live2D、hover、窗口尺寸。
- 不重写 `codex-task-pet` 的 `stateEngine.js`。
- 不改 Codex plugin hooks 的已验证映射。
- 不做完整权限链路。
- 不做通用 error 推断。
- 不做 orchestrator、大型 dashboard、数据库、云同步。
- 不把 prompt、源码正文、diff、transcript、tool output、token、secret 写入日志或 signal。

---

## 5. 当前阶段总目标

当前阶段是 **Phase 2.3：真实 Codex + Claude Code 双 agent 并发验收**。

Phase 2.2.0 Claude Code adapter MVP 已完成并通过真实测试；Phase 2.3 的仿真层也已完成。接下来不要再重做 adapter，重点是完成真实层人工验收：让真实 Codex Desktop 和真实 Claude Code 同时向 SuperNoNo 发事件，确认 pet-side multiagent core 在真实并发下仍能正确处理事件归属、attention 切换、timeline 展示和状态恢复。

本阶段完成标准：

- Codex 真实任务能通过 `codex-plugin-hooks` 进入桌宠。
- Claude Code 真实会话能通过 `claude-code-hooks` 进入桌宠。
- 面板能同时出现 codex 与 claude-code 两个 agent/session。
- 两边交替工作时，focus 按 attention policy v0 切换。
- 任一方先结束时，不清掉另一方仍在工作的状态。
- 两边都结束后，桌宠安静回 idle。

---

## 6. Phase 2.3 执行清单

### T2.3.1 提交仿真层交付物

本轮已新增/更新：

```text
docs/acceptance/phase-2-3-dual-agent-acceptance.md
adapters/shared/manual-realistic-dual-agent-test.js
docs/planning/next-task-plan.md
```

提交前注意：

- 不要提交 `probe-authcheck.txt`。
- 不要提交 `scratch-probe.txt`。
- 不要提交 `.claude/` 或 probe runtime 日志。

建议提交命令：

```cmd
cd C:\Users\1\Desktop\project\multiagent-work-assistant
git add docs/acceptance/phase-2-3-dual-agent-acceptance.md adapters/shared/manual-realistic-dual-agent-test.js docs/planning/next-task-plan.md
git commit -m "Add dual-agent acceptance plan"
git push
```

### T2.3.2 跑仿真层脚本

先启动桌宠：

```cmd
cd C:\Users\1\Desktop\project\codex-task-pet
npm.cmd start
```

另开终端运行：

```cmd
cd C:\Users\1\Desktop\project\multiagent-work-assistant
node adapters\shared\manual-realistic-dual-agent-test.js
```

预期：

- 脚本 `7/7 delivered`。
- 托盘任务面板出现 codex 和 claude-code 两张卡片。
- `SuperNoNo.getAgents()` 有 `codex:codex-s1` 与 `claude-code:claude-s1`。
- `SuperNoNo.getTimeline()` 有 7 条交错事件。

### T2.3.3 跑真实层人工并发验收

按 [Phase 2.3 验收文档](../acceptance/phase-2-3-dual-agent-acceptance.md) 第 3 节执行：

1. 启动 `codex-task-pet` 桌宠。
2. 确认 Codex plugin hooks 已安装并 trust。
3. 确认 Claude Code hooks 已安装到测试项目的 `.claude/settings.json`，并开新会话。
4. 在 Codex Desktop 里触发真实 shell 命令，例如 `echo codex-live-test`。
5. 在 Claude Code 里触发真实 shell 命令，例如 `echo cc-live-test`，再读/写一个安全 scratch 文件。
6. 观察面板里两个 agent 的状态、focus、timeline。

真实层通过后，在验收文档第 6 节或后续记录里补一句实际结果，包括：

- 是否出现两个 agent 卡片。
- focus 切换是否符合预期。
- 是否发现 pet-side multiagent bug。
- 是否有安装/信任/路径类问题。

---

## 7. Phase 2.4 候选：Multiagent Panel 产品化

Phase 2.3 真实层通过后，再进入 **Phase 2.4：Multiagent Panel 产品化**。

目标不是改小窗，也不是继续打磨 Live2D，而是让托盘任务面板真正适合作为“个人工作助理控制台”：

- agent 卡片更清楚地区分 `codex` / `claude-code`。
- 每张卡显示当前状态、最近动作、sessionId 简写、最后活跃时间。
- 支持点击 agent 卡片切换 focus。
- 支持 pin 某个 agent，避免 attention policy 自动抢焦。
- timeline 支持按 agent 过滤。
- 增加 staleness 提醒：某 agent 长时间没有进展时标记“可能卡住”。
- 保持 Nono 主体小窗小巧，不做大窗口回退。

Phase 2.4 开始前，应先把 Phase 2.3 真实层体感记录下来，因为 panel 设计要基于真实并发时的痛点，而不是凭空设计。

---

## 8. 后续 Backlog

这些任务暂不阻塞 Phase 2.3 / 2.4：

### Notification / Permission 补测

当前桌面版 Claude Code probe 未观察到 `Notification` hook，因此暂不实现：

- `Notification -> permission_required`
- `permission_resolved` 合成

只有在新的真实 payload 证明它稳定可用后再做。

### Error / TestPass 补测

当前 `PostToolUse` 未观察到可靠的结构化失败字段，且不能读取 stdout/stderr 正文推断结果。因此暂不实现：

- `PostToolUse -> error`
- 测试成功时的 `testPass` 能量规则

后续只允许基于安全的小字段判断，不允许把 tool output、源码、diff、prompt、transcript 发进 signal 或日志。

### 安装与健康检查产品化

后续可以考虑：

- Claude Code adapter 安装脚本。
- Codex plugin hooks 安装/刷新脚本。
- 检查 `127.0.0.1:4174` 桥是否可用。
- 检查 Node 是否可被 hook 环境找到。
- 生成 adapter health report。

---

## 9. 本地开发流程

### 9.1 拉取两个仓库

```cmd
git clone https://github.com/JunweiHu0/codex-task-pet.git
git clone https://github.com/JunweiHu0/multiagent-work-assistant.git
```

如果已经 clone：

```cmd
cd C:\path\to\codex-task-pet
git fetch origin
git switch v2/multiagent-work-assistant
git pull

cd C:\path\to\multiagent-work-assistant
git pull
```

### 9.2 启动桌宠显示层

```cmd
cd C:\path\to\codex-task-pet
npm.cmd install
npm.cmd start
```

### 9.3 验证 pet-side multiagent core

```cmd
cd C:\path\to\multiagent-work-assistant
node adapters\shared\manual-realistic-dual-agent-test.js
```

也可以在 `codex-task-pet` 仓库跑旧脚本，确认单仓库手动测试未回归：

```cmd
cd C:\path\to\codex-task-pet
node adapters\shared\manual-multiagent-test.js
```

---

## 10. Git 约定

### `codex-task-pet`

- `main`：桌宠 v1.0 稳定线。
- `v2/multiagent-work-assistant`：pet-side multiagent 显示实验。
- 不在这里承载 multiagent 核心逻辑。

### `multiagent-work-assistant`

- `main`：multiagent 主线。
- 当前仓库承载 docs、probe、adapter、验收脚本与未来 orchestrator。

### 提交粒度

推荐阶段提交：

```text
1. Add Claude Code adapter MVP
2. Add dual-agent acceptance plan
3. Record real dual-agent acceptance result
4. Improve multiagent panel
5. Add adapter health check
```

---

## 11. 给后续 CC / Codex 的启动提示词

可以直接复制给后续 coding agent：

```text
请继续 SuperNoNo multiagent 工作助理项目。

当前有两个仓库：

1. codex-task-pet
- 负责桌宠显示层和 /signal 本地桥。
- pet-side multiagent core 在 v2/multiagent-work-assistant 分支。

2. multiagent-work-assistant
- 负责 multiagent 核心、Claude Code adapter、验收文档和后续工作助理逻辑。

请先阅读：
- docs/planning/next-task-plan.md
- docs/acceptance/phase-2-3-dual-agent-acceptance.md
- adapters/claude-code/README.md
- docs/claude-code/claude-code-adapter-mapping.md
- C:\Users\1\Desktop\project\codex-task-pet\docs\supernono-signal-protocol.md

当前状态：
- Phase 2.1 Claude Code hooks probe 已完成。
- Phase 2.2.0 Claude Code adapter MVP 已完成并通过真实测试。
- Phase 2.3 仿真层已完成：manual-realistic-dual-agent-test.js 可以模拟 codex + claude-code 双 agent。
- 下一步是完成 Phase 2.3 真实层人工并发验收：真实 Codex Desktop + 真实 Claude Code 同时驱动桌宠。

请不要重做 Claude Code adapter MVP。
请不要实现 Notification/permission_required/error/testPass。
请不要改 Live2D、小窗 UI、stateEngine、Codex plugin hooks。

你要做的是：
1. 按 docs/acceptance/phase-2-3-dual-agent-acceptance.md 跑真实层验收。
2. 记录真实 Codex + Claude Code 并发时的表现。
3. 如果发现 pet-side multiagent bug，只做最小修复并说明复现路径。
4. 验收通过后，再提出 Phase 2.4 Multiagent Panel 产品化的具体方案。

完成后汇报：
- 实际执行的验收步骤。
- 观察到的 SuperNoNo.getAgents() / getTimeline() 结果。
- 是否发现 bug。
- 是否可以进入 Phase 2.4。
```

---

## 12. 当前成功标准

Phase 2.3 成功标志：

- 仿真脚本能稳定投递 codex + claude-code 双 agent 事件。
- 真实 Codex Desktop 能发送 `codex-plugin-hooks` 事件。
- 真实 Claude Code 能发送 `claude-code-hooks` 事件。
- agentStore 能按 `agent:sessionId` 正确隔离。
- timeline 中两个 agent 的事件归属正确。
- attention policy v0 在真实并发中体感可接受。
- 任一 agent 的 `turn_ended` 不影响另一个仍在工作的 agent。
- 全部结束后桌宠回 idle/resting。

完成这些后，再进入 Phase 2.4。
