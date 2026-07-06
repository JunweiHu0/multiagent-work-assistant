# Multiagent Work Assistant 下一阶段任务规划

- 日期：2026-07-06
- 主仓库：`multiagent-work-assistant`
- 关联显示层仓库：`codex-task-pet`
- 当前阶段：Phase 2.1 前置规划
- 本文目的：在上下文 compact 或换电脑后，继续按本文推进，不依赖聊天历史。

---

## 1. 当前结论

SuperNoNo 已经拆成两个方向：

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

- 新仓库已创建，用于承载 multiagent 主线。
- 已有文档目录：
  - `docs/architecture/`
  - `docs/handoff/`
  - `docs/prd/`
  - `docs/strategy/`
  - `docs/roadmap.md`
- 下一步应在此仓库中推进 Claude Code hooks probe。

---

## 3. 现在不要做什么

为了避免重新陷入桌宠打磨，本阶段明确不做：

- 不继续优化桌宠 UI、Live2D、hover、窗口尺寸。
- 不重写 `codex-task-pet` 的 `stateEngine.js`。
- 不改 Codex plugin hooks 的已验证映射。
- 不做完整 Claude Code adapter。
- 不做 orchestrator、大型 dashboard、数据库、云同步。
- 不把 prompt、源码正文、diff、transcript、token、secret 写入日志。

---

## 4. 下一阶段总目标

下一阶段目标是完成 **Phase 2.1：Claude Code hooks probe**。

这一步的目标不是写正式 adapter，而是确认 Claude Code 在 Windows 上的真实 hook 行为：

- hook 是否能触发。
- hook 的 `stdin` payload 实际字段有哪些。
- 是否有稳定的 `session_id`。
- `tool_name` 如何表示 Bash / Read / Edit / Write 等工具。
- `Notification` 是否能表示权限请求或等待用户输入。
- `Stop` 是否能表示一个 agent turn 结束。
- hook 执行环境里 `node` 是否可用。
- hook 失败是否影响 Claude Code 主流程。

完成 probe 后，才进入 **Phase 2.2：Claude Code adapter MVP**。

---

## 5. Phase 2.1 任务拆分

### T2.1.1 整理 Claude Code hooks probe 计划

建议新增：

```text
docs/claude-code/claude-code-hooks-probe-plan.md
docs/claude-code/claude-code-adapter-mapping.md
```

内容要求：

- 列出需要验证的 hook 类型：
  - `PreToolUse`
  - `PostToolUse`
  - `Notification`
  - `Stop`
  - 可选：`SessionStart`
- 每类 hook 需要验证：
  - 是否触发
  - `stdin` 字段结构
  - `session_id` 是否存在
  - `tool_name` 取值
  - 是否包含敏感正文
  - 是否能安全映射到 SuperNoNo signal
- 明确不碰：
  - transcript
  - prompt 正文
  - source body
  - diff body
  - token / secret

验收：

- 文档能指导另一个 agent 在 Windows 上完成 probe。
- 文档没有要求读取或保存敏感内容。

---

### T2.1.2 实现最小 probe 脚本

建议目录：

```text
probes/claude-code/
  README.md
  hook-probe.js
  hook-settings.example.json
  runtime/              # gitignore，存本地观察结果
```

`hook-probe.js` 只允许记录：

- `observedAt`
- hook 类型
- `cwd`
- `process.execPath`
- `PATH` 是否包含 node 相关路径
- `node -v` 是否可执行
- stdin JSON 是否可解析
- stdin 顶层字段名
- 字段类型摘要，例如：
  - `session_id: string(len=...)`
  - `tool_name: string(len=...)`
  - `tool_input: object(keys=[...])`
- 敏感 key 只记录 `[redacted-key]`

禁止记录：

- prompt 内容
- tool input 的完整正文
- source code
- diff
- command full output
- transcript
- token / secret / api key

验收：

- `node --check probes/claude-code/hook-probe.js` 通过。
- SuperNoNo 未运行时，probe 不报错、不阻塞 Claude Code。
- 观察结果只包含结构，不包含正文。

---

### T2.1.3 人工触发 Claude Code hooks

需要用户在 Claude Code 中触发若干动作：

1. 触发 `PreToolUse` / `PostToolUse`：
   - 让 Claude Code 实际运行一个 shell 命令，例如 `echo supernono-claude-probe`。

2. 触发文件读取类工具：
   - 让 Claude Code 读取当前仓库某个 README。

3. 触发文件编辑类工具：
   - 让 Claude Code 修改一个临时 probe 文件。

4. 尝试触发 `Notification`：
   - 让 Claude Code 执行一个需要用户批准的动作。
   - 如果无法稳定触发，记录为未确认。

5. 触发 `Stop`：
   - 完成一次普通会话 turn。

验收：

- 每类 hook 至少有一条脱敏结构记录，或明确标记为未触发。
- 能回答：Claude Code adapter 能否按 SuperNoNo protocol 映射。

---

### T2.1.4 输出 probe 结论文档

建议新增：

```text
docs/claude-code/claude-code-hooks-probe-result.md
```

内容必须包含：

- 测试环境：Windows 版本、Node 版本、Claude Code 版本。
- 每类 hook 是否触发。
- 每类 payload 的脱敏字段结构。
- `session_id` 是否稳定可用。
- `tool_name` 取值表。
- Node 执行环境结论。
- 失败是否影响 Claude Code。
- 是否可以进入 Phase 2.2 adapter MVP。

---

## 6. Phase 2.2 Adapter MVP 预案

只有 T2.1 probe 完成后再做。

建议目录：

```text
adapters/claude-code/
  README.md
  hooks-settings.example.json
  lib.js
  pre-tool-use.js
  post-tool-use.js
  notification.js
  stop.js
```

初版映射：

| Claude Code hook | 条件 | SuperNoNo signal |
|---|---|---|
| `PreToolUse` | Bash / shell | `command_running` |
| `PreToolUse` | Read / Grep / Glob / WebFetch | `file_reading` |
| `PreToolUse` | Edit / Write / NotebookEdit | `file_editing` |
| `PostToolUse` | success | `step_done` |
| `PostToolUse` | failure | `error` |
| `Notification` | permission / waiting input | `permission_required` |
| `Stop` | turn ended | `turn_ended` |
| `SessionStart` | optional | `task_start` |

统一 envelope：

```json
{
  "type": "command_running",
  "agent": "claude-code",
  "adapter": "claude-code-hooks",
  "sessionId": "<session_id>",
  "taskId": "<tool_use_id or null>",
  "payload": {
    "command": "<short redacted summary>",
    "isTest": false,
    "action": "正在运行命令"
  }
}
```

MVP 验收：

- 真实 Claude Code shell 调用能让 SuperNoNo 显示 `command_running`。
- 工具结束能产生 `step_done`。
- 权限请求能产生 `permission_required`，如 Claude Code hook 支持。
- SuperNoNo 未运行时 Claude Code 无感知失败。
- 不读取、不保存 prompt / transcript / source / diff / secret。

---

## 7. 本地开发流程

### 7.1 拉取两个仓库

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

### 7.2 启动桌宠显示层

```powershell
cd C:\path\to\codex-task-pet
npm.cmd install
npm.cmd start
```

### 7.3 验证 pet-side multiagent core

另开终端：

```powershell
cd C:\path\to\codex-task-pet
node adapters/shared/manual-multiagent-test.js
```

预期：

- 桌宠根据 focused agent 切状态。
- 面板能看到多个 agent card / timeline。
- `permission_required` 能抢占普通工作状态。

---

## 8. 文档与 Git 约定

### 8.1 `codex-task-pet`

- `main`：桌宠 v1.0 稳定线。
- `v2/multiagent-work-assistant`：pet-side multiagent 展示实验。
- 不在这里继续承载 multiagent 核心逻辑。

### 8.2 `multiagent-work-assistant`

- `main`：multiagent 主线。
- 本仓库先以文档 + probe + adapter 脚本为主。
- adapter 能稳定后，再考虑 orchestrator / event log / dashboard。

### 8.3 提交粒度

推荐提交顺序：

```text
1. Add Claude Code hooks probe plan
2. Add Claude Code hook probe script
3. Record Claude Code hook probe results
4. Add Claude Code adapter MVP
```

---

## 9. 给后续 CC / Codex 的启动提示词

可以直接复制给后续 coding agent：

```text
请继续 SuperNoNo multiagent 工作助理项目。

当前有两个仓库：

1. codex-task-pet
- 负责桌宠显示层和 /signal 本地桥。
- pet-side multiagent core 在 v2/multiagent-work-assistant 分支。

2. multiagent-work-assistant
- 负责 multiagent 核心、Claude Code adapter、协议和后续工作助理逻辑。

请先阅读 multiagent-work-assistant/docs/planning/next-task-plan.md。
然后开始 Phase 2.1：Claude Code hooks probe。

本轮只做 probe，不做正式 adapter。
请新增/完善：
- docs/claude-code/claude-code-hooks-probe-plan.md
- docs/claude-code/claude-code-adapter-mapping.md
- probes/claude-code/hook-probe.js
- probes/claude-code/hook-settings.example.json

限制：
- 不改 codex-task-pet UI。
- 不改 Live2D。
- 不改 stateEngine。
- 不改 Codex plugin hooks。
- 不读取/保存 prompt、源码正文、diff、transcript、token、secret。
- 只记录 hook payload 的字段名和类型结构。

完成后汇报：
- 新增/修改文件
- probe 如何安装到 Claude Code settings
- 需要用户手动触发哪些动作
- 已确认与未确认的 hook 行为
- 是否可以进入 Phase 2.2 Claude Code adapter MVP
```

---

## 10. 成功标准

Phase 2.1 成功的标志不是“adapter 写完”，而是：

- 我们知道 Claude Code hook 的真实字段结构。
- 我们知道 Windows 下 node 执行是否可靠。
- 我们知道哪些 hook 能稳定触发。
- 我们能判断 Claude Code adapter MVP 是否可做。
- 所有观察都没有泄露 prompt / source / diff / secret。

完成这些，再进入 Phase 2.2。
