'use strict';
/*
 * manual-realistic-dual-agent-test.js — Phase 2.3 dual-agent acceptance driver.
 *
 * Simulates the EXACT envelopes the two real adapters emit — no real Codex or
 * Claude Code needed:
 *   - codex       / codex-plugin-hooks / sessionId codex-s1  (payload shapes as
 *     plugins/supernono-codex/hooks/lib.js produces)
 *   - claude-code / claude-code-hooks  / sessionId claude-s1 (payload shapes as
 *     adapters/claude-code/lib.js produces)
 *
 * The interleaving mirrors a realistic "both agents working at once" session,
 * ending with both turn_ended so the pet settles back to idle.
 *
 * Usage:
 *   1. Start the pet:  cd codex-task-pet && npm start
 *   2. Run:            node adapters/shared/manual-realistic-dual-agent-test.js
 *   3. Watch the pet + tray task panel; verify with SuperNoNo.getAgents() /
 *      getTimeline() / getFocusedAgent() in DevTools (npm start -- --dev).
 *
 * If SuperNoNo isn't running every event prints MISS and nothing crashes.
 */
const { sendSignal } = require('../claude-code/send-signal'); // vendored, dependency-free

const CODEX = { agent: 'codex', adapter: 'codex-plugin-hooks', sessionId: 'codex-s1', taskId: 'codex-turn-1' };
const CLAUDE = { agent: 'claude-code', adapter: 'claude-code-hooks', sessionId: 'claude-s1', taskId: null };

const STEPS = [
  {
    base: CODEX, type: 'command_running',
    payload: { command: 'npm run build', isTest: true, action: '正在运行测试/构建：npm run build' },
    expect: '宠物 → 验证/施工（focus: codex，卡片 1 出现）',
  },
  {
    base: CLAUDE, type: 'command_running',
    payload: { command: 'git status --short', isTest: false, action: '正在运行命令：git status --short' },
    expect: '宠物保持施工态；focus 切到 claude-code（同级优先最近活跃，v0 设计行为）；面板出现第二张卡片',
  },
  {
    base: CODEX, type: 'step_done',
    payload: { action: '完成一步工具调用' },
    expect: 'codex 卡片"最近动作"更新；focus 回 codex（平级最近活跃）；宠物状态不变',
  },
  {
    base: CLAUDE, type: 'file_editing',
    payload: { file: 'agentStore.js', action: '正在编辑文件：agentStore.js' },
    expect: 'focus 回 claude-code；状态栏显示 [claude-code] 编辑动作',
  },
  {
    base: CLAUDE, type: 'step_done',
    payload: { action: '完成一步工具调用（Edit）' },
    expect: 'claude-code 卡片动作更新；focus 留在 claude-code',
  },
  {
    base: CODEX, type: 'turn_ended',
    payload: { action: 'Codex 完成一个回合' },
    expect: '★ codex 卡片安静回待机；claude-code 仍施工 → 宠物保持施工，focus 留在 claude-code（session 级 turn_ended 只落自己的条目）',
  },
  {
    base: CLAUDE, type: 'turn_ended',
    payload: { action: 'Claude Code 完成一个回合' },
    expect: '两个 agent 都回待机；宠物安静回 idle，不庆祝；timeline 共 7 条、两个 agent 交错',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[dual-agent-test] sending ${STEPS.length} interleaved events (codex + claude-code)...\n`);
  let delivered = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    const res = await sendSignal({ ...s.base, type: s.type, payload: s.payload });
    const tag = s.base.agent + '/' + s.base.sessionId;
    if (res.ok) { delivered++; console.log(`  OK    ${i + 1}. ${s.type}  (${tag})`); }
    else console.log(`  MISS  ${i + 1}. ${s.type}  (${tag})  (${res.error || res.status})`);
    console.log(`        期望: ${s.expect}\n`);
    await sleep(2500);
  }

  console.log('');
  if (delivered === 0) {
    console.log('No events reached SuperNoNo. Start it first: cd codex-task-pet && npm start');
  } else {
    console.log(`Done. ${delivered}/${STEPS.length} delivered.`);
    console.log('验收: 面板应有 codex 与 claude-code 两张卡片; DevTools 里 SuperNoNo.getAgents() 应有');
    console.log('  codex:codex-s1 与 claude-code:claude-s1 两个条目, getTimeline() 含两个 agent 的 7 条事件。');
  }
}

main();
