# Claude Code Adapter 事件映射设计（Phase 2.2 蓝图）

- 日期：2026-07-06
- 状态：**Phase 2.2 蓝图**——Bash/Read/Write/Stop 已有真实 probe 依据；Notification 与失败态仍待补测
- 目标协议：unified signal protocol（当前 v0.1.0，实现时按
  [v0.2 计划](../architecture/signal-protocol-v0.2-plan.md) 对齐）
- 参照实现：codex-task-pet `plugins/supernono-codex/hooks/lib.js`（分类与脱敏
  逻辑大部分可直接改造复用）

## 1. Envelope 映射

| 协议字段 | 取值 | 说明 |
| --- | --- | --- |
| `agent` | `claude-code` | 固定 |
| `adapter` | `claude-code-hooks` | 固定 |
| `sessionId` | stdin payload 的 `session_id` | ✅ 已实测确认 `SessionStart` / `PreToolUse` / `PostToolUse` / `Stop` 均携带 `string(len=36)` UUID；`CLAUDE_CODE_SESSION_ID` 可作为 fallback。 |
| `taskId` | 不发（null） | Claude Code hooks 无 turn 级 ID；不造假 |
| `payload` | 见 §2 各事件 | 只放脱敏摘要 |

## 2. 事件映射表

| Claude Code hook | 条件 | → 协议事件 | payload 要点 |
| --- | --- | --- | --- |
| `PreToolUse` | `tool_name` = `Bash` | `command_running` | `command` = 脱敏摘要（≤80 字符，token 正则遮蔽）；`isTest` = TEST_RX 命中（test/jest/pytest/lint/tsc/build...，同 Codex 版） |
| `PreToolUse` | `Edit` / `Write` / `MultiEdit` / `NotebookEdit` | `file_editing` | `file` = **basename only** |
| `PreToolUse` | `Read` / `Grep` / `Glob` / `WebFetch` / `WebSearch` | `file_reading` | `file` = basename（搜索类给 action 文案即可） |
| `PreToolUse` | `Task`（子代理）/ `mcp__*` / 其他未知工具 | `command_running` | `action` = "正在使用工具：<tool_name>"，不捏造相位 |
| `PostToolUse` | `tool_response` 无失败标志 | `step_done` | isTest 命中时附 `rule: "testPass"`（与 Codex 版一致，驱动能量 +15） |
| `PostToolUse` | 有明确结构化失败字段时 | `error`（暂缓） | ⚠️ 本轮未观测到 `exit_code` / `is_error` 等可靠字段；不要从 stdout/stderr 正文推断失败。Phase 2.2 MVP 默认只发 `step_done`，失败映射待补测。 |
| `Notification` | 权限类 | `permission_required`（暂缓） | ⚠️ 本轮未观测到 Notification 记录；不能确认权限等待/空闲等待是否会进入该 hook。Phase 2.2 MVP 不把它列为强依赖。 |
| `Notification` | 空闲/其他 | **忽略**（v1） | 回合结束由 Stop 负责，空闲提醒对 pet 无增量信息 |
| `Stop` | — | `turn_ended` | ✅ 已实测；payload 含 `last_assistant_message: string(len=N)`，adapter 必须忽略正文，只发送回合结束信号。 |
| `SubagentStop` | — | **忽略**（v1） | 子代理细分留给后续 |
| `SessionStart` | — | **暂不发送**（v1） | ✅ 已实测字段：`session_id` / `transcript_path` / `cwd` / `hook_event_name` / `source`。不映射为 `task_start`，避免 resume/新会话误重置宠物上下文。 |
| `UserPromptSubmit` | — | **永不接入** | 内容敏感，铁律 |

### permission_resolved 的合成规则（Claude Code 没有对应 hook）

- ⚠️ 该规则暂缓到 Notification 补测后实现。设计假设如下：该会话发过 `permission_required` 之后，**下一个** `PreToolUse` / `PostToolUse`
  到达时，adapter 先补发 `permission_resolved`（`approved: true`，`resumePhase`
  按该工具的相位）再发正常事件。批准 → 工具执行 → 自然触发，链路闭合。
- 用户**拒绝**时不会有下一个工具事件：回合随后结束，`Stop` → 带 sessionId 的
  `turn_ended` 会直接落到该会话并清掉等待状态（session 级 settle 事件不走
  no-session 保护路由，这正是期望行为）。
- adapter 需要维护一个极小的本地状态：`{ sessionId: pendingPermission }`。
  hook 进程是一次一个的，状态放临时文件（如 `%TEMP%` 下按 sessionId 的
  marker 文件）⚠ 实现细节 Phase 2.2 定。

## 3. 脱敏规则（与 Codex adapter 完全一致）

- 命令：压平空白、遮蔽 `bearer/token/sk-/ghp-/--password=` 等模式、截断 80 字符
  （直接改造 `plugins/supernono-codex/hooks/lib.js` 的 `safeCommandSummary`）。
- 文件：只发 basename，永不发全路径（`baseName`，60 字符截断）。
- 绝不发送：prompt、源码正文、diff、工具输出正文、transcript 内容、密钥。
- 防御式解析：字段缺失一律降级为通用文案，永不 throw，永远 exit 0，
  stdout 零输出（stdout 会被 Claude Code 解释为 hook 决策）。

## 4. Phase 2.2 实现结构建议

```text
adapters/claude-code/
├── probe/                  # Phase 2.1 已有，保留
├── send-signal.js          # 从 codex-task-pet adapters/shared/ 复制（vendored：
│                           #   两仓库已拆分，不做跨仓库依赖；文件头注明来源）
├── lib.js                  # readHookInput / 分类 / 脱敏 / send（改造 Codex 版）
├── pre-tool-use.js         # 4 个薄入口，每个 <25 行
├── post-tool-use.js
├── notification.js
├── stop.js
├── hooks-settings.example.json   # 用户 merge 进 settings 的片段
└── README.md               # 安装 / 验证 / 卸载
```

- 安装形态 v1 = 手动把 example 片段 merge 进 `~/.claude/settings.json` 或项目级
  settings（README 给步骤）；自动 install.js（带备份，学 notify-wrapper 安装器）
  做成可选项，不阻塞 MVP。
- ✅ 已实测（CLI 2.1.201 + 桌面版路 A / Windows）：hook 进程 `cwd` = 项目目录，裸 `node` 可解析，`execPath` 为 `C:\Program Files\nodejs\node.exe`。settings 里可以直接写 `node`，不需要 Codex plugin 那样的 `C:\PROGRA~1` 绝对路径。
- `timeout` 建议 10（秒）；send-signal 内部 800ms 超时静默失败，桌宠没开时
  对 Claude Code 的额外延迟 <1s 且仅在超时路径上。本轮真实 probe 未观察到明显卡顿。

## 5. 与 pet 端 agentStore 的对接确认项

- `sessionId` 全程携带 → pet 端自动按 `claude-code:<session_id>` 建独立条目，
  与 Codex 条目互不污染（Phase 1 已验证该路径）。
- `Stop` → `turn_ended` 带 sessionId，session 级直达，不经过 no-session
  保护路由——拒绝授权后的状态清理依赖这一点（见 §2 合成规则）。
- 多个并发 Claude Code 会话 = 多个条目 = 面板多张卡片，无需 pet 端任何改动。

## 6. MVP 验收（Phase 2.2 完成的定义）

1. 真实 Claude Code 会话：Bash 工具调用产生 `command_running` + `step_done`
   （`agent: "claude-code"`，pet 面板出现对应卡片）。
2. `permission_required` 暂不作为 Phase 2.2.0 强验收；等 Notification 补测确认后再纳入。
3. SuperNoNo 未运行时：Claude Code 无报错、无可感知延迟。
4. 泄漏自检：跑一个含假密钥的命令，桥接收到的 payload 里不出现密钥明文。
5. Codex + Claude Code 并发时（可用 manual test 模拟 Codex 侧），两张卡片
   归属正确，attention 切换符合 Phase 1 规则。
