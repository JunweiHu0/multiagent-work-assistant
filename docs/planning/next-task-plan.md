# Multiagent Work Assistant 下一阶段任务规划

- 日期：2026-07-06
- 主仓库：`multiagent-work-assistant`
- 关联显示层仓库：`codex-task-pet`
- 当前阶段：Phase 2.1 真实 Claude Code hooks probe 主体完成，准备进入 Phase 2.2.0 Claude Code adapter MVP
- 本文目的：在上下文 compact 或换电脑后，继续按本文推进，不依赖聊天历史。

---

## 0. Compact 后先看这里

当前最新可靠进展：

- `multiagent-work-assistant` 的 `main` 已提交到：`ec6680a Complete Claude Code hooks probe analysis`。
- Phase 2.1 已完成主体：真实 Claude Code 桌面版 hook probe 已覆盖 `SessionStart` / `PreToolUse` / `PostToolUse` / `Stop`。
- 真实记录覆盖了 `Bash` / `Read` / `Write`，共 13 条真实 hook 记录。
- `Notification` 没有观测到；失败态也没有可靠 `exit_code` / `is_error` 字段。
- 因此下一步不要做完整权限/错误链路，先做 **Phase 2.2.0：Claude Code adapter MVP**。
- MVP 范围只做：`Bash -> command_running`、`Read -> file_reading`、`Write/Edit -> file_editing`、`PostToolUse -> step_done`、`Stop -> turn_ended`。
- 暂缓：`Notification -> permission_required`、通用 `error`、`permission_resolved` 合成。

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

## 5. 下一阶段总目标

下一阶段是 **Phase 2.2.0：Claude Code adapter MVP**。

目标不是一次做完完整 Claude Code adapter，而是先完成一个可真实驱动 SuperNoNo 的安全最小版：

- `PreToolUse:Bash` -> `command_running`
- `PreToolUse:Read` -> `file_reading`
- `PreToolUse:Write/Edit/MultiEdit` -> `file_editing`
- `PostToolUse` -> `step_done`
- `Stop` -> `turn_ended`

暂缓：

- `Notification` -> `permission_required`
- `permission_resolved` 合成
- `PostToolUse` -> `error`

---

## 6. Phase 2.2.0 任务拆分

### T2.2.0 确认 adapter MVP 边界

先阅读：

```text
docs/claude-code/claude-code-hooks-probe-plan.md
docs/claude-code/claude-code-adapter-mapping.md
docs/architecture/signal-protocol-v0.2-plan.md
```

确认本轮只实现已被 probe 支撑的映射：Bash / Read / Write-Edit / PostToolUse step_done / Stop turn_ended。

验收：

- 文档或 README 明确说明 `permission_required` 和 `error` 暂缓。

---

### T2.2.1 实现 Claude Code adapter 文件结构

建议目录：

```text
adapters/claude-code/
  README.md
  hooks-settings.example.json
  send-signal.js
  lib.js
  pre-tool-use.js
  post-tool-use.js
  stop.js
  manual-fixture-test.js
```

暂不需要 `notification.js`，除非它只作为 no-op 说明文件。

要求：

- `send-signal.js` vendored 自 `codex-task-pet/adapters/shared/send-signal.js`，不要跨仓库 require。
- `lib.js` 做：
  - 读 stdin JSON。
  - 提取 `session_id`，fallback 到 `CLAUDE_CODE_SESSION_ID`。
  - 命令脱敏和截断。
  - 文件路径只取 basename。
  - tool 分类。
  - 发送统一 envelope。
- 所有 hook 入口：
  - 零 stdout。
  - 永远 exit 0。
  - SuperNoNo 未运行时静默失败。
  - 不读取 transcript。
  - 不发送 prompt/source/diff/content/output/token/secret。

---

### T2.2.2 实现事件映射

| Claude Code hook | 条件 | SuperNoNo signal |
| --- | --- | --- |
| `PreToolUse` | `tool_name === Bash` | `command_running` |
| `PreToolUse` | `tool_name in Read/Grep/Glob/WebFetch/WebSearch` | `file_reading` |
| `PreToolUse` | `tool_name in Write/Edit/MultiEdit/NotebookEdit` | `file_editing` |
| `PreToolUse` | 其他工具 | `command_running` with generic action |
| `PostToolUse` | any observed tool | `step_done` |
| `Stop` | turn ended | `turn_ended` |

`PostToolUse` 不要读 stdout/stderr/content，只看必要小字段。第一版即使工具失败，也先不发 `error`。

---

### T2.2.3 提供安装片段和验证说明

新增：

```text
adapters/claude-code/hooks-settings.example.json
adapters/claude-code/README.md
```

README 必须写清楚：

- 如何把 hooks 片段放进项目级 `.claude/settings.json`。
- 改 settings 后必须开新 Claude Code 会话。
- 如何启动 SuperNoNo：`npm.cmd start`。
- 如何触发验证：
  - `echo supernono-claude-adapter-test`
  - 读取 README
  - 写 scratch 文件
  - 正常结束一轮
- SuperNoNo 未启动时应无报错。
- `Notification / permission_required / error` 是后续任务。

---

### T2.2.4 验证

必须跑：

```powershell
node --check adapters/claude-code/send-signal.js
node --check adapters/claude-code/lib.js
node --check adapters/claude-code/pre-tool-use.js
node --check adapters/claude-code/post-tool-use.js
node --check adapters/claude-code/stop.js
node adapters/claude-code/manual-fixture-test.js
```

如果同时验证真实桌宠：

```powershell
cd C:\Users\1\Desktop\project\codex-task-pet
npm.cmd start
```

然后在 Claude Code 里触发 Bash / Read / Write / Stop。

验收：

- Bash 触发 `command_running`。
- Read 触发 `file_reading`。
- Write/Edit 触发 `file_editing`。
- PostToolUse 触发 `step_done`。
- Stop 触发 `turn_ended`。
- SuperNoNo 面板出现 `agent: claude-code` 的卡片。
- payload 中不出现 prompt/source/diff/content/output/token/secret 明文。

---

## 7. 后续补测任务

这些不阻塞 Phase 2.2.0，但要留在 backlog：

### T2.3 Notification / permission 补测

目标：构造一个确定会触发 Claude Code `Notification` hook 的场景，确认是否能稳定区分：

- 权限等待
- 空闲等待
- 普通提示

只有确认后再做：

- `Notification` -> `permission_required`
- `permission_resolved` 合成

### T2.4 失败态补测

目标：构造一个会产生 `PostToolUse` 且带明确失败字段的工具调用。

只有观察到可靠小字段后再做：

- `PostToolUse` -> `error`

不要从 stdout/stderr 正文推断失败。

---

## 8. 本地开发流程

### 8.1 拉取两个仓库

```powershell
git clone https://github.com/JunweiHu0/codex-task-pet.git
git clone https://github.com/JunweiHu0/multiagent-work-assistant.git
```

如果已经 clone：

```powershell
cd C:\path\to\codex-task-pet
git fetch origin
git switch v2/multiagent-work-assistant
git pull

cd C:\path\to\multiagent-work-assistant
git pull
```

### 8.2 启动桌宠显示层

```powershell
cd C:\path\to\codex-task-pet
npm.cmd install
npm.cmd start
```

### 8.3 验证 pet-side multiagent core

另开终端：

```powershell
cd C:\path\to\codex-task-pet
node adapters/shared/manual-multiagent-test.js
```

---

## 9. 文档与 Git 约定

### 9.1 `codex-task-pet`

- `main`：桌宠 v1.0 稳定线。
- `v2/multiagent-work-assistant`：pet-side multiagent 展示实验。
- 不在这里继续承载 multiagent 核心逻辑。

### 9.2 `multiagent-work-assistant`

- `main`：multiagent 主线。
- 本仓库先以文档 + probe + adapter 脚本为主。
- adapter 能稳定后，再考虑 orchestrator / event log / dashboard。

### 9.3 提交粒度

推荐提交顺序：

```text
1. Add Claude Code adapter MVP
2. Document Claude Code adapter install flow
3. Verify Claude Code adapter with SuperNoNo
4. Add Notification permission probe result
5. Add Claude Code permission mapping
```

---

## 10. 给后续 CC / Codex 的启动提示词

可以直接复制给后续 coding agent：

```text
请继续 SuperNoNo multiagent 工作助理项目。

当前有两个仓库：

1. codex-task-pet
- 负责桌宠显示层和 /signal 本地桥。
- pet-side multiagent core 在 v2/multiagent-work-assistant 分支。

2. multiagent-work-assistant
- 负责 multiagent 核心、Claude Code adapter、协议和后续工作助理逻辑。

请先阅读：
- docs/planning/next-task-plan.md
- docs/claude-code/claude-code-hooks-probe-plan.md
- docs/claude-code/claude-code-adapter-mapping.md

当前状态：Phase 2.1 真实 Claude Code hooks probe 主体完成。Bash / Read / Write / Stop 已有真实 payload 依据；Notification 和失败态仍未确认。

现在开始 Phase 2.2.0：Claude Code adapter MVP。

本轮只实现：
- PreToolUse:Bash -> command_running
- PreToolUse:Read/Grep/Glob/WebFetch/WebSearch -> file_reading
- PreToolUse:Write/Edit/MultiEdit/NotebookEdit -> file_editing
- PostToolUse -> step_done
- Stop -> turn_ended

暂时不要实现：
- Notification -> permission_required
- permission_resolved 合成
- PostToolUse -> error

限制：
- 不改 codex-task-pet UI。
- 不改 Live2D。
- 不改 stateEngine。
- 不改 Codex plugin hooks。
- 不读取/保存/发送 prompt、源码正文、diff、transcript、tool output、token、secret。
- 所有 hook 脚本零 stdout、永远 exit 0、SuperNoNo 未运行时静默失败。

完成后汇报：
- 新增/修改文件
- adapter 如何安装到 Claude Code settings
- manual fixture test 如何跑
- 真实 Claude Code 如何触发验证
- 哪些事件已能驱动 SuperNoNo
- 哪些仍留给 Notification/失败态补测
```

---

## 11. 成功标准

Phase 2.2.0 成功标志：

- 真实 Claude Code Bash 调用能让 SuperNoNo 显示 `command_running`。
- 文件读取能显示 `file_reading`。
- 文件写入/编辑能显示 `file_editing`。
- 工具结束能显示 `step_done`。
- 回合结束能发送 `turn_ended`。
- `agent: claude-code` 和 `sessionId` 正确进入 pet-side agentStore。
- SuperNoNo 未运行时 Claude Code 无报错、无明显延迟。
- 不泄漏 prompt/source/diff/content/output/secret。

完成这些，再考虑 Notification 权限链路和失败态。