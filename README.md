# Multiagent 编排总监（Multiagent Work Assistant）

你已经在用的闭源桌面 agent(Claude Code / Codex / WorkBuddy…)之上的 **AI 承包商 / 制片厂**。你交一句抽象任务,它**组队 → 派活 → 盯场 → 验收返工**,把成品交回。你只在**开头选阵容、结尾收货**时出现;中间的碎进展全部由一个"编排总监"承担。

- 它**不是**聊天助手(你不和它对话干活,你指挥别人干活)。
- 它**不是**编排框架(你联合的是装好的成品 agent,不是模型 API)。
- 它**不是**任务看板(核心是自动编排,不是让你记账)。

> 完整产品定义 = **唯一源头**:[docs/prd/multiagent-director-prd-v1.md](docs/prd/multiagent-director-prd-v1.md)

## 现状（2026-07-09）

产品刚定案,处于 **V1 设计阶段,尚未开始 V1 编码**。v0 的探索代码(桌宠 + 观测核心 + CLI 记账)已归档到 `legacy/`,验证过的资产(免 token 观测、agent-neutral 协议、隐私边界)沿用。

**下一步:** 把英雄功能——**选角引擎**(你说一句话 → 甩你 A/B/C 三支配置好的团队)——展开成功能规格。路线见 [docs/roadmap.md](docs/roadmap.md)。

## V1 三条奠基决定（已锁定）

1. **执行体 = 无头 CLI 实例**(`claude -p`/`codex exec`),程序化拉起 N 个实例、派角色提示词、收产出。不驱动 GUI 桌面窗口。
2. **大脑 / 手两层分离**:大脑 = 用户自选的闭源模型 **API**,只思考(拆解/选角/评估/返工);手 = CC/Codex 实例,真干活。
3. **V1 收窄到有边界的项目**;"一句话做完整个企业软件"是北极星,不是 V1 承诺。

## 代码地图

| 目录 | 是什么 | 状态 |
| --- | --- | --- |
| `adapters/claude-code/` | CC 的免 token hook 集成 + 事件映射 + 探针知识 | **金子,carry-forward,仍在用** |
| `legacy/` | v0 探索:观测核心(relay/event-log/协议)+ CLI 记账 + Python spike | 已归档,新观测层从中挖概念(见 [legacy/README.md](legacy/README.md)) |
| `docs/` | 产品定义、战略、评审、探针知识、路线图 | 活的参考 |

> Codex hook 集成 + 桌宠(降为 5% 的 ambient 点缀)在另一个仓库 `codex-task-pet`。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [docs/prd/multiagent-director-prd-v1.md](docs/prd/multiagent-director-prd-v1.md) | **产品定义,唯一源头** |
| [docs/roadmap.md](docs/roadmap.md) | 状态 SoT + V1 路线 |
| [docs/planning/v1-build-sequence.md](docs/planning/v1-build-sequence.md) | V1 构建顺序(依赖排期,持续执行的取活清单) |
| [docs/strategy/2026-07-09-union-layer-positioning.md](docs/strategy/2026-07-09-union-layer-positioning.md) | 定位:为什么做这层、护城河、硬问题 |
| [docs/reviews/2026-07-08-fable5-architecture-code-product-review.md](docs/reviews/2026-07-08-fable5-architecture-code-product-review.md) | 驱动转向的架构/产品评审 |
| [docs/claude-code/claude-code-hooks-probe-plan.md](docs/claude-code/claude-code-hooks-probe-plan.md) | CC hooks 真实行为探针结论(金子) |

## 原则（贯穿始终）

- **隐私是信任前提**:只处理已脱敏的事件元数据,绝不读/存/传源码正文、prompt、diff、tool output、token、secret。
- **护栏即产品**:预算闸、隔离沙箱、不可逆动作永远弹回用户确认——不自动授权。
- **agent-neutral 到底**:连总监的大脑都可插拔(用户自选 API 模型)。
- **放手型不是监工型**:默认全自动,用户介入是例外(卡住/不可逆/超预算/没把握)。
