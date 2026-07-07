# Claude Code Adapter（Phase 2.2.0 MVP）

把 Claude Code 官方 hooks 的真实事件转换成 SuperNoNo 统一信号协议事件，发到
桌宠本地桥 `127.0.0.1:4174/signal`。**不消耗模型 token，不读取任何对话内容。**

- 设计依据：[docs/claude-code/claude-code-adapter-mapping.md](../../docs/claude-code/claude-code-adapter-mapping.md)
- probe 实测：[docs/claude-code/claude-code-hooks-probe-plan.md](../../docs/claude-code/claude-code-hooks-probe-plan.md) §7
- 协议：codex-task-pet `docs/supernono-signal-protocol.md`（v0.1.0）

## 本版实现范围（刻意收窄）

| Claude Code hook | 条件 | → 协议事件 |
| --- | --- | --- |
| `PreToolUse` | `Bash` | `command_running`（`isTest` 由命令启发式判定） |
| `PreToolUse` | `Read` / `Grep` / `Glob` / `WebFetch` / `WebSearch` | `file_reading`（只有 Read 附 basename；Grep/Glob/WebFetch 只发通用文案） |
| `PreToolUse` | `Write` / `Edit` / `MultiEdit` / `NotebookEdit` | `file_editing`（basename only） |
| `PostToolUse` | 任意工具 | `step_done` |
| `Stop` | — | `turn_ended`（session 级，宠物安静回 idle） |

未列出的工具（`Task`、`mcp__*` 等）不会发送 `PreToolUse` 阶段事件；但 `PostToolUse` 是 catch-all，仍会为任意工具统一发送普通 `step_done`，表示 Claude Code 完成了一步工具调用。该事件不解析 `tool_response`，也不做 `error` / `testPass` 判断。envelope 固定
`agent: "claude-code"`、`adapter: "claude-code-hooks"`；`sessionId` 取 payload
`session_id`，兜底 `CLAUDE_CODE_SESSION_ID` 环境变量；`taskId` 恒为 null。

### 明确不在本版（Phase 2.2.x 后续任务）

1. **`Notification` → `permission_required`**：probe 实测桌面版权限弹窗挂起 60 秒
   未触发任何 Notification hook 记录，该链路在拿到新证据前不实现。
2. **`permission_resolved` 合成**：依赖上一条。
3. **`PostToolUse` → `error` 与 `testPass` 能量规则**：probe 未发现可靠的结构化
   失败字段，而读取 stdout/stderr 正文被隐私铁律禁止；在没有成功信号前发
   "测试通过"是不诚实的 UI，所以本版一律发普通 `step_done`。
4. 未列出工具的映射、`SubagentStop`、`SessionStart` → `task_start`。

## 隐私与行为保证

- 命令 → 脱敏短摘要（≤80 字符，`bearer`/`token`/`sk-`/`--password=` 等模式遮蔽）。
- 文件 → 只发 basename；Grep pattern、WebFetch URL、Write content 一律不发。
- `tool_response`、`last_assistant_message`、transcript **从不读取**。
- hook 脚本 stdout 零输出（stdout 会被 Claude Code 解释为 hook 决策）、永远
  exit 0、桌宠未运行时静默失败（实测 <50ms 退出），绝不影响 Claude Code。

## 安装

1. 打开 [hooks-settings.example.json](hooks-settings.example.json)，把
   `<ADAPTER_DIR>` 替换为本目录的绝对路径（JSON 内反斜杠双写）。
2. 把其中的 `hooks` 对象 merge 进目标项目的 `.claude/settings.json`
   （推荐，作用域最小）或 `~/.claude/settings.json`（全局）。已有 hooks 的话
   把各事件的数组项合并进去，不要整段覆盖。
3. **开新的 Claude Code 会话**（hooks 配置在会话启动时快照，改动不影响进行中
   的会话）。
4. 裸 `node` 已经 probe 实测可在 hook 环境解析（Windows，CLI 与桌面版两个表面）；
   如你的环境特殊，把 `command` 里的 `node` 换成 node.exe 绝对路径。


### 脚本安装（Phase 2.5）

也可以用安装脚本写入项目级或用户级 settings。脚本会先备份已有 `settings.json`，并且重复运行不会生成重复 hook。

```cmd
# 项目级安装：写入当前目录的 .claude\settings.json
node adapters\claude-code\install.js

# 指定项目目录
node adapters\claude-code\install.js --project C:\path\to\your-project

# 用户级安装：写入 %USERPROFILE%\.claude\settings.json
node adapters\claude-code\install.js --user

# 如果 hook 环境找不到裸 node，可指定 node.exe
node adapters\claude-code\install.js --project C:\path\to\your-project --node C:\PROGRA~1\nodejs\node.exe
```

卸载：

```cmd
node adapters\claude-code\uninstall.js --project C:\path\to\your-project
```

健康检查：

```cmd
node adapters\claude-code\health-check.js --project C:\path\to\your-project
```

`health-check.js` 会检查 Node、adapter 文件、settings hooks、重复 hook，以及 SuperNoNo 本地桥 `/health`。桌宠未启动时 bridge 项只会是 WARN，不影响 adapter 安装判断。

## 测试

```powershell
# 1) 语法
node --check adapters/claude-code/lib.js

# 2) 完整 fixture 验证（不需要 Claude Code / 桌宠；内置假桥接 + 泄漏自检）
node adapters/claude-code/manual-fixture-test.js       # 应输出 ALL PASS

# 3) 端到端：先启动桌宠（codex-task-pet: npm start），再在装好 hooks 的项目里
#    开一个 Claude Code 会话，让它跑 `echo hello`——宠物应进入"施工/验证"，
#    工具结束出现 step_done，回合结束安静回 idle。多开会话 = 面板多张卡片。
```

## 回滚

从 settings.json 里删掉本 adapter 的三个 hooks 条目（或整个 `hooks` 段，若为
本 adapter 独占），开新会话即彻底移除。adapter 无任何其他持久状态。

## 性能

每次工具调用 spawn 一个 node 进程（约 30-80ms，异步于工具本身），PreToolUse
用 matcher 限定在映射覆盖的十个工具内；send 内部 800ms 超时。probe 期间未观察
到可感知卡顿。

## Phase 2.6 语义门

`permission_required`、`permission_resolved`、`error`、`testPass` 仍未接入 live hooks。Phase 2.6 新增了可执行的语义准入规则：

```cmd
node adapters\claude-code\semantic-gates-test.js
```

说明见 [docs/claude-code/phase-2-6-semantic-gates.md](../../docs/claude-code/phase-2-6-semantic-gates.md)。只有拿到结构化真实 payload 后，才允许把这些语义接入 `lib.js`。