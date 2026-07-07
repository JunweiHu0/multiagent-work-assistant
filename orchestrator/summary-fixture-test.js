'use strict';
/* Phase 3.3 summary fixture test. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkStore } = require('./work-store');
const { writeSummary, countEventLog } = require('./summary');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-summary-test-'));
const store = createWorkStore(dir);
store.startSession('Build adapter', 'Connect hooks safely');
store.addItem('Codex implements relay', { role: 'build' });
store.assignItem('wi1', 'codex');
store.ingestEvent({ type: 'command_running', agent: 'codex', adapter: 'codex-plugin-hooks', sessionId: 'codex-session-1234567890', payload: { command: 'SECRET SHOULD NOT APPEAR' } });
store.ingestEvent({ type: 'step_done', agent: 'codex', adapter: 'codex-plugin-hooks', sessionId: 'codex-session-1234567890', payload: { stdout: 'LEAK_STDOUT' } });
store.linkRun('wi1', 'codex:codex-session-1234567890');
store.addDecision('Accept the relay design?', { itemId: 'wi1' });

const today = new Date();
const p = (n) => String(n).padStart(2, '0');
const eventFile = path.join(dir, 'events-' + today.getFullYear() + p(today.getMonth() + 1) + p(today.getDate()) + '.jsonl');
fs.writeFileSync(eventFile, [
  JSON.stringify({ at: new Date().toISOString(), envelope: { type: 'command_running', agent: 'codex', adapter: 'codex-plugin-hooks', sessionId: 'codex-session-1234567890', payload: { command: 'SECRET SHOULD NOT APPEAR' } }, forward: { status: 'ok' } }),
  JSON.stringify({ at: new Date().toISOString(), envelope: { type: 'turn_ended', agent: 'claude-code', adapter: 'claude-code-hooks', sessionId: 'cc-1', payload: { transcript: 'LEAK_TRANSCRIPT' } }, forward: { status: 'missed' } }),
].join('\n') + '\n');

const result = writeSummary({ dataDir: dir });
const body = fs.readFileSync(result.outPath, 'utf8');
const stats = countEventLog(dir);

check(fs.existsSync(result.outPath), 'summary file created');
check(body.includes('# SuperNoNo Work Summary'), 'has title');
check(body.includes('wi1 [in_progress]'), 'item status included');
check(body.includes('ar1 codex:'), 'linked run included');
check(body.includes('dr1 Accept the relay design?'), 'open decision included');
check(body.includes('codex: total=1'), 'event totals include codex');
check(body.includes('claude-code: total=1'), 'event totals include claude-code');
check(stats.forwarded === 1 && stats.missed === 1, 'forward stats counted');
check(!body.includes('SECRET SHOULD NOT APPEAR'), 'command payload not leaked');
check(!body.includes('LEAK_STDOUT'), 'stdout not leaked');
check(!body.includes('LEAK_TRANSCRIPT'), 'transcript not leaked');

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
