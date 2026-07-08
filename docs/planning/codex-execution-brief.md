# Codex 执行简报（Phase 6 执行队列）

- 日期：2026-07-08
- 角色分工（长期有效）：
  - **Codex（你）= 执行者**：按本简报的任务队列逐个实现，不自行扩大范围。
  - **Fable / Claude Code = 审核者 + 产品负责人**：review 每个任务的 diff，把握产品设计与实现取舍。你完成任务后不需要自我评审产品方向，把判断题留给 review。
  - **用户 = 老板**：拍板、验收、决定顺序调整。
- 依据文档（改动前必读，遇到冲突以这两份为准）：
  - `docs/reviews/2026-07-08-fable5-architecture-code-product-review.md`（§8 任务表 = 本队列的出处与理由）
  - `docs/strategy/2026-07-08-manager-product-plan.md`（产品方向；**其中 Phase 7 的内容现在不做**）

## 永久红线（每个任务都适用，违反 = 返工）

1. 不读、不记录、不发送 prompt / transcript / 源码正文 / diff / tool output / token / secret——只处理 signal envelope 元数据和用户手动输入。
2. 不 spawn 任何 agent，不调用任何 LLM API（Phase 7 之前的纪律）。
3. 不改 `codex-task-pet` 仓库（唯一例外：任务 T6，且只改列出的文件）。
4. 不新增 npm 依赖，只用 Node 内置模块。
5. 不改 signal protocol 的事件语义；relay 的字节级透明转发不可破坏。
6. `.supernono/`、`probe-authcheck.txt`、`scratch-probe.txt` 永不提交。
7. 拿不准就停下来问用户，不要替用户做产品决定。

## 工作纪律

- **一个任务 = 一个会话 = 一个 commit**（大任务可拆少量 commits，message 用 `T<编号>: <动作>` 开头）。
- 每个任务必须带/更新 fixture 测试；提交前必须全绿：
  ```cmd
  node --check orchestrator\*.js
  node orchestrator\relay-fixture-test.js
  node orchestrator\work-store-fixture-test.js
  node orchestrator\relay-work-integration-test.js
  node orchestrator\summary-fixture-test.js
  node orchestrator\prompt-fixture-test.js
  node orchestrator\workflow-fixture-test.js
  node orchestrator\phase4-fixture-test.js
  node orchestrator\workbench-signal-fixture-test.js
  ```
  （brain-fixture-test 需要 `SN_PYTHON`，能跑则跑。）
- 完成后在回复里输出**交付报告**（这是 review 的输入，缺项算未完成）：
  1. 改了哪些文件、为什么；2. 新增/更新了哪些测试断言；3. 全套测试结果；4. 已知取舍与风险；5. 建议 review 重点看哪里。

## 任务队列（按顺序做，做完一个停下等 review 结论）

### T0：提交当前工作树的 C1 修复（收尾，先做）

- 现状：工作树里有已完成并验证的 decision 生命周期修复（用户 + Fable）。
- 动作：确认全套测试绿后提交这些文件：`orchestrator/work.js`、`phase4.js`、`summary.js`、`brain.js`、`brain-fixture-test.js`、`workbench-signal.js`、`workbench-signal-fixture-test.js`、`docs/reviews/`、`docs/strategy/2026-07-08-manager-product-plan.md`、`docs/planning/codex-execution-brief.md`（本文件）。
- commit message：`T0: Close assistant decision lifecycle and add manager product plan`
- 不要改任何代码内容——这是纯提交任务。

### T3：链路健康内嵌 status

- 目标：链路黑掉时用户在下一次 `work.js status` 就能看到，而不是事后发现事件丢了。
- 动作：`work.js status` 头部加一行 relay/pet 在线状态（探测 4175/4174 的 `/health`，超时 ≤500ms，探测失败不影响 status 其余输出）；`relay.js` 启动时若端口被占给出清晰报错（含"可能已有 relay 在跑"提示）。
- 涉及：`orchestrator/work.js`、`relay.js`、复用 `health-check.js` 的探测逻辑（可抽小函数共享）。
- 验收：pet/relay 各自开、关的四种组合下 status 首行如实显示；新增 fixture 断言。

### T4：命令合并 `work go`

- 目标：单任务命令数从 ~12 压到 ≤6。
- 动作：`work.js go "<标题>" [--goal ...]` = plan draft + plan accept + prompt pack 一步完成（沿用模板 planner，输出各文件路径）；`work.js item done <itemId> --resolve <drId>` 合并常见收尾（done + decision resolve，resolve 沿用现有 notify 行为）。
- 涉及：`orchestrator/work.js`（组合已有模块，不复制逻辑）。
- 验收：`go` 之后 `.supernono/plans` 与 `.supernono/prompts/<ws>/` 齐备且 plan JSON 已标记 accepted；fixture 覆盖组合命令；旧命令全部原样可用。

### T2：半自动 link

- 目标：双 agent 真实一轮，手动 link 次数降到 0-1 次。
- 动作：`work.js link --auto`——当某个 unassigned run 的 agent 与**恰好一个**未 done 且 assignedAgent 相同的 item 匹配时自动 link 并打印结果；有歧义（0 个或多个候选）时列出候选与可复制命令，不猜。`status` 对可自动匹配的 run 显示一行提示。
- 涉及：`orchestrator/work-store.js`（匹配函数）、`work.js`。
- 验收：fixture 覆盖唯一匹配 / 多候选歧义 / 无候选三种情形；歧义时绝不自动动手。

### T5：runs 归档

- 目标：连续使用一周后 status/summary 仍一屏可读。
- 动作：`session close` 时把 workItemId 属于该 session 的 runs 与该时段 unassigned runs 标记 `archived: true`；`status`/`summary` 默认隐藏 archived（`status --all` 显示）；ingestEvent 遇到 archived run 收到新事件时自动解除归档。
- 涉及：`orchestrator/work-store.js`、`work.js`、`summary.js`。
- 验收：fixture 覆盖归档/隐藏/新事件唤醒；`--all` 可见全量。

### T6：pet 仓库安全补课（唯一的 pet 改动，单独 commit 到 v2 分支）

- 目标：关闭 v1.0 评审遗留的注入链。
- 动作：`codex-task-pet/electron/main.js` 两处——bridge `/signal` 拒绝带 `Origin` 头的请求（403，参考 brain 仓库 `orchestrator/relay.js` 的同款实现）；`sn:open-path` 对 `.exe/.bat/.cmd/.ps1/.scr/.lnk` 及不存在的路径不调用 `openPath`（改 `showItemInFolder` 或忽略）。
- 红线：pet 仓库只许改这一个文件；不碰 renderer/Live2D/stateEngine。
- 验收：`curl` 带 Origin 头 POST 4174 得 403；现有 manual-multiagent-test 9/9 不回归；恶意扩展名 artifact 点击不执行。

### T7：文档整理（0.5 天，纯文档 commit）

- 动作：重写根 `README.md`（现状 + 5 分钟上手）；`docs/planning/next-task-plan.md` 砍成一页入口（历史段落移 `docs/archive/`，原文件内容不删只搬家）；`docs/roadmap.md` 指定为唯一状态 SoT 并补 Phase 6 条目；`orchestrator/README.md` 按功能重组（relay / work store / summary / prompt / brain 各一节）。
- 红线：只动文档；新文件 UTF-8 无 BOM；不改任何声称的事实（不确定的事实标注待验证而不是编造）。
- 验收：新开一个 agent 只读根 README 能在 10 分钟内复述系统现状并跑通一轮 demo 命令。

### 队列之外

- **T8（真实使用验收）是用户的任务**，你不做。
- **Phase 7（MCP server / dispatch / 报告协议）现在不做**——它的开工许可是 T8 的书面 go + Fable 的设计 review。看到产品规划文档里的这些内容，当作"将来"，不是"现在"。
