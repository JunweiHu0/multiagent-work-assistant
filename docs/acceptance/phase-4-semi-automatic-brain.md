# Phase 4 Semi-Automatic Brain Acceptance

目标：验证 Phase 4 是否真的把“手动创建任务 + 手动复制 prompt + 手动总结”变成更顺滑的半自动工作流。

## 前置条件

- `multiagent-work-assistant` 已在当前分支。
- `codex-task-pet` 桌宠可运行。
- Codex hooks 与 Claude Code hooks 已能把事件打到 relay/pet。
- 不要求 Python，不要求外部 LLM API。

## 自动检查

```cmd
cd C:\Users\1\Desktop\project\multiagent-work-assistant
node --check orchestrator\*.js
node orchestrator\phase4-fixture-test.js
node orchestrator\work-store-fixture-test.js
node orchestrator\summary-fixture-test.js
node orchestrator\prompt-fixture-test.js
```

## 真实工作流检查

1. 启动 relay。

```cmd
node orchestrator\relay.js
```

2. 为一个真实小任务创建 plan draft。

```cmd
node orchestrator\work.js plan draft "一个真实小任务" --goal "Codex build, Claude review, user decides"
```

3. 打开生成的 `.supernono/plans/*.md`，人工确认计划是否合理。

通过标准：

- WorkItems 是否少而清楚。
- Codex / Claude Code 分工是否正确。
- decision gate 是否正好落在用户应该拍板的位置。

4. 接受计划。

```cmd
node orchestrator\work.js plan accept .supernono\plans\plan-xxx.json
```

5. 生成 prompt pack。

```cmd
node orchestrator\work.js prompt pack ws1
```

通过标准：

- Codex prompt 可以直接复制给 Codex。
- Claude Code prompt 是 review 姿态，而不是继续实现。
- `user-checklist.md` 能指导 link / decision / summary。

6. 手动让 Codex / Claude Code 执行。

不要让 orchestrator 自动启动 agent。它只负责记账和生成文本。

7. 检查状态并 link runs。

```cmd
node orchestrator\work.js status
node orchestrator\work.js item link wi1 codex:<sessionId>
node orchestrator\work.js item link wi2 claude-code:<sessionId>
```

8. 生成 decision brief。

```cmd
node orchestrator\work.js decision brief dr1 --notify
```

通过标准：

- brief 能让用户快速知道要 accept / reject / note 什么。
- pet 出现 assistant/workbench 的提醒。
- brief 不包含 prompt、transcript、源码正文、diff、tool output、token、secret。

9. 收口。

```cmd
node orchestrator\work.js decision resolve dr1 accept
node orchestrator\work.js item done wi1
node orchestrator\work.js item done wi2
node orchestrator\work.js summary --notify
```

## 失败判定

如果出现以下任一情况，Phase 4 不能算产品通过：

- plan draft 生成的任务比手写还费劲。
- prompt pack 需要大量修改才能用。
- decision brief 不能帮助拍板，只是重复状态。
- link / decision / summary 的手动步骤太多，用户明显不愿意继续用。

## Review Prompt

可以复制给 CC/Fable：

```text
请 review Phase 4 半自动 SuperNoNo Brain 的真实使用结果。
重点看：
1. plan draft 是否减少了任务拆分成本。
2. prompt pack 是否能直接喂给 Codex / Claude Code。
3. decision brief 是否真的帮助用户拍板。
4. 是否仍然遵守边界：不自动启动 agent、不自动授权、不读取 prompt/transcript/source/diff/tool output/token/secret。
5. 下一步应该优化 planner 模板，还是先降低 link/decision/status 的操作成本。
请输出 findings + go/no-go + 下一阶段建议。
```
