'use strict';
/* Phase 3.4/3.5 workflow CLI fixture test. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createWorkStore } = require('./work-store');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-workflow-test-'));
function cli(args, dataDir) {
  const res = spawnSync(process.execPath, [path.join(__dirname, 'work.js'), ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, SN_BRAIN_DATA_DIR: dataDir || dir },
  });
  return { code: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

let r = cli(['workflow', 'review-loop', 'Ship', 'brain', 'relay', '--goal', 'Codex builds and Claude reviews']);
check(r.code === 0 && /OK workflow review-loop created: ws1/.test(r.out), 'review-loop created session');
check(/wi1 -> codex/.test(r.out), 'build item assigned to codex');
check(/wi2 -> claude-code/.test(r.out), 'review item assigned to claude-code');
check(/dr1 -> decision/.test(r.out), 'decision created');
r = cli(['status']);
check(r.code === 0 && /Codex implement: Ship brain relay/.test(r.out), 'status shows codex item');
check(r.code === 0 && /Claude Code review: Ship brain relay/.test(r.out), 'status shows claude review item');
r = cli(['summary']);
check(r.code === 0 && /OK summary written:/.test(r.out), 'summary command works');
const summaryDir = path.join(dir, 'summaries');
const summaries = fs.existsSync(summaryDir) ? fs.readdirSync(summaryDir).filter((f) => f.endsWith('.md')) : [];
check(summaries.length === 1, 'summary markdown file exists');
const body = fs.readFileSync(path.join(summaryDir, summaries[0]), 'utf8');
check(body.includes('Codex implement: Ship brain relay'), 'summary includes build item');
check(body.includes('Claude Code review: Ship brain relay'), 'summary includes review item');

console.log('\n-- Phase 6 T4 combined commands --');
r = cli(['go', 'Ship', 'combined', 'workflow', '--goal', 'One command should draft, accept, and pack prompts']);
check(r.code === 0 && /OK go plan draft:/.test(r.out), 'go writes a plan draft');
check(/OK go plan accepted: ws2/.test(r.out), 'go accepts plan into a new session');
check(/OK go prompt pack:/.test(r.out), 'go writes prompt pack');
const plans = fs.existsSync(path.join(dir, 'plans')) ? fs.readdirSync(path.join(dir, 'plans')).filter((f) => f.endsWith('.json')) : [];
check(plans.length >= 1, 'go leaves plan JSON under .supernono/plans');
const promptDir = path.join(dir, 'prompts', 'ws2');
check(fs.existsSync(path.join(promptDir, 'codex-wi3.md')) && fs.existsSync(path.join(promptDir, 'claude-code-wi4.md')), 'go leaves agent prompt files under .supernono/prompts/ws2');
const store = createWorkStore(dir);
let st = store.getStatus();
check(st.activeSession && st.activeSession.id === 'ws2', 'go session becomes active');
check(st.decisions.some((d) => d.id === 'dr2' && !d.resolvedAt), 'go creates an open decision gate');
r = cli(['item', 'done', 'wi4', '--resolve', 'dr2', '--no-notify']);
check(r.code === 0 && /OK item wi4 done/.test(r.out) && /OK decision dr2 resolved: accept/.test(r.out), 'item done --resolve closes item and decision');
st = store.getStatus();
check(st.items.find((i) => i.id === 'wi4').status === 'done', 'combined done marks item done');
check(st.decisions.find((d) => d.id === 'dr2').resolution === 'accept', 'combined done resolves decision as accept by default');

console.log('\n-- Phase 6 T2 auto-link CLI --');
const autoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-workflow-autolink-'));
const autoStore = createWorkStore(autoDir);
autoStore.startSession('Auto link CLI', 'Status should suggest and command should link');
autoStore.addItem('Codex target', { role: 'build' });
autoStore.assignItem('wi1', 'codex');
autoStore.ingestEvent({ type: 'command_running', agent: 'codex', sessionId: 'codex-cli-auto', payload: {} });
r = cli(['status'], autoDir);
check(r.code === 0 && /auto-link available: wi1/.test(r.out), 'status suggests auto-link for unique candidate');
r = cli(['link', '--auto'], autoDir);
check(r.code === 0 && /OK auto-linked ar1 \(codex:codex-cli-auto\) -> wi1/.test(r.out), 'link --auto links unique candidate');
st = autoStore.getStatus();
check(st.runs.find((x) => x.id === 'ar1').workItemId === 'wi1', 'CLI auto-link persists the run link');

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
