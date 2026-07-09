# T8 真实使用验收记录本

- 目的：用 2-3 个**真实任务**（不是演示任务）回答一个问题：
  > **下周没有人逼你，你还会用它吗？**
- 规则：边用边填，摩擦点当场记（事后回忆会美化）；答案要诚实——no-go 的价值和 go 一样大，它意味着 Phase 7 是砍功能而不是加功能。
- 完成后：把本文件填好的版本交给 Fable review，作为 Phase 7 的开工依据。

## 0. 每次开工前（约 30 秒）

```powershell
# 终端 A：桌宠
cd C:\Users\1\Desktop\project\codex-task-pet && npm start

# 终端 B：relay（常驻）
cd C:\Users\1\Desktop\project\multiagent-work-assistant && node orchestrator\relay.js

# 给要启动 agent 的终端设好（Codex / Claude Code 都从这种终端启动）
$env:SUPERNONO_BRIDGE_PORT = "4175"

# 确认链路（应显示 relay=up pet=up）
node orchestrator\work.js status
```

## 1. 每个任务的标准循环（目标 ≤6 条命令）

```powershell
node orchestrator\work.js go "<任务标题>" --goal "<一句话目标>"
# 把 .supernono/prompts/<ws>/ 下的两个 prompt 分别贴给 Codex 和 Claude Code
node orchestrator\work.js link --auto          # agent 干活后
node orchestrator\work.js item done wi1
node orchestrator\work.js item done wi2 --resolve dr1
node orchestrator\work.js summary --notify
node orchestrator\work.js session close
```

---

## 任务记录（复制此块，每个任务一份）

### 任务 N：____________________（日期：____）

- 任务内容一句话：
- 实际用了几条命令：____（超过 6 条的话，多出来的是哪几条、为什么）
- `link --auto` 命中情况：全自动 / 有歧义（记下歧义场景）/ 失败
- 桌宠表现：决策提醒出现了吗？resolve 后正确消失了吗？有误报/漏报吗？
- summary 读了吗？有用吗（就"交接给明天的自己"而言）：
- **摩擦点**（当场记，格式随意，越具体越好）：
  1.
  2.
- 这个任务上，"有它" vs "没它"的净感受（一句话）：

---

## 最终裁决（3 个任务后填）

1. 最大的三个摩擦点（按疼痛排序）：
2. 最有价值的一个瞬间是什么：
3. 桌宠在这套流程里起作用了吗，还是只是装饰：
4. **Go / No-go**：____
   - Go 的意思：值得投入 Phase 7（对话式管理 + 受控派发），继续降摩擦。
   - No-go 的意思：Phase 7 改为砍掉没用的层，收缩到真正被用到的部分。
5. 如果 go：你最希望 Phase 7 先消灭哪个摩擦？
