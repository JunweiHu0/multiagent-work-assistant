# Claude Code Hooks Probe 计划（Phase 2.1）

- 日期：2026-07-06
- 状态：probe 脚本就绪、自测通过；**等待真实 hook 触发数据**
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

## 7. 实测结论（待回填）

> 真实 hook 触发后在这里回填 Q1-Q7 的答案与脱敏样例记录。

**先行观察（2026-07-06，来自 probe 自测，非 hook 环境，仅供参考）**：自测运行在
Claude Code 的 Bash 工具子进程里，该环境下裸 `node` 可解析
（`C:\Program Files\nodejs\node.exe`），且存在 `CLAUDE_CODE_SESSION_ID`、
`CLAUDECODE` 等环境变量——如果 hook 进程同样继承这些，adapter 将获得 stdin 之外
的第二个 sessionId 来源。**hook 的真实执行环境可能不同，以真实记录为准。**
