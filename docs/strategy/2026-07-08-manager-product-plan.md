# 产品规划：把"用户当老板"的 Multiagent 桌面助理做到实际、好用、落地

- 日期：2026-07-08
- 性质：产品战略文档（承接同日的 [Fable 5 整体评审](../reviews/2026-07-08-fable5-architecture-code-product-review.md)，不推翻其 Phase 6 计划——Phase 6 是本文的地基）
- 一句话产品定义：**一个让单人开发者以"管理者动作"驱动多个 coding agent 的本地系统：交办、知情、拍板，三个动作完成一件事。**

---

## 1. 北极星的升级

v1.0 至今的北极星是"把用户从轮询窗口变成被正确的事情打断"。它仍然成立，但只覆盖"知情"。当产品要成为管理者抽象时，北极星升级为：

> **每委托一件任务，用户的动作数 ≤ 3：一次交办、一次拍板、一次验收。**

这个数字是可测量的裁决标准。当前实测是 ~12 条命令 + 4 次人工动作——差 5 倍。本文的全部内容都是在回答"这 5 倍差距怎么消掉"。

## 2. "老板抽象"为什么容易失败：微观管理模拟器

老板隐喻的经典死法：系统把"管理"实现成**填表**。用户要建 session、建 item、assign、复制 prompt、link run、resolve、done——比亲自写代码还累。这不是管理，是给机器当秘书。

真实世界的老板之所以轻松，是因为下属做了四件事：

| 下属做的事 | 当前系统里谁在做 |
| --- | --- |
| 接到一句话就能开工 | **用户**（手动复制 prompt 到每个 agent） |
| 主动汇报进展 | 一半自动（hooks 事件流），一半用户（手动 link 归属） |
| 异常才上报、平时不打扰 | 已解决（attention policy + 桌宠） |
| 交付时附上报告 | **没人做**（decision brief 只有元数据，没有证据） |

**判断：管理成本必须低于亲自干的成本，抽象才成立。** 差距不在"调度不够智能"，而在上表左列的第 1、2、4 行还压在用户身上。

## 3. 管理者三层能力的现状盘点

| 能力 | 含义 | 现状完成度 | 缺口 |
| --- | --- | --- | --- |
| **知情 Awareness** | 谁在干活、卡在哪、什么时候需要我 | ~70% | 视图仍是"会话级"（codex:sess-abc 在 building），老板要的是"任务级"（功能 X 到哪了）——依赖 link 归属 |
| **决断 Decide** | 需要拍板时被正确打断，拍完即走 | ~60% | 提醒链路刚闭环（本日修复）；缺**证据**——brief 里只有事件计数，没有 agent 的交付报告 |
| **委托 Delegate** | 一句话交办，任务自己跑起来 | ~20% | 计划是模板、prompt 要人肉复制、agent 要人肉启动——**这是最大缺口，也是杠杆点** |

## 4. 三个关键判断

### 判断一：受控 spawn 不可回避，且它一石二鸟

"不 spawn agent"是 Phase 2-5 的**阶段纪律**（先证明观测层），不是永久产品边界。老板不会亲自把任务书抄送到每个下属桌上。技术可行性已经顺带验证过：Claude Code 有 headless CLI（`claude -p`，probe 阶段我们自己用它触发过真实 hooks），Codex 有 `codex exec`。

关键推论：**spawn 之后，link 摩擦自动消解**——orchestrator 启动 agent 时就拿到了 session 归属，AgentRun 出生即挂在 WorkItem 上。评审里的 T2（auto-link 启发式）只是过渡方案；dispatch 才是根治：它同时消灭"人肉复制 prompt"和"人肉 link"两项最大摩擦。

安全形态：**supervised dispatch**——`work dispatch wi1` 展示将要执行的完整命令与 prompt，用户确认后才 spawn；被 spawn 的 agent 禁止再 spawn（无嵌套）；每次 dispatch 有超时与并发上限。确认门可以在 Phase 8 按任务类型分级放松，但第一版全部要确认。

### 判断二：老板的交互界面是对话，不是 CLI——把 orchestrator 做成 MCP server

用户已经整天活在 Claude Code / Codex 里。管理界面不需要新发明——**把 work.js 的能力封装成一个本地 MCP server**，用户对着自己手头的 Claude Code 说话：

> "把'实现深色模式'安排下去，Codex 写、Claude 审" → CC 调 `work_plan` + `work_dispatch`
> "现在几个任务什么状态？" → CC 调 `work_status`，用自然语言复述
> "dr1 我批了" → CC 调 `work_resolve`

这个形态有一个极优雅的推论：**Phase 6C（LLM planner）自动消解**。orchestrator 自己永远不需要调 LLM——计划的智能来自用户正在对话的那个 LLM（用户已经付费、上下文现成、还能追问）。Python brain 层继续保留为确定性工具箱；"聪明"是借来的，免费的。

CLI 不废弃：它是 MCP 工具的实现层和脚本化/调试入口。桌宠继续做 ambient 层——它从来就不该是操作界面。

### 判断三：拍板要有证据——agent 报告协议

老板批周报，看的是下属写的报告，不是键盘记录。当前 decision brief 只有事件计数，用户拍板前还得自己去翻 agent 会话——决策链路的价值被掏空了。

方案：**报告是 agent 的主动交付物，不是系统的窃听**。dispatch 生成的 prompt 里固定要求："完成后把最终报告写到 `.supernono/reports/<itemId>-report.md`（改了什么文件、跑了什么验证、风险、建议）"。orchestrator 只引用路径、永不读取内容（隐私铁律零破坏）；decision brief 链接报告；pet 的 artifact 按钮直达。用户拍板 = 读一份报告 + 一条命令（或一句话）。

## 5. 目标体验：一次委托的完整剧本（Phase 7 完成时）

```text
09:30 用户在 Claude Code 里说："把'导出功能加 CSV 支持'安排下去，老规矩。"
      → CC 通过 MCP 建 session/items/decision gate，展示 dispatch 预览
      → 用户："可以。"（动作 1：交办）
      → orchestrator spawn codex exec（build）；桌宠出现 codex 卡片，自动挂在 wi1

10:10 codex 的 turn_ended 到达且报告文件已写出 → orchestrator dispatch claude -p（review）
      桌宠切到 claude-code 卡片；用户全程没被打扰

10:40 桌宠闪烁："需要拍板：接受 review 结果吗？"
      → 用户点开 brief（链接着 codex 的实现报告 + claude 的 review 报告）
      → 在 CC 里说"批了"（动作 2：拍板）

10:42 orchestrator 收尾：items done、summary 写出、桌宠安静庆祝一次
      → 用户瞄一眼 handoff（动作 3：验收）
```

用户动作 = 3。中间每个环节今天都已存在或已验证可行，缺的只是把它们焊起来。

## 6. 产品形态：三件套，不做第四件

| 件 | 角色 | 状态 |
| --- | --- | --- |
| **桌宠**（codex-task-pet） | ambient 感知 + 打断入口。永远小、永远安静 | 冻结（除安全补课 T6） |
| **对话式管理**（MCP server，寄生于用户已有的 Claude Code/Codex） | 老板的嘴和耳朵 | Phase 7 新建 |
| **工件**（plan / brief / report / summary，全部 Markdown 文件） | 管理的纸面痕迹，可 grep、可归档、可交接 | 已有，补 report 协议 |

明确不做：独立 dashboard 应用、Web UI、云端。工件即界面的延伸——文件比窗口长寿。

## 7. 落地路线

### Phase 6（已定，原样执行）：真实闭环 + 摩擦削减

评审的 T1-T8 不变。它回答"手动环成立吗"，并交付 dispatch 依赖的地基（链路健康内嵌、runs 归档、命令合并）。**T8 的 go/no-go 是 Phase 7 的开工许可。**

### Phase 7：Manager MVP（判断一二三的落地）

- 目标：第 5 节剧本完整跑通一次真实任务。
- 交付物：
  1. **orchestrator MCP server**（`orchestrator/mcp-server.js`，stdio 传输，零新依赖或单薄依赖）：先暴露只读+记账工具（`work_status` / `work_plan_draft` / `work_plan_accept` / `work_decision_brief` / `work_decision_resolve` / `work_summary`），全部复用现有模块。
  2. **supervised dispatch**（`work dispatch <itemId>`）：生成 prompt → 展示完整命令 → 确认 → spawn（`claude -p` / `codex exec`，工作目录=目标项目）→ session 自动 link → 超时/退出码记账。MCP 版 `work_dispatch` 带同样的确认门（由对话中的用户确认）。
  3. **agent 报告协议**：prompt 模板加报告要求；`.supernono/reports/` 纳入 brief/summary 的 artifact 链。
- 不做：无确认 spawn、嵌套 spawn、并行 dispatch 编排（一次一个）、LLM 调用（智能借用户的 CC）。
- 验收：一个真实任务全程用户动作 ≤3；杀掉 orchestrator 不影响已 spawn 的 agent；报告缺失时 brief 明确说"无报告"而不是假装有。

### Phase 8：Policy & Trust（管理半径扩大）

- 分级授权：按任务 role/目录白名单定义哪些 dispatch 免确认；预算与并发上限；失败重试语义（retry 是新 run，不是覆盖）。
- 依赖链执行：`after: [pwi1]` 真正生效（前项 done + 报告存在 → 自动 dispatch 后项，仍在授权策略内）。
- 验收：一次"免确认白名单内"的两步链条全自动跑完，用户只拍板一次。

### Phase 9：Scale & Compound（复利）

- 第三 agent（generic-cli 转正）；workflow 模板从真实历史 session 中沉淀（"上次这么干成功了"→ 一键复用）；跨日 memory（哪类任务哪个 agent 干得好）。
- 到这里才重新评估：独立产品化、给别人用、以及是否需要更强的 planner。

## 8. 风险与红线

| 风险 | 应对 |
| --- | --- |
| spawn 的爆炸半径（权限、成本、失控） | 确认门默认全开；无嵌套 spawn；单任务超时+并发=1 起步；dispatch 记录完整命令行以便审计 |
| 隐私铁律被"报告"侵蚀 | 报告 = agent 主动写的交付物，orchestrator 只引用路径不读内容；铁律条文不变：不读 transcript/prompt/diff/tool output |
| MCP 形态让 orchestrator 变成"什么都能干"的口子 | MCP 工具白名单 = CLI 已有能力的镜像，不新增能力面；dispatch 类工具永远带确认 |
| 又一次能力跑赢验证 | Phase 7 开工的前置条件 = Phase 6 T8 的书面 go；Phase 8 前置 = Phase 7 剧本真实跑通 ≥3 次 |
| 桌宠重新膨胀 | 冻结令不变；pet 新增仅限 T6 安全补课 |

## 9. 一句话收束

这个产品的落地路径不是"造一个更聪明的调度器"，而是**把已验证的观测基础设施，接上三个缺失的管理动作：能派（dispatch）、能看证据（report）、能用嘴管（MCP）**——智能借用户手里的 LLM，信任用确认门换，摩擦用 spawn 附带的自动归属消掉。北极星从"少切窗口"升级为"每件事三个动作"，每个 Phase 都能用这个数字验收。
