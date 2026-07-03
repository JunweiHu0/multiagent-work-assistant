# Multiagent Work Assistant PRD

## 1. 产品定位

Multiagent Work Assistant 是一个面向个人开发者的多 agent 协作工作台。

SuperNoNo 不再只是 Codex 桌宠，而是作为个人工作助理常驻桌面，持续汇报多个 coding agent 的工作状态、进展、阻塞、授权需求和产出。

第一阶段支持两个 agent：

- Codex
- Claude Code

核心目标：

```text
让用户不用频繁切换窗口，也能知道每个 agent 正在做什么、卡在哪里、什么时候需要自己介入。
```

## 2. 背景

当前 SuperNoNo v1.0 已经完成：

- 桌面宠物 UI
- 本地 signal bridge
- agent-neutral signal protocol
- Codex Desktop plugin hooks 接入
- Codex notify wrapper turn-level fallback
- 命令执行、步骤完成、回合结束等事件可视化

下一阶段要把它从“Codex 桌宠”升级成“多 agent 个人工作助理”。

用户可能同时让 Codex 和 Claude Code 处理不同任务，例如：

- Codex 负责实现代码
- Claude Code 负责阅读、规划、重构或补充文档
- 两者并行处理不同 issue
- 用户只在需要授权、决策、验收时介入

## 3. 目标用户

第一阶段目标用户：

- 个人开发者
- 使用 Codex / Claude Code 做日常 coding work 的用户
- 希望多个 agent 并行工作，但不想一直盯着每个终端或桌面窗口的人

典型场景：

- 同时开多个 agent 修不同 bug
- 一个 agent 写代码，另一个 agent 写 PRD / 测试 / review
- agent 长时间运行，用户想知道是否卡住
- agent 请求权限或需要用户输入时，桌宠提醒用户

## 4. 产品愿景

SuperNoNo 成为一个轻量、安静、持续在线的桌面工作助理。

它不替代 Codex 或 Claude Code，也不做聊天机器人，而是承担三件事：

1. 汇报状态：谁在工作，正在做什么。
2. 提醒介入：哪里需要用户授权、选择或处理阻塞。
3. 聚合进展：把多个 agent 的任务进度收敛到一个桌面入口。

## 5. 第一阶段范围

### 5.1 支持的 Agent

MVP 支持：

| Agent | 接入方式 | 状态 |
| --- | --- | --- |
| Codex | Codex plugin hooks + notify fallback | 已验证基础链路 |
| Claude Code | 待设计 adapter | 下一步实现 |

### 5.2 SuperNoNo 桌面端职责

桌面端负责：

- 接收统一事件协议
- 区分 agent / adapter / sessionId / taskId
- 显示当前最需要用户关注的任务
- 在托盘或面板里展示多 agent 列表
- 在宠物状态栏显示简短当前状态
- 在气泡里提示重要事件
- 在授权、阻塞、失败时提高提醒优先级

### 5.3 不做的事情

MVP 不做：

- 不让 SuperNoNo 直接控制 agent
- 不把 Codex 和 Claude 的 prompt 内容同步给桌宠
- 不存储源码正文、token、密钥
- 不做复杂任务调度系统
- 不做云端同步
- 不做跨设备状态同步

## 6. 核心用户故事

### Story 1：查看所有 agent 状态

作为用户，我希望从 SuperNoNo 的托盘面板看到：

- Codex 是否在工作
- Claude Code 是否在工作
- 每个 agent 当前任务标题
- 每个任务的最新动作
- 是否有需要我处理的授权或阻塞

### Story 2：桌宠主动提醒我

当某个 agent 需要用户授权、遇到阻塞或完成任务时，SuperNoNo 应该：

- 改变宠物状态
- 显示短气泡
- 可选地闪烁窗口或托盘
- 不打断用户写代码

### Story 3：我只关心最重要的事

多个 agent 同时工作时，SuperNoNo 不应该刷屏。

它应该按优先级显示：

1. permission_required
2. blocked / error
3. completed
4. active command / editing / test
5. idle / turn_ended

### Story 4：保留每个 agent 的任务上下文

用户打开任务面板时，可以看到每个 agent 最近的事件：

- 当前任务
- 最近动作
- 最近命令摘要
- 测试是否通过
- 产物路径
- 下一步

## 7. 信息架构

### 7.1 桌宠默认态

默认只显示：

- Nono 主体
- 底部状态栏
- 必要气泡

默认不显示大型 dashboard。

### 7.2 托盘入口

Windows 托盘菜单提供：

- 显示 / 隐藏 Nono
- 打开 Multiagent 面板
- 打开设置
- 运行演示
- 退出

### 7.3 Multiagent 面板

面板包含：

- Agent 列表
- 每个 agent 的 active task
- 状态标签
- 最新动作
- 是否需要用户处理
- 最近事件日志

建议第一版信息结构：

```text
Multiagent Panel
├── Summary
│   ├── Active agents: 2
│   ├── Needs attention: 1
│   └── Completed today: N
├── Agent Cards
│   ├── Codex
│   │   ├── status
│   │   ├── current task
│   │   └── latest action
│   └── Claude Code
│       ├── status
│       ├── current task
│       └── latest action
└── Event Timeline
```

## 8. 统一事件协议扩展

现有 envelope 保持：

```json
{
  "type": "command_running",
  "agent": "codex",
  "adapter": "codex-plugin-hooks",
  "sessionId": "...",
  "taskId": "...",
  "payload": {}
}
```

MVP 需要强化以下字段语义：

| 字段 | 说明 |
| --- | --- |
| agent | `codex` / `claude-code` |
| adapter | 具体接入来源，例如 `codex-plugin-hooks` / `claude-code-adapter` |
| sessionId | agent 会话维度 |
| taskId | 任务维度 |
| payload.title | 任务标题 |
| payload.action | 用户可读的短动作 |
| payload.priority | `low` / `normal` / `attention` / `critical` |

## 9. 状态优先级

当多个 agent 同时发事件，桌宠默认显示最高优先级事件。

建议优先级：

| 优先级 | 事件 |
| --- | --- |
| P0 | permission_required |
| P1 | blocked / error |
| P2 | completed |
| P3 | test_running / command_running / file_editing |
| P4 | file_reading / task_start / plan_ready |
| P5 | turn_ended / idle |

## 10. Claude Code Adapter 初步方向

Claude Code adapter 应尽量遵守和 Codex adapter 一样的原则：

- 不让模型主动输出 HTTP 请求
- 不消耗额外 token 汇报状态
- 优先找 hook / lifecycle / notification / wrapper 机制
- 只发送结构化摘要，不发送 prompt / 源码正文 / token
- 桌宠没开时静默失败

第一步调研：

- Claude Code 是否有 hooks
- 是否有 tool use lifecycle
- 是否有 notification command
- 是否有 session log 可安全 tail
- 是否能通过 wrapper 捕获命令开始 / 结束

## 11. MVP 验收标准

MVP 完成时应满足：

1. Codex 和 Claude Code 都能通过 adapter 向 SuperNoNo 发事件。
2. 桌宠能区分 agent 来源。
3. Multiagent 面板能显示至少两个 agent card。
4. permission_required / blocked 能被优先展示。
5. 普通 command_running 不会覆盖更高优先级提醒。
6. 不发送敏感正文、源码、token。
7. 任一 agent 未运行时不影响另一个 agent。
8. 桌宠没开时 adapter 不阻塞 agent。

## 12. 里程碑

### M1：Multiagent State Store

- 在 renderer 维护 agent/task 维度状态
- 支持多个 `agent + sessionId + taskId`
- 保留全局最高优先级 current focus

### M2：Multiagent Panel

- 新增托盘打开的 Multiagent 面板
- 显示 Codex / Claude Code agent cards
- 显示最近事件 timeline

### M3：Claude Code Adapter 调研

- 查证 Claude Code 可用 hook/lifecycle
- 写 `docs/claude-code-adapter-plan.md`
- 不做伪集成

### M4：Claude Code Adapter MVP

- 实现最小可用事件转发
- 至少支持 task_start / command_running / completed 或 turn_ended 等粗粒度事件

### M5：Attention Policy

- 实现多 agent 事件优先级
- 控制气泡节流
- 避免多个 agent 同时刷屏

## 13. 风险

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| Claude Code 没有稳定 hook | 可能只能粗粒度接入 | 先做 adapter 调研，不伪造细粒度事件 |
| 多 agent 事件过多 | 桌宠刷屏 | 做 priority + throttle |
| 敏感信息泄露 | 命令 / 文件 / prompt 可能包含隐私 | 只发摘要，强脱敏 |
| UI 重新变大 | 面板过重挡桌面 | 默认宠物保持小巧，面板只从托盘打开 |
| adapter 互相影响 | 一个 agent 出错拖慢另一个 | sender 静默失败，状态隔离 |

## 14. 下一步

建议下一步从 M1 开始：

1. 设计 Multiagent State Store 数据结构。
2. 保持现有单 agent UI 不破坏。
3. 在 Multiagent Panel 中先显示 Codex card。
4. 再接 Claude Code adapter 调研。

