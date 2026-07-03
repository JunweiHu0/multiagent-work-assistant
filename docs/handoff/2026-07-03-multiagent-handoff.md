# Multiagent 开发交接文档（双仓库版，公司电脑 → 家里电脑）

- 日期：2026-07-03
- 写给：家里电脑上的 Claude Code / Codex（全新 agent，无本会话上下文）
- 本文档是权威版本；codex-task-pet 仓库 `docs/multiagent/` 下有一份拆库前的
  单仓库版交接文档，作为备份保留，内容以本文档为准。

## 0. 最重要的一件事：现在是两个仓库

| 仓库 | GitHub | 用途 |
| --- | --- | --- |
| **codex-task-pet** | https://github.com/JunweiHu0/codex-task-pet | 桌宠 UI / `/signal` 本地桥 / pet 端 multiagent core。**用来运行桌宠**，不再加聚合层逻辑 |
| **multiagent-work-assistant** | https://github.com/JunweiHu0/multiagent-work-assistant | 本仓库。PRD/战略/协议文档 + 后续全部 adapter 与聚合层开发。**Claude Code probe 和 adapter 在这里做** |

分工与纪律见 [repo-boundary.md](../architecture/repo-boundary.md)。
一句话：pet 是脸，本仓库是大脑；唯一耦合点是 `127.0.0.1:4174` 的 `/signal` 协议。

家里电脑 clone 两个仓库：

```powershell
git clone https://github.com/JunweiHu0/codex-task-pet.git
git clone https://github.com/JunweiHu0/multiagent-work-assistant.git

# 测 pet 端 multiagent core 时，pet 仓库切 v2 分支：
cd codex-task-pet
git switch v2/multiagent-work-assistant
```

## 1. 当前项目状态

### SuperNoNo v1.0 桌宠（codex-task-pet，已定版冻结）

- Electron 透明常驻小窗桌宠 + 本地事件桥（`127.0.0.1:4174`）+ agent-neutral
  信号协议 v0.1.0（规范暂在 pet 仓库 `docs/supernono-signal-protocol.md`，
  v0.2 起权威版本迁到本仓库，见 [协议 v0.2 计划](../architecture/signal-protocol-v0.2-plan.md)）。
- **Codex plugin hooks 是真实接入**：官方 `PreToolUse` / `PostToolUse` /
  `PermissionRequest` 已在真机 Codex Desktop 端到端验证（adapter 标识
  `codex-plugin-hooks`）。踩坑记录在 pet 仓库
  `docs/2026-07-01-codex-plugin-hooks-handoff.md`（三个根因：`${PLUGIN_ROOT}`
  展开、Windows 绝对 node 路径、`shell_command|Bash` matcher）。
- **notify wrapper 是 turn-level fallback**：每回合一条粗粒度 `turn_ended`
  （adapter `codex-desktop-notify`），无 per-tool 信息、无 sessionId。保持
  fallback 定位。
- v1.0 收尾遗留（都在 pet 仓库，公开发布前处理）：T0.2 桥接安全加固
  （Origin/Host 校验 + openPath 防护，P1）、T0.3 公开构建剔除 Live2D nono
  模型（版权存疑，P0）。
- tag `v1.0.0`，`main` tip `ac8b87b`。

### Pet 端 multiagent core（codex-task-pet 的 v2/multiagent-work-assistant 分支）

已完成并推送（tip `2b26ac8` + 交接文档 commit）：

- **agentStore**（`src/renderer/js/agentStore.js`）：按 `agent:sessionId` 隔离，
  每条目复用一个 SignalAdapter 实例 + 独立 petState（signalAdapter 只加了类
  导出，stateEngine 零改动）。
- **隔离路由**：无 agent → `default` 条目（v1.0 行为逐项兼容）；
  agent+sessionId → 独立条目；agent 无 sessionId → 最近活跃条目，且
  **settle 事件（turn_ended/idle/completed）跳过等待授权的会话**，全员等待时
  只记 timeline（不清任何人的 waiting_approval）。
- **attention policy v0**：`waiting_approval(50) > blocked(40) >
  building/validating(30) > scanning/thinking(20) > completed(10) > idle(0)`，
  平级取最近活跃；宠物本体只渲染 focus 条目；气泡只为 focus 弹，非 default
  agent 加 `[agent]` 前缀。
- **timeline ring buffer**（150 条，只存 type/agent/短 action）+ 面板
  multiagent 区块（summary / agent cards / timeline，仅真实 agent 出现时显示）。
- **淘汰保护**：条目上限 12；新条目在首个事件前不可淘汰；受害者只能是最旧
  idle、非 focused、非 default 条目。
- 调试 API：`SuperNoNo.getAgents()` / `getTimeline()` / `getFocusedAgent()`；
  `SuperNoNo.signal(type, payload)` 的 payload 可带 agent/sessionId 定向。

### 本仓库（multiagent-work-assistant，刚建立）

只有文档结构（README / roadmap / 架构 / 战略 / PRD / 本交接文档），
**还没有任何代码**。第一个代码交付物是 Claude Code hooks probe（见第 5 节）。

## 2. 已验证内容（2026-07-03，公司电脑）

1. `node --check` 全部通过。
2. Node 逻辑冒烟测试 28 项断言全过（store/engine/adapter 无 DOM 依赖，可直接
   Node 加载）：状态隔离、permission_required 立即夺焦、command_running /
   turn_ended / completed 不覆盖等待授权、focus 回落、tick 衰减、unknown 事件
   不崩溃。
3. 两个边界修复各有回归测试（20 项断言全过）：13+ agent 淘汰边界、no-session
   turn_ended 不清 waiting_approval（含全员等待时降级 timeline-only）。
4. 端到端：pet 仓库 `npm start` + `node adapters/shared/manual-multiagent-test.js`
   9/9 投递、renderer 零报错；旧单 agent 测试 5/5。
5. 面板真实 DOM 渲染验证：双 agent 卡片/summary/timeline 正确；纯单 agent
   场景 multiagent 区块隐藏（v1.0 外观不变）。

> 冒烟测试脚本在公司电脑临时目录，未进仓库。重建方法：Node 里依次 require
> pet 仓库的 `config.js`、`signalAdapter.js`、`stateEngine.js`、`agentStore.js`
> （挂 globalThis 的 IIFE），对 `SN.agents.handleSignal(...)` 断言。
> 建议在 Phase 1.1 固化成脚本。

已知继承语义（不是 bug，别修）：unknown 事件会按 adapter 仍 live 的 flags
重推可视状态（v1.0 原有行为）。

## 3. 已知限制

1. **没有 Claude Code adapter**——此前测试里的 claude-code 事件全是模拟。
2. multiagent UI 是最小版：卡片不可点、无手动 pin、无 staleness 主动提醒。
3. 无本地持久化：timeline 重启即失（MVP 判断不需要数据库）。
4. 协议文档还是 v0.1.0，v0.2 增量在[计划文档](../architecture/signal-protocol-v0.2-plan.md)里待落地。
5. Codex plugin `hooks.json` 的 `command_windows` 硬编码本机 node 路径，
   换机器要手动改（pet 仓库 `plugins/supernono-codex/INSTALL.md`）。
6. notify wrapper 不转发 thread-id/turn-id（战略文档 S2，~10 行改动，未做）。
7. pet 仓库遗留 T0.2 / T0.3（见第 1 节）。

## 4. 家里电脑环境准备

```powershell
# Node 20+（项目在 Node 24 验证过）。npm 被执行策略挡住时用 npm.cmd。

# —— 桌宠（codex-task-pet，v2 分支）——
cd codex-task-pet
git switch v2/multiagent-work-assistant
npm.cmd install          # Electron 下载失败见 pet 仓库 docs/codex-plugin-hook-integration-plan.md §16 的镜像方案
npm.cmd start            # bridge 起在 127.0.0.1:4174

# —— 双 agent 验收（另一终端）——
node adapters/shared/manual-multiagent-test.js
# 9 步交错事件；带 ★ 的三步宠物必须保持"等待授权"
```

**如果要测真实 Codex hooks**：家里的 `~/.codex` 是另一套环境，plugin 安装 /
trust / cache 全部重来（按 pet 仓库 `plugins/supernono-codex/INSTALL.md`，先改
`hooks.json` 里的 node 绝对路径）。**Phase 2.1 probe 不依赖这一步。**

**Claude Code probe / adapter 的开发在本仓库进行**，产出放
`adapters/claude-code/probe/` 与 `docs/architecture/`。

## 5. 下一步任务（按优先级）

| 优先级 | 任务 | 仓库 | 说明 |
| --- | --- | --- | --- |
| 1 | Phase 2.1 Claude Code hooks probe | **本仓库** | 诊断 hook 实测四类事件的 stdin 字段（脱敏）、cwd、node 可执行性；产出 `docs/architecture/claude-code-adapter-plan.md`。只调研，不写正式 adapter |
| 2 | Phase 1.1 协议 v0.2 落地 | 本仓库（规范）+ pet 仓库（版本号） | 按 [v0.2 计划](../architecture/signal-protocol-v0.2-plan.md)；顺手固化冒烟测试 |
| 3 | Phase 2.2 Claude Code adapter MVP | 本仓库 | 映射表见战略文档 5.4 节；session_id → sessionId |
| 4 | Phase 2.3 双 agent 真实并发验收 | 两仓库联调 | 真实 Codex + Claude Code 各跑一个任务 |
| 5 | 顺手项 | pet 仓库 | S2（notify wrapper 转发 sessionId，~10 行）；T0.2 桥接安全加固（修完 cherry-pick 回 main） |

## 6. 给家里电脑 CC 的第一条任务提示词

在 **multiagent-work-assistant 仓库目录**下，把以下内容发给 Claude Code：

```text
请先读这四个文档，读完再动手：
1. docs/handoff/2026-07-03-multiagent-handoff.md（交接文档，当前状态以它为准）
2. docs/architecture/repo-boundary.md（两个仓库的边界——本仓库是大脑，不做 UI）
3. docs/strategy/supernono-v1-closeout-and-multiagent-strategy.md（第 5.4 节 Claude Code adapter 映射表）
4. docs/architecture/signal-protocol-v0.2-plan.md（协议增量计划）

然后执行 Phase 2.1：Claude Code hooks probe（只做调研验证，不写正式 adapter）。

任务：
1. 在本仓库新建 adapters/claude-code/probe/，写一个诊断 hook 脚本：被 Claude Code
   hook 调用时，把 stdin JSON 的"字段名和值类型"（绝不记录值本身）、cwd、
   process.execPath、PATH 里能否找到 node，追加写入
   adapters/claude-code/probe/probe-observed.jsonl（该文件加进 .gitignore）。
2. 给出把诊断 hook 挂到 ~/.claude/settings.json 的最小 hooks 配置片段
   （PreToolUse / PostToolUse / Notification / Stop 四类事件），先打印给我确认，
   不要直接改我的 settings.json。
3. 我确认并跑几个真实 Claude Code 任务后，读取 probe-observed.jsonl，产出
   docs/architecture/claude-code-adapter-plan.md：四类事件的实测字段结构（脱敏）、
   session_id 是否存在、Windows 下 node 可执行性结论、正式 adapter 的事件映射表
   （对照战略文档 5.4 节，目标协议按 v0.2 计划）。

限制：
- 本仓库不做任何 UI；不要 clone 或修改 codex-task-pet 的代码（运行桌宠联调除外）。
- 不要写正式 Claude Code adapter（那是 Phase 2.2，等 probe 结论）。
- probe 脚本必须永不 throw、绝不记录 prompt/代码/token 内容、桌宠没运行也不报错。
- 新增文件只放在 adapters/claude-code/probe/ 和 docs/ 下。
```
