# Roadmap

本文件是 `multiagent-work-assistant` 的状态 SoT。产品定义以 [docs/prd/multiagent-director-prd-v1.md](prd/multiagent-director-prd-v1.md) 为唯一源头。

## 当前状态（2026-07-09）

**产品已定案 = AI 编排总监。处于 V1 设计阶段,尚未开始 V1 编码。**

### v0 探索（2026-07,已归档到 `legacy/`）

一句话:验证了"能不能免 token 观测多个闭源 agent、并用一套 agent-neutral 协议聚合它们的工作状态"——能。

- **验证到、且沿用的资产**:Codex/CC 免 token hook 接入、agent-neutral 信号协议(14 事件、metadata-only)、"只传元数据"隐私边界、逐字节透明的事件中继(relay)。
- **被证伪 / 降级的**:CLI 记账当主 UX(摩擦太高)、桌宠当主角(降为 5% 的 ambient 点缀)。
- 产物:桌宠(在 `codex-task-pet`)+ 观测核心 + CLI 记账层 → 归入 `legacy/`,概念挖回,代码不再以它为主线。

### 定案（2026-07-09）

产品转向 director/编排。依据:[union-layer 定位](strategy/2026-07-09-union-layer-positioning.md)、[Fable5 评审](reviews/2026-07-08-fable5-architecture-code-product-review.md)。三条奠基决定见 [PRD 文末](prd/multiagent-director-prd-v1.md)。

## V1 路线（对齐 PRD）

| 里程碑 | 目标 | 门槛 / 备注 |
| --- | --- | --- |
| **V1.0 选角引擎(英雄)** | 抽象任务 → 拆解角色 → roster/配额感知 → 生成 A/B/C 团队方案供选/微调 | **下一步先出功能规格**,再编码 |
| **V1.1 无头派发** | `claude -p`/`codex exec` 拉起实例、派角色提示词、收产出;WorkBuddy/GLM 无头入口先 probe | probe-first,未确认前降级半自动 |
| **V1.2 监督-评估-返工闭环** | 总监观测产出、判定通过/打回/重派,直到需求验证 | **产品天花板所在**;先在有边界任务上证明靠谱 |
| **V1.3 护栏 + 逃生阀 + 交付** | 预算闸、隔离沙箱、不可逆动作门;卡住/超预算/没把握时弹回用户;成品 + 验收报告 | 护栏即产品 |
| **V1.4 主界面 + 桌宠(5%)** | 编排监控室(交办/选角/执行三态)+ 桌宠 ambient 点缀 | 桌宠明确从属 |

## 奠基决定（锁定）

1. 执行体 = 无头 CLI 实例,不驱动 GUI 窗口。
2. 大脑(用户自选 API 模型,只思考)/ 手(CC/Codex 实例,真干活)两层分离。
3. V1 收窄到有边界项目;整个企业级软件当北极星不当承诺。

## 红线（贯穿）

- probe-first:执行体无头入口先 probe 后实现,绝不伪造事件。
- 隐私 metadata-only:不读/存/传源码正文、prompt、diff、tool output、token、secret。
- 不自动授权任何不可逆动作(花大钱/删除/对外发布)——永远弹回用户。
- BYO-API:总监的大脑由用户自带 key、自选闭源模型;产品不自带模型。

## 下一步动作

出 **选角引擎功能规格**:总监的输入(任务 + roster/配额)、拆解成角色的逻辑、角色→实例映射、配额/成本/时长预估、生成"看得懂敢选"的 A/B/C。这是 V1 最该先想透、最值钱的一块。

## Backlog / 待验证（probe-first）

- 执行体批量无头拉起的各家限流/配额实测(尤其 WorkBuddy/GLM 无头入口是否存在)。
- 总监评估质量:结构化 rubric vs 放任;"评审 agent"当 QA 的模式。
- 成本/炸半径控制的具体机制。
- 大而模糊任务的拆解质量边界。
