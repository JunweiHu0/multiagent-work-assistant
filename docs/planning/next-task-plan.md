# Multiagent Work Assistant 下一阶段任务规划

- 日期：2026-07-07
- 主仓库：`multiagent-work-assistant`
- 关联显示层仓库：`codex-task-pet`
- 当前阶段：Phase 2 全部收口（2.1–2.7 完成），当前进行 **Phase 3.0 orchestrator 设计**，设计文档见 `docs/planning/phase-3-orchestrator-plan.md`
- 本文目的：在上下文 compact 或换电脑后，继续按本文推进，不依赖聊天历史。

---

## 0. Compact 后先看这里

当前最新可靠进展（2026-07-07 compact 前更新）：

- `multiagent-work-assistant` 的 `main` 已提交到：`c8e69a5 Add adapter install health checks and semantic gates`。
- ✅ Phase 2.1 probe 完成（结论在 `docs/claude-code/claude-code-hooks-probe-plan.md` §7）：
  真实记录覆盖 `SessionStart` / `PreToolUse`(Bash/Read/Write) / `PostToolUse` / `Stop`；
  `Notification` 未观测到；失败态无可靠结构化字段。
- ✅ **Phase 2.2.0 Claude Code adapter MVP 完成并通过真实测试**（`adapters/claude-code/`）：
  fixture 24/24（含泄漏自检、无桥接 <50ms 静默退出）、真实桌宠端到端投递通过。
  范围 = `Bash -> command_running`、`Read/Grep/Glob/WebFetch/WebSearch -> file_reading`、
  `Write/Edit/MultiEdit/NotebookEdit -> file_editing`、`PostToolUse -> step_done`、`Stop -> turn_ended`。
- ✅ **Phase 2.3 已完成**：真实 Codex + Claude Code 双 agent 并发验收通过。
  验收文档 `docs/acceptance/phase-2-3-dual-agent-acceptance.md` + 仿真脚本
  `adapters/shared/manual-realistic-dual-agent-test.js` 已就绪；仿真层已通过
  （pet 端断言 19/19、真实桌宠投递 7/7、旧 manual-multiagent-test 9/9 不受影响、
  未发现 pet 端 multiagent bug）；**真实层人工并发测试已由用户确认通过**（验收文档 §3）。
- ✅ **Phase 2.4 已完成**：`codex-task-pet` 的 multiagent panel 产品化完成，支持卡片 focus、pin、timeline filter、stale 提示。
- ✅ **Phase 2.5 已完成**：Claude Code adapter 增加 `install.js` / `uninstall.js` / `health-check.js` / 安装 fixture。
- ✅ **Phase 2.6 已完成**：语义门已落地，`permission_required` / `error` / `testPass` 仍等待真实结构化 payload 后再接入 live hooks。
- ✅ **Phase 2.7 已完成**（2026-07-07，用户真实环境确认）：install → health-check →
  live hook（真实 Claude Code 会话驱动桌宠）→ uninstall → 恢复 全链路跑通，
  adapter 可在新项目与真实项目中低成本重复接入。Phase 2 全部收口。
- ✅ **Phase 3.0 已完成**：orchestrator 设计文档
  `docs/planning/phase-3-orchestrator-plan.md`（记账员+中继站+发言人、relay
  架构、四对象数据模型、3.1-3.3 拆分）。
- ✅ **Phase 3.1 已完成**（2026-07-07）：brain relay + 本地事件记录落地，
  `orchestrator/`（relay.js / event-log.js / health-check.js /
  relay-fixture-test.js / README.md）。fixture 22/22；真实端到端：双 agent
  仿真经 `SUPERNONO_BRIDGE_PORT=4175` 投递 7/7、逐字节透明、pet 行为与直连
  一致、JSONL 只含 envelope+forward。实现记录见设计文档 §10。
- ✅ **Phase 3.2 已完成**（2026-07-07）：work store + 手动 CLI 落地，
  `orchestrator/work-store.js` + `work.js`。四对象数据模型（ws/wi/ar/dr 短 id）、
  relay 每事件自动归组 AgentRun、未关联 run 提示、损坏文件拒绝覆盖。
  store fixture 30/30、relay+store 集成 20/20、3.1 relay 回归 22/22、
  真实目录 CLI 全链路走查通过。实现记录见设计文档 §11。
- 🔄 **Phase 3.3 当前目标**：从事件流生成用户摘要。`work summary` 读取
  workbench-state + 当日 JSONL，生成 Markdown（每个 item：状态/关联 run 事件
  统计/耗时/待决事项），可选以 `agent:"assistant"`、`adapter:"workbench"` 身份
  向 pet 发 `completed` + artifact 路径。验收（设计文档 §8）：真实半天工作产出
  一份**你愿意读**的摘要；摘要不含任何敏感正文；桌宠能提示"总结已生成"。
- ⛔ 仍明确不在本阶段：`Notification -> permission_required`（桌面版实测未触发该
  hook，待新证据）、`permission_resolved` 合成、`PostToolUse -> error`、`testPass`
  能量规则；云端 / 账号 / 数据库 / 自动授权 / 读取 prompt 与 transcript 正文。

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

---

## 13. Phase 2.5 / 2.6 收口记录（2026-07-06）

Phase 2.5 已完成：Claude Code adapter 增加安装、卸载、健康检查和 fixture 测试。

新增：

```text
adapters/claude-code/settings-utils.js
adapters/claude-code/install.js
adapters/claude-code/uninstall.js
adapters/claude-code/health-check.js
adapters/claude-code/install-fixture-test.js
```

常用命令：

```cmd
node adapters\claude-code\install.js --project C:\path\to\project
node adapters\claude-code\health-check.js --project C:\path\to\project
node adapters\claude-code\uninstall.js --project C:\path\to\project
node adapters\claude-code\install-fixture-test.js
```

Phase 2.6 已完成安全准入层：

```text
adapters/claude-code/semantic-gates.js
adapters/claude-code/semantic-gates-test.js
docs/claude-code/phase-2-6-semantic-gates.md
```

重要结论：`permission_required`、`permission_resolved`、`error`、`testPass` 仍不接入 live hooks，直到真实 probe 捕获到稳定结构化字段。当前完成的是可执行的准入规则，防止未来靠 stdout/stderr/prompt/source/diff/transcript 误判。

下一步建议：Phase 2.7 先跑真实安装/健康检查，再做 Notification 与失败态专项 probe；只有拿到结构化字段后，才逐个启用 2.6 语义映射。
---

## 14. Phase 2.7 真实环境运维验证（compact 后优先执行）

Phase 2.7 不是新增功能，而是把前面做好的 adapter 工具链放到真实环境里反复跑通。目标是确认以后换项目、换电脑、换会话时，Claude Code adapter 仍然能低成本接入 SuperNoNo。

### 14.1 验证目标

必须证明以下链路可重复：

1. 在一个全新测试项目中安装 Claude Code hooks。
2. `health-check.js` 能识别 Node、adapter 文件、settings hooks、重复 hooks、SuperNoNo bridge 状态。
3. 启动桌宠后，真实 Claude Code 会话运行 `echo supernono-phase-2-7` 能驱动 `claude-code-hooks` 事件。
4. 卸载 hooks 后，新 Claude Code 会话不再触发 adapter。
5. 在你的真实项目中重复 health-check，确认不会和已有 `.claude/settings.json` 冲突。

### 14.2 推荐测试目录

建议新建一个干净目录作为一次性验证项目：

```cmd
mkdir C:\Users\1\Desktop\project\supernono-adapter-smoke
cd C:\Users\1\Desktop\project\supernono-adapter-smoke
echo # SuperNoNo adapter smoke > README.md
```

### 14.3 安装与健康检查

在 `multiagent-work-assistant` 仓库执行：

```cmd
cd C:\Users\1\Desktop\project\multiagent-work-assistant
node adapters\claude-code\install.js --project C:\Users\1\Desktop\project\supernono-adapter-smoke
node adapters\claude-code\health-check.js --project C:\Users\1\Desktop\project\supernono-adapter-smoke
```

预期：

- Node resolves = OK。
- adapter files = OK。
- adapter hooks installed = OK。
- duplicate adapter hooks = OK none。
- 如果桌宠没启动，SuperNoNo bridge 可以是 WARN，不算失败。

### 14.4 真实 hook 验收

先启动桌宠：

```cmd
cd C:\Users\1\Desktop\project\codex-task-pet
npm.cmd start
```

然后在 `supernono-adapter-smoke` 目录里开新的 Claude Code 会话，要求它实际调用 shell：

```text
请实际调用 shell 工具运行 echo supernono-phase-2-7
```

预期：

- 桌宠/面板出现 `agent: claude-code`。
- timeline 出现 `command_running -> step_done -> turn_ended`。
- `SuperNoNo.getAgents()` 能看到 `claude-code:<session_id>`。
- `SuperNoNo.getTimeline()` 最近事件归属为 `claude-code`。

### 14.5 卸载验证

```cmd
cd C:\Users\1\Desktop\project\multiagent-work-assistant
node adapters\claude-code\uninstall.js --project C:\Users\1\Desktop\project\supernono-adapter-smoke
node adapters\claude-code\health-check.js --project C:\Users\1\Desktop\project\supernono-adapter-smoke
```

预期：

- health-check 报 adapter hooks installed = FAIL 或缺失，这是卸载后的预期结果。
- 新开 Claude Code 会话再运行 echo，不应再发送 `claude-code-hooks` 事件。
- `.claude/settings.json.supernono-backup-*` 备份存在，可用于恢复。

### 14.6 真实项目验证

对你日常使用的项目只先跑 health-check，不要急着重装：

```cmd
cd C:\Users\1\Desktop\project\multiagent-work-assistant
node adapters\claude-code\health-check.js --project C:\path\to\your-real-project
```

如果 hooks 未安装，再执行：

```cmd
node adapters\claude-code\install.js --project C:\path\to\your-real-project
```

安装后必须新开 Claude Code 会话。

### 14.7 Phase 2.7 验收记录要写什么

完成后在本文档下方追加一段“Phase 2.7 实测记录”，至少包含：

- 测试项目路径。
- install 输出是否成功。
- health-check 输出摘要。
- 桌宠是否收到真实 `claude-code-hooks` 事件。
- uninstall 是否成功。
- 是否发现 Windows 路径、Node、settings merge、重复 hooks 问题。

### 14.8 Phase 2.8 / Phase 3 前置条件

只有 Phase 2.7 跑通后，再考虑：

1. Notification / permission 专项 probe。
2. 失败态 / testPass 专项 probe。
3. 基于真实结构化 payload 开启 2.6 语义映射。
4. Phase 3 orchestrator / task delegation。

在没有真实结构化 payload 之前，不要把 `permission_required`、`error`、`testPass` 接进 live hooks。

---

## 15. Phase 2.7 完成记录（2026-07-07）

用户在真实环境确认以下链路全部跑通：

1. 在全新测试项目安装 Claude Code hooks（`install.js`）。
2. `health-check.js` 正确识别 Node / adapter 文件 / settings hooks / 重复 hooks / bridge 状态。
3. 桌宠运行下，真实 Claude Code 会话驱动 `claude-code-hooks` 事件进入面板。
4. `uninstall.js` 卸载后新会话不再触发 adapter。
5. settings 备份可恢复，与已有 `.claude/settings.json` 无冲突。

结论：adapter 工具链达到"换项目、换电脑、换会话可低成本重复接入"的标准，
**Phase 2 全部收口**。Notification / 失败态专项 probe 转入 backlog（§8），
不阻塞 Phase 3。

---

## 16. Phase 3 入口（当前主线）

设计文档：[`docs/planning/phase-3-orchestrator-plan.md`](phase-3-orchestrator-plan.md)（Phase 3.0 交付物，先读它）。

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 3.0 | orchestrator 设计文档：产品目标 / 非目标 / agent 角色 / relay 架构 / 数据模型（WorkSession, WorkItem, AgentRun, DecisionRequest）/ 3.1-3.3 拆分 / 风险清单 | ✅ 本轮完成 |
| Phase 3.1 | 本地 WorkSession store + event relay（4175→4174 透明转发 + JSONL 落盘 + `work status` 只读 CLI） | 下一步 |
| Phase 3.2 | 手动创建 WorkItem + 分配 agent（`work new/add/assign/link/decide/done`；AgentRun 从事件流自动建立） | 待做 |
| Phase 3.3 | 从事件流生成用户摘要（`work summary` → Markdown；assistant 身份向 pet 汇报 completed） | 待做 |

Phase 3 全程约束（设计文档 §2 的铁律摘要）：不做云端/账号/数据库/自动授权；
不读 prompt / transcript / 源码正文 / diff / tool output；不 spawn 或控制 agent；
pet 仓库预期零提交；协议零变更（`payload.project` 增量候选留到 3.2 用出真实
痛感再议）。

## 17. Phase 3 MVP closeout (2026-07-07)

Phase 3.3 / 3.4 / 3.5 have been implemented as a local, manual-first MVP:

- `work summary` generates a metadata-only Markdown report from the work store and daily relay JSONL.
- `work summary --notify` reports completion as `agent:"assistant"`, `adapter:"workbench"` so the pet can announce that a summary was generated.
- `workflow review-loop` creates the first fixed multiagent workflow: Codex build item -> Claude Code review item -> explicit user decision gate.
- No automatic task decomposition, no agent spawn, no automatic authorization, no database, no cloud, and no prompt/transcript/source/diff/tool-output reading.

Recommended next action after compact: use the loop on a real feature for several hours, then have CC/Fable review the result. The review question should be: "Does this summary and workflow reduce coordination load enough to justify the next layer of automation?" If the answer is no, improve or cut the summary before adding scheduling.

## 18. 当前进度补记：Phase 3 本地 MVP 已闭环（2026-07-07）

当前状态：SuperNoNo 已经从“多 agent 事件展示”推进到“本地个人工作助理 MVP”。

已完成的链路：

```text
Codex / Claude Code hooks
  -> brain relay :4175
  -> event JSONL + work store
  -> pet bridge :4174
  -> SuperNoNo panel / pet UI
```

已完成能力：

- Phase 3.1：`orchestrator/relay.js` 本地透明中继，默认 `4175 -> 4174`，字节级转发，先应答后异步转发，pet 不在线也不伤害 agent hook。
- Phase 3.2：`workbench-state.json` 本地 work store，支持 `WorkSession / WorkItem / AgentRun / DecisionRequest` 四对象，relay 可按 `agent:sessionId` 自动归组 AgentRun。
- Phase 3.3：`work summary` 可从 work store + 当日 JSONL 生成 metadata-only Markdown 总结，并可用 `--notify` 以 `assistant/workbench` 身份通知桌宠。
- Phase 3.4：`work.js` 手动 CLI 已能创建 session、item、assign、link、decision、done、status。
- Phase 3.5：`workflow review-loop` 已固化第一条协作流程：Codex 实现 -> Claude Code review -> 用户决策。

仍然明确没有做：

- 不自动 spawn / 控制 Codex 或 Claude Code。
- 不自动授权。
- 不自动拆任务。
- 不读取 prompt、transcript、源码正文、diff、tool output、token、secret。
- 不接入数据库、云端、账号系统。

当前建议：下一步不要继续堆功能，先拿一个真实半天任务跑完整闭环：

```text
workflow review-loop
-> Codex 实现
-> Claude Code review
-> link AgentRun
-> done / decision resolve
-> work summary --notify
```

然后让 CC / Fable 做 review，判断 summary 是否真的有用。如果 summary 没有减少你的协调负担，就先改 summary，而不是急着做自动调度。

下一阶段候选：

1. Phase 3.6：真实使用验收与 UX 调整，只改 CLI 文案、summary 结构和文档。
2. Phase 3.7：把 `work summary` 输出变成更像日报/交接文档的格式。
3. Phase 3.8：给 `workflow review-loop` 增加模板化 prompt，不自动执行，只生成给 Codex / Claude Code 的任务指令。
4. Phase 4.0：在真实使用稳定后，再考虑 Python orchestrator 或服务化重构。

## 19. Phase 3.6-3.8 implementation record (2026-07-07)

Implemented after the local MVP closeout:

- Phase 3.6 real-use acceptance plan: `docs/acceptance/phase-3-6-real-use.md`.
- Phase 3.7 summary v2: `work summary` now renders a handoff-style report with Snapshot, Next Actions, Completed, In Progress, Waiting For User, Todo, Agent Activity, Unassigned Agent Runs, Open Decisions, Files, and Safety Note.
- Phase 3.8 prompt generator: `work prompt codex wi1`, `work prompt claude wi2`, and `work prompt review-loop` write copyable prompts to `.supernono/prompts/` and print them to stdout.

The orchestrator still does not spawn agents, auto-authorize tools, auto-decompose tasks, read prompt/transcript/source/diff/tool-output, or use a database/cloud account. The next meaningful step is a real-use pass with one actual feature and then a CC/Fable review of the generated summary and prompts.

## 20. Phase 3.9 收口记录（2026-07-07）

已执行本地收口：

- `node orchestrator\work.js status` 可读取当前 active session。
- `node orchestrator\work.js summary --notify` 成功生成 summary，并通过 `assistant/workbench` 信号通知到 brain relay `4175`。
- 当前 active session 是 `ws2`：`wi3`（Codex build）与 `wi4`（Claude review）仍处于 `todo`，`dr2` 决策仍 open。

结论：Phase 3.6-3.8 的本地机制与 summary 通知可用，但这轮尚未形成“真实 agent run 已 link 并完成”的完整产品验收记录。下一步应让 Codex 和 Claude Code 真实执行生成的 prompts，然后用 `work status` 找到 unassigned AgentRuns，并执行：

```cmd
node orchestrator\work.js item link wi3 codex:<sessionId>
node orchestrator\work.js item link wi4 claude-code:<sessionId>
node orchestrator\work.js decision resolve dr2 accept
node orchestrator\work.js item done wi3
node orchestrator\work.js item done wi4
node orchestrator\work.js summary --notify
```

完成后再让 CC/Fable review summary v2 与 prompt generator 的产品价值。

## 21. Phase 4 规划：从手动工作流走向半自动 Brain（待启动）

Phase 3 的结论是：本地 orchestrator MVP 已经具备“记录、归组、生成 prompt、生成 summary、通知桌宠”的能力，但它仍然是手动优先的工作助理。Phase 4 的目标不是立刻变成全自动 agent controller，而是增加一层**可审阅、可拒绝、可回退的半自动 brain**。

### Phase 4 北极星

让 SuperNoNo 从“帮我记录多 agent 工作状态”升级为：

```text
我给一个工作目标
-> brain 生成任务拆分与 agent 分工建议
-> 用户确认
-> brain 生成给 Codex / Claude Code 的 prompts
-> 用户手动或半自动投递
-> brain 跟踪执行、生成总结、提醒决策
```

Phase 4 的关键词是 **suggest first, execute later**。在没有真实使用数据证明可靠之前，brain 只给建议和草稿，不自动启动 agent、不自动授权、不自动修改仓库。

---

### Phase 4.0：真实使用复盘与产品判断

目标：先评估 Phase 3 手动 MVP 是否值得继续自动化。

输入：

- `docs/acceptance/phase-3-6-real-use.md`
- `.supernono/summaries/*.md` 中用户愿意提供的 summary
- 用户对 prompt generator / summary v2 / review-loop 的体感反馈
- CC / Fable 的 review 结果

交付：

- `docs/planning/phase-4-brain-plan.md`
- 明确回答：
  - 哪些手动步骤最烦，值得自动化？
  - 哪些 summary 内容有用？哪些是噪音？
  - prompt generator 是否真的减少提示词成本？
  - Phase 4 是否应该引入 Python brain？如果引入，边界是什么？

验收标准：

- 不写代码也可以完成。
- 产出一个明确的 Phase 4 实施范围。
- 明确砍掉不值得做的功能。

---

### Phase 4.1：Planner Draft（任务拆分草稿，不执行）

目标：新增一个 planner draft 能力，把用户输入的目标转换成可审阅的 WorkItems 草稿。

建议命令：

```cmd
node orchestrator\work.js plan draft "实现某个功能" --mode review-loop
```

输出：

- 建议的 WorkSession title / goal
- 建议的 WorkItems
- 每个 WorkItem 的 role / assignedAgent
- 建议的 decision gates
- 风险/假设列表

关键边界：

- 只生成草稿，不写入 `workbench-state.json`，除非用户显式 `plan accept`。
- 不调用 LLM API；第一版可以是规则模板。
- 不读取源码正文、prompt、transcript、tool output。

可能的数据文件：

```text
.supernono/plans/plan-YYYYMMDD-HHMMSS.json
.supernono/plans/plan-YYYYMMDD-HHMMSS.md
```

验收标准：

- 给定一个目标，能生成一份用户愿意修改/接受的计划草稿。
- 草稿可以被 `plan accept` 转成现有 WorkSession / WorkItem / DecisionRequest。

---

### Phase 4.2：Plan Accept（从草稿创建 WorkSession）

目标：用户确认计划后，把草稿写入 work store。

建议命令：

```cmd
node orchestrator\work.js plan accept .supernono\plans\plan-xxx.json
```

行为：

- 创建 WorkSession。
- 创建 WorkItems。
- 分配 suggested agent。
- 创建 DecisionRequests。
- 输出下一步 prompt 命令。

边界：

- 用户必须显式 accept。
- 不自动启动 Codex / Claude Code。
- 不自动 link run。

验收标准：

- `plan draft -> plan accept -> work status -> prompt review-loop` 链路可用。
- 生成的 state 和手动 `workflow review-loop` 创建的 state 兼容。

---

### Phase 4.3：Prompt Pack（多 agent 指令包）

目标：从 WorkSession 一次性生成完整 agent prompt 包，而不是逐 item 生成。

建议命令：

```cmd
node orchestrator\work.js prompt pack ws3
```

输出：

```text
.supernono/prompts/ws3/codex-wi1.md
.supernono/prompts/ws3/claude-wi2.md
.supernono/prompts/ws3/user-checklist.md
```

内容：

- 给 Codex 的实现 prompt。
- 给 Claude Code 的 review prompt。
- 给用户的执行 checklist。
- link / decision / summary 的后续命令。

验收标准：

- 用户可以直接复制 prompt 包完成一轮工作。
- prompt 不包含敏感正文。
- checklist 不要求用户记命令。

---

### Phase 4.4：Assistant Decision Brief（决策摘要）

目标：当有 open DecisionRequest 时，生成一份更像“请你拍板”的摘要，而不是普通 summary。

建议命令：

```cmd
node orchestrator\work.js decision brief dr2 --notify
```

输出内容：

- 需要用户决定什么。
- 相关 WorkItem / AgentRun。
- 当前已知状态。
- 可选决策：accept / reject / note。
- 推荐下一步命令。

边界：

- 不替用户决定。
- 不自动 resolve。
- 只基于 metadata 和用户手动输入，不读 agent 正文输出。

验收标准：

- 用户看到 brief 后能更快决定 `accept/reject/note`。
- 桌宠通知是有意义的“需要你拍板”，不是泛泛的完成提醒。

---

### Phase 4.5：Python Brain 可行性 Spike

目标：验证是否需要引入 Python，而不是盲目重写。

建议结论方向：

```text
Node.js 继续负责：hooks / relay / local CLI / Electron pet 接线
Python 只负责：planner / evaluator / memory / RAG / heavier orchestration
```

Spike 内容：

- 新增 `brain-python/` 或 `planner-python/` 实验目录。
- 定义 Node <-> Python 的最小接口，例如 stdin/stdout JSON。
- Python 输入：WorkSession metadata + user goal。
- Python 输出：plan draft JSON。
- 不接真实 LLM API，先用 deterministic planner 验证接口。

验收标准：

- Node CLI 能调用 Python planner 并拿到 plan draft。
- Python 失败时 Node 不崩溃。
- 不引入 Python 到 hook 热路径，避免拖慢 agent hooks。

是否进入 Python 的判断标准：

- 如果只是模板化 prompts，继续 Node。
- 如果开始做复杂规划、记忆、RAG、评估器，再引入 Python。
- 不做全仓库 Python 重写。

---

### Phase 4.6：真实半自动工作流验收

目标：用 Phase 4.1-4.4 跑一个真实任务。

流程：

```text
plan draft
-> 用户编辑/确认
-> plan accept
-> prompt pack
-> Codex / Claude Code 手动执行
-> link runs
-> decision brief
-> summary --notify
```

验收问题：

- planner draft 是否比手写 WorkItems 更省时间？
- prompt pack 是否比单条 prompt 更好用？
- decision brief 是否真正减少上下文切换？
- 哪一步仍然应该保持手动？

只有 Phase 4.6 通过后，才考虑 Phase 5 的更强自动化。

---

### Phase 5 候选（暂不启动）

Phase 5 才考虑更激进的能力：

- 自动选择 agent。
- 自动推进下一个 WorkItem。
- 与 GitHub issue / PR 绑定。
- Python planner 接真实 LLM。
- RAG / long-term memory。
- 多工作流模板市场。

暂时不要做：

- 自动授权。
- 自动执行危险命令。
- 自动读取 transcript / prompt / source / diff / tool output 正文。
- 云同步 / 账号系统。
- 大数据库迁移。

### Phase 4 推荐执行顺序

```text
4.0 真实使用复盘
4.1 plan draft
4.2 plan accept
4.3 prompt pack
4.4 decision brief
4.5 Python brain spike
4.6 真实半自动验收
```

一句话：Phase 4 的目标是把 brain 从“记录员”升级成“会给计划草稿和决策摘要的助理”，但仍然让用户握着方向盘。

## 22. Phase 4 implementation record (2026-07-08)

Phase 4 is implemented as a conservative semi-automatic brain. It suggests and packages work, but still does not spawn agents, call an LLM API, auto-authorize tools, or ingest prompt/transcript/source/diff/tool-output bodies.

Delivered files:

| File | Purpose |
| --- | --- |
| `orchestrator/phase4.js` | Plan draft, plan accept, prompt pack, decision brief, and assistant decision notification. |
| `orchestrator/phase4-fixture-test.js` | Fixture coverage for draft/accept/pack/brief and leak exclusion. |
| `docs/planning/phase-4-brain-plan.md` | Phase 4 design, usage, and Python spike conclusion. |
| `docs/acceptance/phase-4-semi-automatic-brain.md` | Real-use acceptance checklist and review prompt. |
| `orchestrator/README.md` | Phase 4 usage section. |

New CLI:

```cmd
node orchestrator\work.js plan draft "实现功能 X" --goal "Codex builds, Claude reviews, user decides"
node orchestrator\work.js plan accept .supernono\plans\plan-xxx.json
node orchestrator\work.js prompt pack ws1
node orchestrator\work.js decision brief dr1 --notify
```

Validation completed:

- `node --check orchestrator\phase4.js`
- `node --check orchestrator\phase4-fixture-test.js`
- `node --check orchestrator\work.js`
- `node orchestrator\phase4-fixture-test.js` -> ALL PASS
- temporary CLI smoke: plan draft -> accept -> prompt pack -> decision brief -> status

Python decision: do not rewrite now. Keep Node.js for hooks / relay / CLI / Electron-facing local tooling. Revisit Python only for planner/evaluator/memory/RAG components, via JSON boundaries, after the deterministic planner proves insufficient.

Next after Phase 4: run the acceptance checklist on one real feature, then ask CC/Fable to review whether plan draft and prompt pack actually save effort. If yes, Phase 5 should reduce link/status friction before adding any automatic scheduling.
