# Phase 2.3 双 Agent 并发验收（Codex + Claude Code）

- 日期：2026-07-06
- 目的：确认 codex-task-pet 的 multiagent core 能正确处理**两个真实 agent**
  的事件归属、attention 切换、timeline 展示和状态恢复。
- 验收分两层：**仿真层**（`manual-realistic-dual-agent-test.js`，逐字段模拟两个
  真实 adapter 的 envelope，可随时重跑）与**真实层**（真实 Codex 任务 + 真实
  Claude Code 会话并发，人工观察）。仿真层已由脚本+断言验证通过；真实层按
  本文档人工执行。

## 1. 环境准备

| 项 | 要求 |
| --- | --- |
| codex-task-pet | 分支 **`v2/multiagent-work-assistant`**（tip ≥ `c8b75c6`；multiagent core 在 `2b26ac8` 引入） |
| multiagent-work-assistant | **`9859124`（Add Claude Code adapter MVP）之后**，且包含本验收文档与 `adapters/shared/manual-realistic-dual-agent-test.js` |
| Node | 20+（真机验证用的是 v24.18.0） |
| 桌宠启动 | `cd codex-task-pet && npm install && npm start`（调试用 `npm start -- --dev` 附 DevTools）。确认桥接：`curl http://127.0.0.1:4174/health` 返回 `{"ok":true,...}` |

### 确认 Claude Code hooks 已安装

1. 目标项目的 `.claude/settings.json` 里有本仓库 adapter 的三条 hooks
   （`pre-tool-use.js` / `post-tool-use.js` / `stop.js`，安装方法见
   [adapters/claude-code/README.md](../../adapters/claude-code/README.md)）。
2. **改过 settings 必须开新的 Claude Code 会话**（hooks 在会话启动时快照）。
3. 快速自证：桌宠运行时，在该项目的 Claude Code 会话里让它跑 `echo hello`——
   宠物应进入施工态并在状态栏显示命令摘要。没反应先跑
   `node adapters/claude-code/manual-fixture-test.js`（应 ALL PASS）区分
   adapter 问题和 hooks 未生效问题。

### 确认 Codex hooks 已安装

1. `codex plugin list --json` 里有 `supernono-codex@supernono-local`
   （安装/信任流程见 codex-task-pet `plugins/supernono-codex/INSTALL.md`）。
2. hooks 已 **trust**（改过 hook 内容需重新 trust），且 `hooks.json` 的
   `command_windows` 指向本机真实 node 路径（默认 `C:\PROGRA~1\nodejs\node.exe`）。
3. 快速自证：桌宠运行时跑一个真实 Codex 任务（shell 命令），宠物应有反应，
   事件 adapter 标识为 `codex-plugin-hooks`。

## 2. 仿真层验收（先跑这个）

```powershell
# 桌宠已启动后：
cd multiagent-work-assistant
node adapters/shared/manual-realistic-dual-agent-test.js
```

脚本以 2.5s 间隔发送 7 步交错事件（codex/codex-s1 与 claude-code/claude-s1），
每步打印预期观察。**7/7 delivered** 且宠物行为符合第 4 节预期即通过。

## 3. 真实层验收（人工并发）

1. 桌宠运行中，打开托盘 → 任务面板。
2. **触发 Codex 事件**：在 Codex Desktop 里开一个任务，让它实际运行 shell
   命令（如 `echo codex-live-test`）。预期：面板出现 codex 卡片，
   `command_running` → `step_done`，回合结束 `turn_ended`。
3. **触发 Claude Code 事件**：同时在装好 hooks 的项目里开 Claude Code 会话，
   让它跑 `echo cc-live-test` 并读一个文件。预期：面板出现第二张卡片
   （claude-code），互不覆盖。
4. 让两边交替干活（Codex 跑构建、Claude Code 编辑文件），观察 focus 切换与
   状态栏 `[agent]` 前缀。
5. 一边先结束，另一边继续：先结束方卡片回待机，宠物跟随仍在工作的一方。
6. 全部结束：宠物安静回 idle，不庆祝。

## 4. 预期表现

### 宠物本体 / 气泡

- 两个 agent 同为工作态（rank 30 平级）时，focus 跟随**最近活跃**方——focus
  会随事件在两个 agent 间切换，这是 attention policy v0 的设计行为；气泡有
  同状态去重，不会因此刷屏。（已知边界：同一毫秒内的平级事件保持现有 focus，
  仅理论存在。）
- 任一 agent 的 `turn_ended`（带 sessionId）只落自己的会话条目，**绝不**影响
  另一 agent 的状态——这是本验收的核心断言。
- 全部结束后宠物 idle，约 60s 无活动进入 resting。

### `SuperNoNo.getAgents()`（DevTools，`npm start -- --dev`）

仿真脚本跑完后应为 2 个条目（真实层为各自真实 sessionId）：

```js
[
  { key: 'claude-code:claude-s1', agent: 'claude-code', adapter: 'claude-code-hooks',
    state: 'idle', requiresUserAction: false, lastEventType: 'turn_ended', focused: true, ... },
  { key: 'codex:codex-s1', agent: 'codex', adapter: 'codex-plugin-hooks',
    state: 'idle', requiresUserAction: false, lastEventType: 'turn_ended', focused: false, ... },
]
```

要点：恰好 2 条、key 归属正确、无互相污染、恰好一个 `focused: true`。

### `SuperNoNo.getTimeline()`

仿真层：7 条、两 agent 交错、顺序为
`command_running ×2 → step_done → file_editing → step_done → turn_ended ×2`，
每条含 `{at, agentKey, agent, type, action}` 且 action 为脱敏短文案。
真实层：条数不定，但每条 `agent` 归属必须正确。

## 5. 出问题时如何定位

| 症状 | 排查顺序 |
| --- | --- |
| 仿真脚本全 MISS | 桌宠没启动或桥接端口被占：看 `npm start` 控制台是否有 `bridge listening`；`curl /health`；`SUPERNONO_BRIDGE_PORT` 是否被改 |
| Claude Code 无事件 | ① 新会话了吗（settings 快照）② `manual-fixture-test.js` 是否 ALL PASS ③ settings 里 adapter 路径是否绝对且正确 |
| Codex 无事件 | ① hooks trust 状态 ② `hooks.json` node 绝对路径 ③ plugin cache 是否刷新（remove + add）④ 区分 `codex-plugin-hooks` 与 notify wrapper 的 `codex-desktop-notify` |
| 卡片归属错 / 状态互相污染 | DevTools 跑 `SuperNoNo.getAgents()` 看 key；无 sessionId 的事件会走"最近活跃同 agent 条目"路由（见 agentStore `_resolveEntry`），确认 adapter 是否漏发 sessionId |
| focus 不符合预期 | 对照 rank 表（waiting 50 > blocked 40 > building/validating 30 > scanning/thinking 20 > completed 10 > idle 0，平级取最近活跃）；`SuperNoNo.getFocusedAgent()` 直接看结论 |
| 事件到了桥接但宠物没反应 | 看 `npm start` 控制台 `[renderer]` 前缀的报错行 |

## 6. 本轮实际执行记录（2026-07-06，公司电脑）

- 仿真层：pet 端 store 断言 **19/19 PASS**（真实 renderer 模块 + 桥接归一化
  复现，覆盖 focus 切换 / 隔离 / timeline 顺序）；真实桌宠运行下脚本
  **7/7 delivered**，renderer 零报错；旧 `manual-multiagent-test.js` 重跑 9/9
  不受影响。
- 未发现 pet 端 multiagent bug。
- 真实层（真实 Codex Desktop + 真实 Claude Code 并发）待人工按第 3 节执行。
