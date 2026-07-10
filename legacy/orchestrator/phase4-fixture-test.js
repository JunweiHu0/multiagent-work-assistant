'use strict';
/* Phase 4 fixture test: plan draft/accept, prompt pack, and decision brief. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  writePlanDraft,
  acceptPlan,
  writePromptPack,
  writeDecisionBrief,
} = require('./phase4');
const { createWorkStore } = require('./work-store');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-phase4-test-'));
const draft = writePlanDraft('Ship Phase 4', { dataDir: dir, goal: 'Build a conservative semi-automatic brain' });
check(fs.existsSync(draft.jsonPath), 'plan draft JSON created');
check(fs.existsSync(draft.mdPath), 'plan draft Markdown created');
check(draft.draft.workItems.length === 2, 'review-loop draft has two work items');
check(draft.draft.decisionGates.length === 1, 'review-loop draft has one decision gate');

const accepted = acceptPlan(draft.jsonPath, { dataDir: dir });
check(accepted.ws.id === 'ws1', 'plan accepted into ws1');
check(accepted.items.length === 2, 'accepted items created');
check(accepted.items[0].assignedAgent === 'codex', 'build item assigned to codex');
check(accepted.items[1].assignedAgent === 'claude-code', 'review item assigned to claude-code');
check(accepted.decisions.length === 1 && accepted.decisions[0].workItemId === 'wi2', 'decision linked to review item');

let duplicateBlocked = false;
try { acceptPlan(draft.jsonPath, { dataDir: dir }); } catch (_) { duplicateBlocked = true; }
check(duplicateBlocked, 'duplicate plan accept blocked by default');

const store = createWorkStore(dir);
store.ingestEvent({ type: 'command_running', agent: 'codex', adapter: 'codex-plugin-hooks', sessionId: 'codex-s1', payload: { command: 'SECRET_SHOULD_NOT_APPEAR' } });
store.linkRun('wi1', 'codex:codex-s1');
const pack = writePromptPack('ws1', { dataDir: dir });
const packNames = pack.files.map((f) => path.basename(f.path));
check(packNames.includes('codex-wi1.md'), 'prompt pack has codex prompt');
check(packNames.includes('claude-code-wi2.md'), 'prompt pack has claude prompt');
check(packNames.includes('user-checklist.md'), 'prompt pack has user checklist');

const brief = writeDecisionBrief('dr1', { dataDir: dir });
const briefBody = fs.readFileSync(brief.outPath, 'utf8');
check(fs.existsSync(brief.outPath), 'decision brief written');
check(briefBody.includes('# SuperNoNo Decision Brief'), 'decision brief has title');
check(briefBody.includes('node orchestrator\\work.js decision resolve dr1 accept'), 'decision brief includes resolve command');
check(!briefBody.includes('SECRET_SHOULD_NOT_APPEAR'), 'decision brief does not leak command payload');

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
