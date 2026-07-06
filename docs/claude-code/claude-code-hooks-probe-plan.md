# Claude Code Hooks Probe 计划（Phase 2.1）

- 日期：2026-07-06
- 状态：真实 hook 已覆盖 SessionStart / PreToolUse / PostToolUse / Stop；**Notification 与失败态还需补测**
- 脚本：[`adapters/claude-code/probe/probe-hook.js`](../../adapters/claude-code/probe/probe-hook.js)
- 自测：[`adapters/claude-code/probe/fixture-test.js`](../../adapters/claude-code/probe/fixture-test.js)（24 项断言，含"假密钥/假源码/假 prompt 不落盘"泄漏自检）
- 产出去向：probe 结论回填本文档 §7，adapter 设计在
  [claude-code-adapter-mapping.md](claude-code-adapter-mapping.md)

## 1. 目标：回答哪些问题

Codex plugin hooks 的教训（见 codex-task-pet
`docs/2026-07-01-codex-plugin-hooks-handoff.md`）：hook 的**执行环境**比 payload
格式更容易踩坑——当时三个根因里两个是环境问题（node 不在 PATH、cwd 不是
plugin 目录）。所以 probe 同时验证环境和 payload 两类问题：

| # | 问题 | probe 记录字段 |
| --- | --- | --- |
| Q1 | hook 进程里裸 `node` 能否解析？（决定 settings 里写 `node` 还是绝对路径） | `nodeOnPath` / `execPath` / `envPath` |
| Q2 | hook 的 cwd 是什么？（项目目录？） | `cwd` |
| Q3 | hook 环境有哪些 `CLAUDE_*` 环境变量？（是否有 `CLAUDE_PROJECT_DIR`、`CLAUDE_CODE_SESSION_ID` 等旁路信息源） | `claudeEnvNames` |
| Q4 | 各事件 stdin payload 的字段名与类型？`session_id` 是否稳定存在？ | `payloadShape` / `hookEventName` / `toolName` |
| Q5 | `Notification` 能否区分"权限请求"和"空闲等待"？（决定 permission_required 的识别可靠性） | `notificationFlags`（长度 + 派生布尔，不存文本） |
| Q6 | `PostToolUse` 的 `tool_response` 是否有结构化的失败标志？（决定 error 事件怎么发） | `payloadShape.tool_response` |
| Q7 | 每次工具调用都 spawn 一个 node 进程的开销是否可接受？ | 主观观察会话流畅度 |

## 2. Probe 记录什么、绝不记录什么

**记录**：cwd、PATH、node 解析结果、`CLAUDE_*` 环境变量**名**、stdin 字节数、
字段名 + 值类型（`string(len=N)` / `array[N]` / 嵌套键，深度 ≤3）、
`hook_event_name` 与 `tool_name`（纯标识符）、Notification 的长度与派生布尔。

**绝不记录**：prompt 正文、源码正文、diff、命令参数值、文件路径值、
token/secret（敏感键名直接 `[redacted-key]`）、transcript 内容（`transcript_path`
只描述为 `string(len=N)`，永不读取）。

**行为保证**：永不 throw、永远 exit 0、stdout 零输出（PreToolUse 的 stdout 可以
携带权限决策——probe 必须是纯观察者）、逐行追加 JSONL（`probe-observed.jsonl`，
已在仓库 `.gitignore` 中）。

先跑自测确认这些保证：

```powershell
node adapters/claude-code/probe/fixture-test.js   # 应输出 ALL PASS
```

## 3. 临时接入方法

在**用来做实验的项目**（建议就用本仓库目录开一个 Claude Code 会话）新建
`.claude/settings.json`。用项目级配置而不是 `~/.claude/settings.json`：作用域
最小，删掉文件即完全回滚。

> 路径按机器调整：下面是公司电脑的绝对路径；家里电脑改成对应 clone 路径。
> JSON 内反斜杠要双写。

```json
{
  "hooks": {
    "PreToolUse": [
      { "hooks": [ { "type": "command", "command": "node \"C:\\Users\\1\\Desktop\\project\\multiagent-work-assistant\\adapters\\claude-code\\probe\\probe-hook.js\" PreToolUse", "timeout": 10 } ] }
    ],
    "PostToolUse": [
      { "hooks": [ { "type": "command", "command": "node \"C:\\Users\\1\\Desktop\\project\\multiagent-work-assistant\\adapters\\claude-code\\probe\\probe-hook.js\" PostToolUse", "timeout": 10 } ] }
    ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "node \"C:\\Users\\1\\Desktop\\project\\multiagent-work-assistant\\adapters\\claude-code\\probe\\probe-hook.js\" Notification", "timeout": 10 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"C:\\Users\\1\\Desktop\\project\\multiagent-work-assistant\\adapters\\claude-code\\probe\\probe-hook.js\" Stop", "timeout": 10 } ] }
    ],
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node \"C:\\Users\\1\\Desktop\\project\\multiagent-work-assistant\\adapters\\claude-code\\probe\\probe-hook.js\" SessionStart", "timeout": 10 } ] }
    ]
  }
}
```

要点：

- **PreToolUse / PostToolUse 故意不写 `matcher`**：probe 期间观察全部工具，
  拿到完整的 `tool_name` 普查，映射表才有依据。
- **改完配置必须开新会话**：hooks 配置在会话启动时快照，改动对进行中的
  会话不生效。
- 若担心裸 `node` 在 hook 环境解析失败（Q1 未回答前的鸡生蛋问题）：第一轮
  就用裸 `node`；如果 `probe-observed.jsonl` 一直是空的且 Claude Code 有 hook
  报错提示，把 `command` 里的 `node` 换成绝对路径
  `"C:\\Program Files\\nodejs\\node.exe"` 再试一轮——这个对照本身就是 Q1 的答案。

## 4. 如何触发每种 hook

配置好后开一个新 Claude Code 会话，依次做：

| 事件 | 触发动作 | 预期记录 |
| --- | --- | --- |
| `SessionStart` | 会话启动本身 | 1 条，含 `source` 字段形态 |
| `PreToolUse` + `PostToolUse` (Bash) | 让 CC "实际调用 shell 运行 `echo probe-test`" | 各 1 条，`toolName: "Bash"`，`tool_input.command` 形态 |
| `PreToolUse` + `PostToolUse` (Read) | 让 CC "读一下 README.md" | `toolName: "Read"`，`tool_input.file_path` 形态 |
| `PreToolUse` + `PostToolUse` (Edit/Write) | 让 CC "在 scratch.txt 里写一行字" | `toolName: "Write"` 或 `"Edit"` |
| `PostToolUse`（失败形态，Q6） | 让 CC "运行 `exit 1`" 或读一个不存在的文件 | 对比成功/失败两条的 `tool_response` 形态差异 |
| `Notification`（权限，Q5） | 让 CC 运行一个不在允许列表里的命令（会弹权限确认）；**先别批准**，看记录，再批准 | `notificationFlags.mentionsPermission` 应为 true |
| `Notification`（空闲，Q5） | 权限弹窗挂着不理 60 秒以上 | 第二条 Notification，对比 flags 差异 |
| `Stop` | 任何一轮回答正常结束 | 每回合 1 条 |

全部触发后查看：

```powershell
Get-Content adapters\claude-code\probe\probe-observed.jsonl
```

## 5. 完成判据

- [ ] 五类事件各至少 1 条记录（PreToolUse 覆盖 Bash / Read / Edit-Write 三类工具）
- [ ] Q1-Q6 每个问题能从记录中给出明确答案
- [ ] `session_id` 在所有事件中的存在性有结论
- [ ] Notification 权限 vs 空闲的区分方式有结论（结构字段 or 文本启发式）
- [ ] 结论回填本文档 §7，并更新 [adapter 映射文档](claude-code-adapter-mapping.md) 中所有"待 probe 确认"标记

## 6. 移除 / 回滚

删除实验项目的 `.claude/settings.json`（或其中 `hooks` 段），开新会话即彻底
移除。probe 从不改任何全局状态；`probe-observed.jsonl` 是唯一产物，看完可删。

## 7. 实测结论（2026-07-06 路 A 后回填）

### 7.1 测试方法与环境

- Windows 11，Node v24.18.0。
- 第一轮：`npx -y @anthropic-ai/claude-code` 拉起 Claude Code CLI 2.1.201。该会话卡在 CLI 认证，但 `SessionStart` 在认证前真实触发，证明项目级 `.claude/settings.json` 会被加载。
- 第二轮（路 A）：桌面版 Claude Code 以本仓库为项目目录启动新会话，实际触发 Bash / Read / Write / Stop 等 hooks。`probe-observed.jsonl` 目前有 13 条真实记录。
- 自测输出已通过 `SN_CC_PROBE_OUT` 分离到 `probe-fixture-output.jsonl`，不会再混入真实 hook 记录。

### 7.2 事件覆盖

| hook / tool | 记录数 | 结论 |
| --- | ---: | --- |
| `SessionStart` | 3 | ✅ 会话启动会触发；字段含 `session_id` / `transcript_path` / `cwd` / `hook_event_name` / `source` |
| `PreToolUse:Bash` | 3 | ✅ 字段含 `tool_input.command` / `tool_input.description` / `tool_use_id` |
| `PostToolUse:Bash` | 2 | ✅ 字段含 `tool_response.stdout` / `stderr` / `interrupted` / `isImage` / `noOutputExpected` / `duration_ms` |
| `PreToolUse:Read` | 1 | ✅ 字段含 `tool_input.file_path` |
| `PostToolUse:Read` | 1 | ✅ `tool_response.file.content` 会出现为 `string(len=N)`；正式 adapter 必须白名单字段，绝不能透传正文 |
| `PreToolUse:Write` | 1 | ✅ 字段含 `tool_input.file_path` / `tool_input.content`；正式 adapter 只取 basename，不读 content |
| `PostToolUse:Write` | 1 | ✅ `tool_response.content` / `structuredPatch` 等会出现；正式 adapter 必须忽略正文和 patch |
| `Stop` | 1 | ✅ 字段含 `last_assistant_message: string(len=N)`；正式 adapter 只发 `turn_ended`，不读取/发送消息正文 |
| `Notification` | 0 | ⚠️ 本轮未观测到，权限/空闲区分仍未闭环 |

### 7.3 Q1-Q7 回答

| 问题 | 结论 |
| --- | --- |
| Q1 node 可执行性 | ✅ 裸 `node` 在 CLI 与桌面版路 A hook 环境中均可解析，`execPath` 为 `C:\Program Files\nodejs\node.exe`。桌面版路 A 的 `PATH` 为 17 项并包含 Node，因此 settings 里可先使用 `node`，不需要 Codex plugin 那种 `C:\PROGRA~1` 绝对路径。 |
| Q2 cwd | ✅ `cwd` 稳定为项目目录：`...\multiagent-work-assistant`。 |
| Q3 `CLAUDE_*` 环境变量 | ✅ 桌面版路 A 中可见 `CLAUDE_CODE_SESSION_ID`、`CLAUDE_PROJECT_DIR`、`CLAUDE_EFFORT`、`CLAUDE_CODE_ENTRYPOINT`、`CLAUDE_AGENT_SDK_VERSION` 等。`CLAUDE_CODE_SESSION_ID` 可作为 `session_id` 的 fallback，但首选仍是 stdin payload。 |
| Q4 payload / session_id | ✅ 已观测的 `SessionStart`、`PreToolUse`、`PostToolUse`、`Stop` 全部携带 `session_id: string(len=36)`。工具调用还携带 `prompt_id`、`permission_mode`、`effort`、`tool_use_id`；PostToolUse 额外携带 `duration_ms`。 |
| Q5 Notification 权限 vs 空闲 | ⚠️ 未完成。本轮真实日志没有 `Notification` 记录，因此还不能判断 Claude Code 是否会把权限等待/空闲等待发到 Notification hook，也不能依赖文本启发式上线 `permission_required`。 |
| Q6 PostToolUse 失败标志 | ⚠️ 未完成。已观测的 Bash PostToolUse 只有 `stdout` / `stderr` / `interrupted` / `isImage` / `noOutputExpected`，没有 `exit_code` / `is_error` 这类明确失败字段；疑似失败命令没有形成可判定的失败 PostToolUse 记录。MVP 不应从输出正文推断失败。 |
| Q7 spawn node 开销 | ✅ 本轮 13 次 hook 调用未观察到明显卡顿；正式 adapter 仍应保持零 stdout、exit 0、短超时、失败静默。 |

### 7.4 对 Phase 2.2 adapter 的直接结论

- `sessionId`：使用 stdin `session_id`；缺失时再退到 `CLAUDE_CODE_SESSION_ID`。
- `Bash`：`PreToolUse` 可映射为 `command_running`，只发送脱敏命令摘要；`PostToolUse` 默认映射为 `step_done`。
- `Read`：`PreToolUse` 可映射为 `file_reading`，只发送 basename。
- `Write` / `Edit` / `MultiEdit`：`PreToolUse` 可映射为 `file_editing`，只发送 basename。PostToolUse 中可能包含 content / patch，必须忽略。
- `Stop`：可映射为 `turn_ended`，带 sessionId；不要读取或发送 `last_assistant_message`。
- `Notification` / `permission_required`：暂不进入 Phase 2.2 MVP 的强验收，除非补测拿到真实 Notification 记录。
- `error`：暂不根据 PostToolUse 上线通用 `error` 映射；只有未来观测到明确小状态字段（如 exit code / is_error）时再启用。

### 7.5 剩余补测

1. **Notification 补测**：需要构造一个确定会触发 Claude Code Notification hook 的场景，并确认是否能区分权限等待与空闲等待。
2. **失败态补测**：需要构造一个会产生 `PostToolUse` 且带明确失败字段的工具调用；如果 Claude Code 不提供结构化失败字段，Phase 2.2 只发 `step_done`，把失败识别留到后续。
3. 补测前不要实现正式 adapter 中的 `permission_required` / 通用 `error`，避免把不可靠推断产品化。
