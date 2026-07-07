'use strict';
/* Phase 3.2 integration: relay ingestion + work store + CLI. */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { startRelay } = require('./relay');
const { createWorkStore } = require('./work-store');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function post(port, obj) {
  return new Promise((resolve) => {
    const raw = JSON.stringify(obj);
    const req = http.request({ host: '127.0.0.1', port, path: '/signal', method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) }, timeout: 3000 },
    (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', () => resolve(0));
    req.write(raw);
    req.end();
  });
}

function cli(dataDir, args) {
  const res = spawnSync(process.execPath, [path.join(__dirname, 'work.js'), ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, SN_BRAIN_DATA_DIR: dataDir },
  });
  return { code: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-integration-'));
  const petBodies = [];
  const fakePet = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { petBodies.push(Buffer.concat(chunks).toString('utf8')); res.writeHead(200); res.end('{"ok":true}'); });
  });
  await new Promise((r) => fakePet.listen(0, '127.0.0.1', r));
  const relay = await startRelay({ port: 0, petPort: fakePet.address().port, dataDir, quiet: true });
  const relayPort = relay.server.address().port;
  console.log(`[integration] relay :${relayPort}, dataDir ${dataDir}\n`);

  console.log('-- 1. CLI: session + items before any events --');
  let r = cli(dataDir, ['session', 'start', 'Implement', 'Claude', 'adapter', '--goal', 'Connect hook events into pet']);
  check(r.code === 0 && /OK session ws1 started/.test(r.out), 'session start -> ws1');
  r = cli(dataDir, ['item', 'add', 'Let', 'Codex', 'implement', 'relay', '--role', 'build']);
  check(r.code === 0 && /OK item wi1 added/.test(r.out), 'item add -> wi1');
  r = cli(dataDir, ['item', 'assign', 'wi1', 'codex']);
  check(r.code === 0 && /assigned to codex/.test(r.out), 'item assign codex');

  console.log('\n-- 2. relay events create + update AgentRuns --');
  await post(relayPort, { type: 'command_running', agent: 'codex', adapter: 'codex-plugin-hooks', sessionId: 'codex-s1', payload: { command: 'npm test', action: 'x' } });
  await post(relayPort, { type: 'command_running', agent: 'claude-code', adapter: 'claude-code-hooks', sessionId: 'cc-1', payload: { command: 'git status', action: 'y' } });
  await post(relayPort, { type: 'step_done', agent: 'codex', sessionId: 'codex-s1', payload: {} });
  await post(relayPort, { type: 'turn_ended', agent: 'claude-code', sessionId: 'cc-1', payload: {} });
  await sleep(600);

  const store = createWorkStore(dataDir);
  let st = store.getStatus();
  check(st.runs.length === 2, `two AgentRuns created (${st.runs.length})`);
  const codexRun = st.runs.find((x) => x.agent === 'codex');
  const ccRun = st.runs.find((x) => x.agent === 'claude-code');
  check(codexRun && codexRun.state === 'working' && codexRun.eventCounts.step_done === 1, 'codex run working, step_done counted');
  check(ccRun && ccRun.state === 'idle' && ccRun.lastEventType === 'turn_ended', 'claude run idle after turn_ended');
  check(st.unassignedRuns.length === 2, 'both runs unassigned before link');

  console.log('\n-- 3. CLI link + status reflects runs --');
  r = cli(dataDir, ['item', 'link', 'wi1', 'codex:codex-s1']);
  check(r.code === 0 && /linked to item wi1/.test(r.out), 'link by agent:sessionId');
  r = cli(dataDir, ['status']);
  check(/wi1/.test(r.out) && /codex/.test(r.out), 'status shows item with linked run');
  check(/Unassigned AgentRuns/.test(r.out) && /claude-code:cc-1/.test(r.out), 'status shows claude run as unassigned');
  await post(relayPort, { type: 'file_editing', agent: 'codex', sessionId: 'codex-s1', payload: { file: 'x.js' } });
  await sleep(400);
  st = store.getStatus();
  check(st.items[0].status === 'in_progress', 'working event after link bumps item to in_progress');

  console.log('\n-- 4. decision + done round-trip --');
  r = cli(dataDir, ['decision', 'add', 'Accept', 'this', 'plan?', '--item', 'wi1']);
  check(r.code === 0 && /OK decision dr1 added/.test(r.out), 'decision add');
  r = cli(dataDir, ['decision', 'resolve', 'dr1', 'accept']);
  check(r.code === 0 && /resolved: accept/.test(r.out), 'decision resolve');
  r = cli(dataDir, ['item', 'done', 'wi1']);
  check(r.code === 0 && /OK item wi1 done/.test(r.out), 'item done');

  console.log('\n-- 5. forwarding transparent while bookkeeping on --');
  check(petBodies.length === 5, `fake pet received all 5 events (${petBodies.length})`);
  check(petBodies.every((b) => JSON.parse(b).type), 'forwarded bodies intact');

  console.log('\n-- 6. corrupted store never breaks forwarding --');
  fs.writeFileSync(store.filePath, 'corrupted {{{');
  const status = await post(relayPort, { type: 'command_running', agent: 'codex', sessionId: 'codex-s1', payload: {} });
  await sleep(400);
  check(status === 200, 'relay still accepts events');
  check(petBodies.length === 6, 'event still forwarded to pet despite corrupted store');
  check(fs.readFileSync(store.filePath, 'utf8') === 'corrupted {{{', 'corrupted store not overwritten');

  await relay.close();
  await new Promise((r2) => fakePet.close(r2));
  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
  process.exit(failures === 0 ? 0 : 1);
}

main();
