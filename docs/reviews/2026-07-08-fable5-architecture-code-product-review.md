# SuperNoNo / Multiagent Work Assistant 整体评审（Fable 5）

- 日期：2026-07-08
- 评审范围：`multiagent-work-assistant`（main @ `34fc275`，Phase 5.0 完成态）+ `codex-task-pet`（v2 分支，显示层）
- 评审方式：全部 orchestrator 代码与 Python planner 通读；8 套 fixture 测试本机实测（7 套 ALL PASS，brain 测试用 `SN_PYTHON` 指向 codex-runtime Python 后 ALL PASS）；docs 全量扫描（无乱码；acceptance 文档带 BOM，无害）
- 结论性质：观点直接，findings 按严重度排序，bug 给复现路径

---

## 1. Executive Summary

**这套系统的工程纪律是罕见的好，但产品此刻站在一个危险的拐点上。**

好的一面：从 Phase 2 到 Phase 5，每一层都有真实验证垫底（真实 Codex/Claude hooks、真实双 agent 并发、真实安装-卸载运维链路），安全边界（不读 prompt/transcript/source/diff/tool output）在**每一层都有 fixture 级别的泄漏自检**，且从未被突破。仓库边界执行得极干净——Phase 3-5 全程 pet 仓库零提交。Phase 5 的 Python spike 得出了正确的克制结论（现在不值得 Python 化）。

危险的一面：**能力在跑赢验证。** Phase 3.6 的真实使用验收只拿到 "partial pass, ready for review"，而在这个问题（"你会在真实工作日自愿再用一遍吗？"）没有被诚实回答之前，又叠了 3.7、3.8、4.x、5.0 五层能力。现在一轮完整流程约需 **12 条 CLI 命令 + 2 次手动复制 prompt + 2 次手动 link**——对单人用户，协调开销很可能已经超过被协调的工作本身。工具的核心假设仍未被证实。

另外发现**一个真实产品 bug（C1）**：assistant 的决策提醒发到桌宠后永远不会解除，宠物会被锁死在"等待授权"并持续闪烁——这恰好出现在整个产品最想擦亮的那条链路（决策提醒）上，而且现有 55+ 项 fixture 断言全部没有覆盖到它，因为没有任何测试跨越 orchestrator→pet 的状态机边界。

**Phase 6 的答案不是 LLM planner，是"让这套东西在真实工作日里活下来"**：修掉 C1、把 12 条命令压到 ≤6、半自动 link、relay 常驻化，然后用 2-3 个真实任务逼出诚实的 go/no-go。详见 §7。

---

## 2. Architecture Findings（按严重度）

### 判断题先回答

- **两仓库边界清晰吗？——清晰，且执行到位。** pet 只显示（面板 focus/pin 是显示层交互），brain 只聚合。检验标准：Phase 3-5 期间 pet 零提交；assistant 通道以普通 agent 身份接入，协议零变更。这是全项目最成功的架构决策。
- **Node / Python 分层合理吗？——合理，且 Phase 4.5/5 的结论正确。** Node 守住 hooks/relay/CLI 热路径（低延迟、零依赖），Python 只拿到一个 stdin/stdout JSON 窄槽，metadata-only，不进热路径。`brain-python/planner.py` 本身只是模板打印机，它的真正产出是**边界验证 + "现在不值得引入 LLM/Python 生态"的决策**——花小钱买清晰，值。不要在这条线上继续投入（见 §5）。
- **协议→relay→store→prompt pack→Python brain 的链条可持续吗？——机器环节可持续，人肉环节不可持续。** 协议稳定、relay 逐字节透明有测试背书、store 有损坏保护、prompt pack 是纯文本、Python 边界窄。链条上真正的弱点是三处**必须靠人记住**的环节：开 relay、给 agent 环境设 `SUPERNONO_BRIDGE_PORT`、手动 link run。这三处是所有脆弱点的根源。

### 最脆弱的 5 个点

| # | 脆弱点 | 说明 |
| --- | --- | --- |
| A1 | **relay 单点 + 环境漂移**（`orchestrator/relay.js`） | adapter 指向 4175 后，relay 没开 = 事件既进不了 brain 也进不了 pet，整条链路静默变黑。env 变量要在每个启动 agent 的 shell 里手动设置，换终端/重启即漂移。目前无常驻方案、无自愈、adapter 无 fallback。health-check 能诊断，但要人主动跑 |
| A2 | **事件归属全靠人工 link**（`orchestrator/work-store.js`） | 每个 agent 会话生成一个 AgentRun，runs 全局累积、永不清理、跨 session 不隔离。用一周后 `status` 的 unassigned 列表和 summary 的 run 计数会淹没在历史噪音里。摩擦随使用量线性增长——这是产品假设最大的敌人 |
| A3 | **assistant 通道只发了半个状态机**（`orchestrator/phase4.js`） | 协议事件是有生命周期的（permission_required 需要 permission_resolved 来关闭），但 orchestrator 只管发不管收尾 → 直接产出 bug C1。凡是向 pet 发"attention 类"事件的代码，都必须同时拥有解除路径，这应该成为一条架构纪律 |
| A4 | **双进程单文件竞态**（relay ingest vs CLI，`work-store.js`） | read-modify-write 无锁。事件 burst 期间执行 CLI link/done，写入可能被 relay 的 stale state 覆盖。人类尺度下概率低，但一旦发生就是"我明明 link 过"的信任破坏 |
| A5 | **Python 发现链脆弱**（`orchestrator/brain.js` + 文档） | 文档推荐的 `SN_PYTHON` 指向 `C:\Users\1\.cache\codex-runtimes\...`——Codex 私有 runtime，Codex 更新/清缓存即失效。裸 `python` 候选在 Windows 可能命中 Microsoft Store stub（能被 exit code 兜住，但报错信息会令人困惑） |

---

## 3. Code Findings（按严重度）

### C1（P1，真实 bug）：assistant 决策提醒在 pet 端永不解除

- 位置：`orchestrator/phase4.js`（`sendAssistantDecisionBrief`，发送 `type:"permission_required"`、`agent:"assistant"`、`sessionId:"workbench"`）+ `orchestrator/work.js`（`decision resolve` 分支只调 `store.resolveDecision`，**从不向 pet 发任何解除事件**）。
- 后果：pet 端 `assistant:workbench` 条目进入 `waiting_approval`（attention rank 50）后**永久驻留**：宠物焦点被锁死在 assistant、窗口持续闪烁（`requireAttention`）、Phase 2.4 的 pin 让位机制"让位后永不回归"。唯一的意外解药是之后恰好跑 `summary --notify`（completed 事件重置 flags）或重启 pet。
- 复现：`work.js decision brief dr1 --notify` → pet 显示等待授权 → `work.js decision resolve dr1 accept` → pet **仍然**等待授权、持续闪烁。
- 修复方向（小）：`decision resolve` 成功后向同 sessionId 发 `permission_resolved`（approved 按 resolution 映射）；`decision brief --notify` 与 resolve 共享同一发送工具函数。
- 教训：8 套测试 55+ 断言全绿却漏掉它，因为**没有任何测试跨越 orchestrator→pet 的状态机边界**。Phase 6 应补一个"assistant 通道生命周期"集成测试（fake pet 侧 agentStore 断言）。

### C2（P1，遗留升级）：pet bridge 的注入链仍开放，且暴露面变大了

- 位置：`codex-task-pet/electron/main.js`（4174 无 Origin 校验；`sn:open-path` 无扩展名/存在性防护）——即 v1.0 评审的 T0.2，至今未做。
- 变化：relay 有 Origin 403，但 **pet 直连路径（默认模式）仍完全开放**；且现在 summary/brief 以 artifact 路径形式频繁出现在 pet 上，"打开产物"按钮的使用习惯正在被养成——恶意网页伪造 completed+可执行 artifact 的社工链路比 v1.0 时期更值钱了。
- 修复仍是那 ~30 行（拒 Origin 头 + openPath 扩展名黑名单/改 reveal）。这是 pet 仓库在 Phase 6 里唯一值得的提交。

### C3-C9（P2/P3）

| # | 级别 | 位置 | 问题 |
| --- | --- | --- | --- |
| C3 | P2 | `orchestrator/summary.js`（renderSummary） | Snapshot 的 `Runs`/`Decisions` 计数是**全局**的，而 `Items` 按当前 session 过滤——多 session 之后 handoff 首屏数字互相打架，误导交接 |
| C4 | P2 | `orchestrator/work.js` + `summary.js` + `phase4.js` | notify 默认端口链 `SN_SUMMARY_NOTIFY_PORT→SN_BRAIN_PORT→SUPERNONO_BRIDGE_PORT→4175`：直连模式（不开 relay，宣称的合法模式）下 notify 必失败只 WARN。应探测 4175 失败后回落 4174，或默认跟随 adapter 同款变量 |
| C5 | P2 | `orchestrator/brain.js`（runPythonPlanner） | JSON parse 失败直接 throw，而 spawn/exit 失败会 continue 试下一候选——语义不一致；一个返回 0 但输出非 JSON 的坏 python wrapper 会中止整个候选链 |
| C6 | P2 | `orchestrator/work-store.js` + `.supernono/` | runs / plans / prompts / briefs / summaries 全部只增不减，无归档/清理命令。设计红线（state>1MB=产品做错）会先被 runs 累积撞破 |
| C7 | P3 | `orchestrator/phase4.js`（writePromptPack） | `user-checklist.md` 与 `README.md` 内容逐字相同，纯冗余 |
| C8 | P3 | 同 A4 | store 竞态无测试覆盖 |
| C9 | P3 | `docs/acceptance/*.md` | 文件头带 BOM；无功能影响，工具链敏感时会咬人 |

### 四个专项的总评

- **安全边界：这是全项目最强的一面。** 逐层核过：adapter 脱敏有泄漏 fixture、relay 日志恰为 `{at,envelope,forward}` 且实测无 header 泄漏、store 只存 envelope 元数据、summary/brief/prompt 全部 metadata-only 且各有排除断言、Python 输入是 `compactStatus` 白名单字段。**没有发现任何新的泄漏路径。** 唯一提醒：title/goal 是用户自由输入并会进入 prompt/summary/Python——文档加一句"别把密钥写进标题"。
- **Windows 稳定性：**node 双表面实测可解析（已闭环）；Codex plugin 的 `hooks.json` 绝对路径（老 S1）仍未产品化；settings merge 有备份+health-check（Phase 2.5 做得好）；Python 路径是当前最弱项（A5）。
- **错误处理：优秀。** adapter <50ms 静默失败、relay 先应答后转发、store 损坏拒绝覆盖且 relay 不受影响（集成测试实测）、Python 失败结构化报错不伤 hooks。缺口：relay 进程死后无自愈（A1）。
- **测试覆盖：**fixture 层面覆盖了关键风险面（透明性/泄漏/损坏/pet-down），本次实测 8 套全绿。真实缺口按重要度：① orchestrator→pet 的**跨系统状态机行为**零覆盖（C1 所在盲区）；② Phase 4/5 的真实使用验收未执行（3.6 仅 partial pass）；③ 并发竞态无测试。

---

## 4. Documentation Findings（按严重度）

| # | 级别 | 问题 | 位置 |
| --- | --- | --- | --- |
| D1 | P1 | **入口文档自相矛盾**：`next-task-plan.md` 头部写"当前进行 Phase 3.0"，§0 写 Phase 3.3 当前，§5 写"当前阶段是 Phase 2.3"，而 roadmap 已写到 Phase 5.0 完成。这份文档已 1000+ 行历史堆积，"Compact 后先看这里"恰恰最不可信——对以此为第一入口的新 agent 是主动误导 | `docs/planning/next-task-plan.md` |
| D2 | P1 | 根 README 停在 2026-07-03（"当前第一阶段先做 Claude Code hooks probe"），落后现实五个 Phase | `README.md` |
| D3 | P2 | 状态三处冗余（roadmap / next-task-plan / 各 phase plan 的 implementation record），每次收尾要同步三处，已经漂移。需要指定唯一 SoT | 同上 |
| D4 | P2 | `orchestrator/README.md` 中英混排、按 Phase 追加成流水账（"Brain Relay (Phase 3.1)" 的标题下藏着 3.2-3.8 的全部用法），应按功能重组为使用手册 | `orchestrator/README.md` |
| D5 | P3 | 归档候选：`docs/handoff/2026-07-03-*.md`（历史快照）、`docs/strategy/*`（历史）、`docs/claude-code/claude-code-hooks-probe-plan.md`（结论已被吸收）、`docs/architecture/signal-protocol-v0.2-plan.md`（未实施且部分被现实绕过——assistant agent 已上线而 v0.2 从未落地，文档声称的"权威规范迁移"没发生） | `docs/` |

**能让另一个 agent 接手吗？——勉强能，但要先穿过 D1/D2 的误导。** 靠 `roadmap.md` + 三份 phase plan + `orchestrator/README.md` 可以重建全貌。**Phase 6 开工前值得花 0.5 天整理**（这不是洁癖：你的工作流就是频繁把仓库交给新 agent，入口文档的误导每次都在烧真实 token）。

**建议的主入口结构**：`README.md`（重写，现状+5 分钟上手）→ `docs/roadmap.md`（唯一状态 SoT，其他文档只链接不复述）→ `orchestrator/README.md`（按功能重组的使用手册）→ 其余 phase 文档移入 `docs/archive/` 或明确标注"历史记录，勿作为现状"。

---

## 5. Product Findings

### 演进成立吗？——成立，而且路径罕见地干净

桌宠 demo → 真实 Codex 接入 → 双 agent 可见性 → 记账 → 半自动 brain，每一步都有真实验证垫底，没有一步是 PPT 架构。北极星（"把用户从轮询窗口变成被正确的事情打断"）从 v1.0 评审至今没有漂移。这个演进的独特资产是：**一套被两个真实 agent 验证过的、隐私边界严格的本地事件基础设施**——这东西社区里不多见。

### Phase 4 / Phase 5 是价值还是工程堆叠？——是"有纪律的堆叠"，纪律不能替代验证

- 纪律好的部分：没有提前上 LLM、没有自动 spawn、每层有测试、边界没破。Phase 5 用 138 行 Python 买到了"现在不值得 Python 化"的清晰结论，这是**正确的花钱方式**。
- 堆叠的部分：**3.6 的真实使用验收只有 partial pass**，"你会自愿再用一遍吗"没有答案，其上又建了五层。Phase 4 的 plan draft 是模板（Codex build + Claude review + 一个 gate）——它生成的"计划"其实是 `workflow review-loop` 换了个仪式感更强的外壳；Phase 5 的 planner 输出同一个模板。**这两层的用户可见增量 ≈ 0**，增量全在架构验证上。
- 量化摩擦：一轮完整流程 = `relay` + `brain plan` + `plan accept` + `prompt pack` + 2×复制 prompt + `status` + 2×`item link` + `decision brief` + `decision resolve` + 2×`item done` + `summary --notify` ≈ **12 条命令 + 4 次人工动作**。被协调的工作（让两个 agent 各干一件事）本身只需要 2 次粘贴。**当前版本的协调税率太高了。**

### 优先级裁决（A-E 不平均用力）

**做 A+D（合并为一件事：真实闭环 + 摩擦削减）。明确不做 B、C、E。**

- **B（LLM planner）否**：瓶颈不是计划的聪明程度——模板计划从来没有被真实使用抱怨过"不够好"，因为它根本还没被真实用过几轮。给一个没人走的流程换更聪明的导航是经典错配。
- **C（evaluator）否**：没有真实使用数据，evaluator 评什么？先有 10 次真实 review-loop 的记录，再谈评估。
- **E/F（UI 工作台）否**：CLI 流程还没收敛到值得固化的形态，UI 化只会把错误的流程焊死，并诱惑你重新滑回 UI 打磨（v1.0 的老病）。

---

## 6. Risk Register

| # | 风险 | 级别 | 位置 | 缓解 |
| --- | --- | --- | --- | --- |
| R1 | assistant 决策提醒永不解除，pet 被锁死在等待授权 | **P1（bug）** | `orchestrator/phase4.js` + `work.js` | Phase 6 T1 修复 + 跨系统状态机测试 |
| R2 | pet bridge 注入链（无 Origin 校验 + openPath 无防护），artifact 使用习惯放大暴露面 | **P1** | `codex-task-pet/electron/main.js` | Phase 6 T6（~30 行，pet 仓库唯一提交） |
| R3 | relay 单点 + env 漂移导致事件静默丢失 | **P1** | 运维层 | relay 常驻化 + `work status` 内嵌链路健康显示（T3） |
| R4 | 摩擦税率过高 → 产品假设未被证实 → 后续投入全部悬空 | **P1（产品）** | 全局 | Phase 6 主目标（§7） |
| R5 | runs/产物文件无限累积，一周后 status/summary 淹没在噪音里 | P2 | `work-store.js` / `.supernono/` | `work archive`（随 session close 归档 runs）+ 产物目录说明 |
| R6 | store 双进程竞态 | P2 | `work-store.js` | 记录在案；恶化时收敛单写者（CLI 经 relay HTTP），现在不做 |
| R7 | Python 路径依赖 codex 私有 runtime | P2 | `orchestrator/brain.js` + docs | 文档改为推荐官方 Python 安装；`brain check` 输出候选诊断 |
| R8 | 文档入口误导新 agent | P2 | `docs/planning/next-task-plan.md`、`README.md` | Phase 6 T7（0.5 天整理） |

---

## 7. Recommended Phase 6 Plan

**Phase 6 最应该解决的问题：不是让 brain 更聪明，而是让这套系统在真实工作日里活下来、并诚实地度量它值不值。**

命名：**Phase 6A' —— 真实闭环 Hardening + 摩擦削减**（候选 6A+6B 合并；6C/6D/6E 部分吸收、其余推迟；6F 拒绝）。

目标（可证伪）：

1. 用它跑 **2-3 个真实任务**（不是演示任务），每次记录摩擦点。
2. 单任务命令数从 ~12 压到 **≤6**。
3. 决策提醒在 pet 上**正确出现且正确消失**。
4. 结束时回答 go/no-go："下周没有人逼你，你还会用它吗？"——如果 no，Phase 7 是砍功能而不是加功能。

不做什么：LLM 调用、自动 spawn、自动授权、UI、数据库、协议 v0.2 落地（除非 auto-link 被证明必须要 `payload.project`——先用无协议方案）。

---

## 8. Concrete Task List（可直接下发）

| # | 任务 | 涉及文件 | 验收 |
| --- | --- | --- | --- |
| T1 | **修 C1**：`decision resolve` 后向 pet 发 `permission_resolved`（assistant/workbench 同 sessionId）；brief 与 resolve 共用发送函数；顺手统一 notify 端口回落逻辑（C4：4175 失败回落 4174） | `orchestrator/work.js`、`phase4.js`、`summary.js` | 复现路径不再复现：resolve 后 pet 的 assistant 卡片回到 idle；新增跨系统测试（fake pet 断言生命周期闭合） |
| T2 | **半自动 link**：`work link --auto`——unassigned run 与 assigned item 按 agent 唯一匹配时自动建议/执行；`status` 对可自动匹配的 run 显示一行可复制命令 | `orchestrator/work-store.js`、`work.js` | 双 agent 真实一轮，手动 link 次数 0-1 次 |
| T3 | **链路健康内嵌**：`work status` 头部显示 relay/pet 在线状态（复用 health-check 探测）；relay 启动时检测端口占用给出清晰提示 | `orchestrator/work.js`、`relay.js`、`health-check.js` | 链路黑掉时，用户在下一次 `status` 即看到，而不是事后发现事件丢了 |
| T4 | **命令合并**：`work go "<标题>"` = plan draft + accept + prompt pack 一步（沿用模板 planner）；`work done <itemId> --resolve <drId>` 合并常见收尾 | `orchestrator/work.js` | 完整一轮 ≤6 条命令（用真实任务计数） |
| T5 | **runs 归档**：`session close` 时把该时段 runs 标记 archived，`status`/`summary` 默认隐藏 archived | `orchestrator/work-store.js`、`summary.js` | 连续使用一周后 status 仍然一屏可读 |
| T6 | **pet T0.2 补课**（pet 仓库唯一提交）：bridge 拒 Origin 头；`sn:open-path` 扩展名黑名单+不存在改 reveal | `codex-task-pet/electron/main.js` | 浏览器 POST 4174 被 403；恶意 .exe artifact 点击不执行 |
| T7 | **文档整理（0.5 天）**：重写根 README（现状+5 分钟上手）；`next-task-plan.md` 砍成入口页，历史移 `docs/archive/`；指定 roadmap 为唯一状态 SoT；`orchestrator/README.md` 按功能重组 | `README.md`、`docs/` | 新开一个 agent 只给根 README，能在 10 分钟内说清系统现状并跑通一轮 demo |
| T8 | **真实验收 ×2-3 并记录**：严格按 3.6 checklist，每次产出摩擦点清单；结束回答 go/no-go | `docs/acceptance/` 新增记录 | go/no-go 有书面答案和依据 |

建议顺序：T1 → T3 → T4 → T2 → T5 →（并行 T6、T7）→ T8 收口。

## 9. "Do Not Do Yet" List

1. **LLM-backed planner（6C）**——摩擦没解决前，聪明的计划只是更贵的模板。重新考虑的触发条件：T8 go 之后、且真实使用中出现"模板计划确实不够用"的记录 ≥3 次。
2. **Evaluator / reviewer（6D）**——先攒 10 次真实 review-loop 数据。
3. **UI 工作台 / pet workbench 集成（6F）**——CLI 流程收敛之前不固化；且警惕滑回 UI 打磨。
4. **协议 v0.2 落地**——除非 T2 的无协议 auto-link 被证明不够。
5. **permission_required / error / testPass 接入 live hooks**——语义门条件未变：仍无结构化 payload 证据。
6. **数据库 / 云端 / 账号 / 自动 spawn / 自动授权**——铁律不变。
7. **Codex adapter 外部化、generic-cli adapter、更多 agent**——双 agent 的价值先证实。
8. **pet 端任何新功能**（除 T6 安全补课）——冻结令继续有效。
