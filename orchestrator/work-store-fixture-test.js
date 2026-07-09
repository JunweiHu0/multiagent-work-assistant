'use strict';
/* Phase 3.2 store verification (temp dir, no relay, no agents). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkStore } = require('./work-store');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-workstore-test-'));
const store = createWorkStore(dir);

console.log('\n-- 1. session / item / assign lifecycle --');
const ws = store.startSession('Implement Claude adapter', 'Connect hook events into pet');
check(ws.id === 'ws1' && ws.status === 'active', 'session started (ws1, active)');
const wi = store.addItem('Let Codex implement relay', { role: 'build' });
check(wi.id === 'wi1' && wi.status === 'todo' && wi.sessionId === 'ws1', 'item added to active session');
const assigned = store.assignItem('wi1', 'codex');
check(assigned.assignedAgent === 'codex', 'item assigned to codex');
let threw = false;
try { store.assignItem('wi1', 'gpt-9000'); } catch (_) { threw = true; }
check(threw, 'unknown agent rejected');

console.log('\n-- 2. ingestion creates AgentRun (unassigned) --');
let r = store.ingestEvent({ type: 'command_running', agent: 'codex', adapter: 'codex-plugin-hooks', sessionId: 'codex-s1', payload: { command: 'npm test' } });
check(r.ok && r.runId === 'ar1', 'command_running created run ar1');
let st = store.getStatus();
check(st.unassignedRuns.length === 1 && st.unassignedRuns[0].id === 'ar1', 'run listed as unassigned');
check(st.runs[0].state === 'working' && st.runs[0].eventCounts.command_running === 1, 'run state working, counts recorded');
r = store.ingestEvent({ type: 'step_done', agent: 'codex', sessionId: 'codex-s1', payload: {} });
check(r.ok && r.runId === 'ar1', 'step_done updates the SAME run');
r = store.ingestEvent({ type: 'turn_ended', agent: 'codex', sessionId: 'codex-s1', payload: {} });
st = store.getStatus();
check(st.runs[0].state === 'idle' && st.runs[0].lastEventType === 'turn_ended', 'turn_ended -> run idle');

console.log('\n-- 3. events without agent/sessionId are ignored --');
r = store.ingestEvent({ type: 'command_running', payload: {} });
check(r.ok && r.ignored === true, 'agent-less event ignored');
r = store.ingestEvent({ type: 'turn_ended', agent: 'codex', payload: {} });
check(r.ok && r.ignored === true, 'sessionId-less event ignored (notify wrapper case)');

console.log('\n-- 4. link run to item + auto status --');
const linked = store.linkRun('wi1', 'codex:codex-s1');
check(linked.run.id === 'ar1' && linked.run.workItemId === 'wi1', 'run linked by agent:sessionId');
check(linked.item.status === 'in_progress', 'idle run linked later does not leave item todo');
check(store.getStatus().unassignedRuns.length === 0, 'no more unassigned runs');
store.ingestEvent({ type: 'command_running', agent: 'codex', sessionId: 'codex-s1', payload: {} });
st = store.getStatus();
check(st.items.find((x) => x.id === 'wi1').status === 'in_progress', 'working event keeps linked item in_progress');
store.ingestEvent({ type: 'permission_required', agent: 'codex', sessionId: 'codex-s1', payload: {} });
st = store.getStatus();
check(st.runs.find((x) => x.id === 'ar1').state === 'waiting_user' && st.items.find((x) => x.id === 'wi1').status === 'waiting_user', 'permission_required -> run+item waiting_user');
store.ingestEvent({ type: 'permission_resolved', agent: 'codex', sessionId: 'codex-s1', payload: {} });
st = store.getStatus();
check(st.items.find((x) => x.id === 'wi1').status === 'in_progress', 'resolution returns item to in_progress');
threw = false;
try { store.linkRun('wi1', 'claude-code:nope'); } catch (_) { threw = true; }
check(threw, 'linking unknown run fails');

console.log('\n-- 5. second agent run stays isolated --');
store.ingestEvent({ type: 'file_editing', agent: 'claude-code', adapter: 'claude-code-hooks', sessionId: 'cc-1', payload: {} });
st = store.getStatus();
check(st.runs.length === 2 && st.unassignedRuns.length === 1 && st.unassignedRuns[0].agent === 'claude-code', 'claude run created, unassigned');
check(st.runs.find((x) => x.id === 'ar1').state === 'working', 'codex run untouched by claude event');

console.log('\n-- 5b. linking an already settled run still moves todo item forward --');
const wi2 = store.addItem('Review settled run later', { role: 'review' });
store.ingestEvent({ type: 'completed', agent: 'claude-code', sessionId: 'cc-1', payload: {} });
const linkedSettled = store.linkRun(wi2.id, 'claude-code:cc-1');
check(linkedSettled.item.status === 'in_progress', 'completed run linked later does not leave item todo');

console.log('\n-- 6. done stays manual --');
store.ingestEvent({ type: 'completed', agent: 'codex', sessionId: 'codex-s1', payload: {} });
st = store.getStatus();
check(st.runs.find((x) => x.id === 'ar1').state === 'completed', 'run completed');
check(st.items.find((x) => x.id === 'wi1').status === 'in_progress', 'item NOT auto-done by completed event');
const done = store.markItemDone('wi1');
check(done.status === 'done', 'item done via explicit command');

console.log('\n-- 7. decisions --');
const d = store.addDecision('Accept this plan?', { itemId: 'wi1' });
check(d.id === 'dr1' && store.getStatus().openDecisions.length === 1, 'decision added + open');
const resolved = store.resolveDecision('dr1', 'accept');
check(resolved.resolution === 'accept' && store.getStatus().openDecisions.length === 0, 'decision resolved');
threw = false;
try { store.resolveDecision('dr1', 'accept'); } catch (_) { threw = true; }
check(threw, 'double-resolve rejected');

console.log('\n-- 8. auto-link plan and execution --');
const autoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-autolink-test-'));
const autoStore = createWorkStore(autoDir);
autoStore.startSession('Auto link smoke', 'Match unassigned runs to assigned items');
autoStore.addItem('Codex build target', { role: 'build' });
autoStore.assignItem('wi1', 'codex');
autoStore.ingestEvent({ type: 'command_running', agent: 'codex', sessionId: 'codex-auto', payload: {} });
let plan = autoStore.getAutoLinkPlan();
check(plan.length === 1 && plan[0].candidates.length === 1 && plan[0].candidates[0].id === 'wi1', 'auto-link plan finds the unique matching item');
let auto = autoStore.autoLinkRuns();
check(auto.linked.length === 1 && auto.linked[0].item.id === 'wi1' && auto.linked[0].run.id === 'ar1', 'auto-link links unique match');
check(autoStore.getStatus().runs.find((x) => x.id === 'ar1').workItemId === 'wi1', 'auto-linked run is attached');
autoStore.addItem('Claude review A', { role: 'review' });
autoStore.assignItem('wi2', 'claude-code');
autoStore.addItem('Claude review B', { role: 'review' });
autoStore.assignItem('wi3', 'claude-code');
autoStore.ingestEvent({ type: 'command_running', agent: 'claude-code', sessionId: 'cc-ambiguous', payload: {} });
auto = autoStore.autoLinkRuns();
check(auto.ambiguous.length === 1 && auto.ambiguous[0].candidates.length === 2, 'auto-link reports multiple candidates as ambiguous');
check(!autoStore.getStatus().runs.find((x) => x.agentSessionId === 'cc-ambiguous').workItemId, 'ambiguous run is not linked');
autoStore.ingestEvent({ type: 'command_running', agent: 'generic-cli', sessionId: 'generic-none', payload: {} });
auto = autoStore.autoLinkRuns();
check(auto.noCandidates.length === 1 && auto.noCandidates[0].run.agent === 'generic-cli', 'auto-link reports no-candidate run');
check(!autoStore.getStatus().runs.find((x) => x.agentSessionId === 'generic-none').workItemId, 'no-candidate run is not linked');

console.log('\n-- 9. run archive / hide / wake --');
const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-archive-test-'));
const archiveStore = createWorkStore(archiveDir);
archiveStore.startSession('Archive smoke', 'Closed sessions hide old runs');
archiveStore.addItem('Codex archived item', { role: 'build' });
archiveStore.assignItem('wi1', 'codex');
archiveStore.ingestEvent({ type: 'command_running', agent: 'codex', sessionId: 'codex-archive', payload: {} });
archiveStore.linkRun('wi1', 'codex:codex-archive');
archiveStore.ingestEvent({ type: 'command_running', agent: 'claude-code', sessionId: 'cc-unassigned-archive', payload: {} });
archiveStore.closeSession('ws1');
let hiddenStatus = archiveStore.getStatus();
let fullStatus = archiveStore.getStatus({ includeArchived: true });
check(hiddenStatus.runs.length === 0 && hiddenStatus.unassignedRuns.length === 0, 'closed session archives linked and in-window unassigned runs by default');
check(fullStatus.runs.length === 2 && fullStatus.runs.every((r) => r.archived === true), '--all status can see archived runs');
archiveStore.ingestEvent({ type: 'command_running', agent: 'codex', sessionId: 'codex-archive', payload: {} });
hiddenStatus = archiveStore.getStatus();
fullStatus = archiveStore.getStatus({ includeArchived: true });
check(hiddenStatus.runs.length === 1 && hiddenStatus.runs[0].agentSessionId === 'codex-archive' && !hiddenStatus.runs[0].archived, 'new event wakes archived run');
check(fullStatus.runs.find((r) => r.agentSessionId === 'cc-unassigned-archive').archived === true, 'unrelated archived run stays archived');

console.log('\n-- 10. corruption safety: never silently overwrite --');
const before = fs.readFileSync(store.filePath, 'utf8');
fs.writeFileSync(store.filePath, 'this is {{{ not json');
threw = false;
try { store.getStatus(); } catch (e) { threw = /corrupt|work store|JSON|refus/i.test(e.message); }
check(threw, 'load throws clear corruption error');
threw = false;
try { store.addItem('should fail'); } catch (_) { threw = true; }
check(threw, 'mutations blocked while corrupted');
const ing = store.ingestEvent({ type: 'command_running', agent: 'codex', sessionId: 's9', payload: {} });
check(ing.ok === false, 'ingestEvent reports failure instead of throwing');
check(fs.readFileSync(store.filePath, 'utf8') === 'this is {{{ not json', 'corrupted file NOT overwritten by any path');
fs.writeFileSync(store.filePath, before);
check(store.getStatus().items.length === 2, 'store usable again after manual repair');

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
