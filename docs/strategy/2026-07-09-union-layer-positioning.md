# 定位定案：闭源桌面 Agent 之上的联合管理层（Union Layer）

- 日期：2026-07-09
- 性质：**定位级决策文档**。用户提出论题并将后续分叉的执行权委托给 Fable（产品把关）+ Codex（执行），用户保留否决权。
- 上游文档:[manager-product-plan](2026-07-08-manager-product-plan.md)（管理者抽象的落地设计，仍然有效）；本文件在其上确立"为什么是我们、护城河在哪、分叉怎么走"。

## 1. 论题（用户原话的提炼）

市面上已有多个**很强的闭源桌面 agent**——Claude Code、Codex、WorkBuddy 等。它们各自都能完整执行复杂任务，但底层模型互不相通、各家闭源、彼此没有协同。要做的产品是**它们之上的 multiagent 管理员工具**：帮用户联合这些现成的强 agent 去执行任务。

## 2. 裁决:这个定位成立，且本项目已经"无意识地"为它建了两年河堤

三个结构性理由:

1. **厂商不会做这一层。** 每家厂商的商业动机是锁定（让你只用它的 agent），跨厂商协调层天然属于第三方。这不是暂时的空档，是激励结构决定的长期空档。
2. **这一层的护城河是脏活，不是框架。** "multiagent 编排"赛道很挤，但挤的是框架层（LangChain 式，自己调模型 API 编排）。本项目做的是**编排已安装的 agent 产品**——它们自带订阅、沙箱、权限体系、工具实现。接入它们靠的是 hooks/plugin 逆向验证、Windows 路径坑、trust 流程这类没人爱干的集成工程——而这恰恰是过去八天已验证完成的东西。框架玩家不愿下来，厂商不愿出去，脏活即壁垒。
3. **现有资产逐项对位。** agent-neutral 协议（7 月 1 日设计时就写明"新增 agent = 新增 adapter，不改核心"）、免 token 的 hooks 接入纪律、relay、work store、桌宠 ambient 层——这套东西在"单厂商桌宠"的定位下是过度设计，在"联合层"的定位下每一件都是必需品。定位追上了架构。

顺带解决一个悬而未决的问题:**管理层自己的智能用谁的模型？** 联合层如果绑死某家模型做大脑，中立性就破了。答案已在 Phase 7 蓝图里:把管理器暴露为 MCP server，让用户手里**任何一个** agent 都能充当管理大脑（今天用 CC 当管理员指挥 Codex，明天反过来）。大脑本身也是可插拔的——这是把 agent-neutral 贯彻到顶层。

## 3. 三个必须诚实面对的硬问题

| # | 硬问题 | 对策 |
| --- | --- | --- |
| H1 | **N 个 adapter = N 个无文档、会漂移的集成面。** Codex 的 `${PLUGIN_ROOT}`、Claude Code 的 Notification 不触发都是亲历的教训。厂商升级随时可能打断 adapter | 协议契约保持极小（14 个事件）；允许优雅降级到粗粒度（turn_ended 级）；每个 adapter 带 probe + health-check + install/uninstall（Claude Code adapter 已是模板）；**probe-first 纪律不可豁免**——接 WorkBuddy 或任何新 agent，先 probe 后实现，绝不伪造事件 |
| H2 | **观察已验证，派发未验证。** "联合执行"= 观察（事件出）+ 派发（任务入），后者才是论题的另一半。`claude -p`、`codex exec` 存在；WorkBuddy 的注入面未知 | Phase 7.2 受控派发：确认门、无嵌套 spawn、预算上限；派发时天然拿到 sessionId，auto-link 问题随之彻底消解。注入面缺失的 agent 降级为"prompt pack + 人工粘贴"模式（现有能力） |
| H3 | **管理成本必须低于亲自协调的成本，否则一切归零。** 老板抽象最常见的死法是变成微观管理模拟器 | T8 真实验收仍是总闸门；北极星指标不变:每委托任务的用户动作数 ≤3（交办、拍板、验收） |

## 4. 分叉执行框架（委托给 Fable 把控，用户可随时否决）

**关键认知:两个分叉都服务于联合层论题，区别只在"记账仪式"保留多少。** T8 检验的不是论题本身（论题的证据是你每天真实并用 CC+Codex），而是当前 CLI 记账这层交互的成本收益。

### 分叉 A —— T8 = Go

按序推进 Phase 7，MCP 优先:

1. **7.1 对话式管理（MCP server）**:把 work.js 的能力（status/go/link/decision/summary）封装为本地 MCP server，用户在任何 agent 里用自然语言当老板。这一步同时兑现"大脑可插拔"。
2. **7.2 受控派发**:`work dispatch <itemId>` → 生成 prompt → 用户确认 → `claude -p` / `codex exec` 执行，事件自动回流、run 自动归属。
3. **7.3 报告协议**:被派发的 agent 按 prompt 约定把**交付报告**写到 `.supernono/reports/`，decision brief 引用报告路径（orchestrator 依然不读内容，用户点开看）——老板拍板终于有了证据。
4. **Phase 8 联合证明**:第三个 adapter（WorkBuddy 或 Cursor/Gemini CLI，按 probe 可行性选），验证"新 agent = 新 adapter、核心零改动"在第三家闭源产品上依然成立。**在双 agent 顺滑之前不开工。**

### 分叉 B —— T8 = No-go

不是放弃论题，是砍掉被证伪的交互层:

1. 保留观察核心（adapters + relay + pet + summary）——这部分的价值不依赖记账仪式。
2. 砍掉 work store 的 CLI 仪式（session/item/link/done 手工流），直接跳到 7.1 的对话式管理——让 MCP + 自然语言成为唯一的管理界面，store 退化为 MCP 背后的实现细节。
3. 换一种更轻的形态重跑真实验收。

### 把控方式

每个 gate（T8 结论、7.x 各步开工/收工、Phase 8 开工）由 Fable 出书面决策记录（存 `docs/reviews/`），Codex 按 execution brief 模式执行，用户只在决策记录上行使确认/否决。

## 5. 三个月后的成功画面（用于校准，不是承诺）

用户在 Claude Code 里说"把这个 bug 交给 Codex 修，修完让另一个 CC 会话 review"——管理器拆单、经确认后派发、桌宠安静地亮着两盏工作灯；权限请求时宠物提醒、用户在弹出的 brief 里看着 agent 自己写的报告拍板；一天结束 summary 自动汇成交接文档。全程没有一条手敲的记账命令，没有一个字节的 prompt/源码离开本机。

——如果 T8 揭示的现实与这幅画面的差距主要在"命令太多"，走分叉 A;如果差距在"我根本不想要中间这层记账"，走分叉 B。两条路的终点是同一个:**闭源 agent 们的联合管理层**。
