'use strict';
/* Phase 6 T3 fixture: `work.js status` link-health line + relay port-in-use UX. */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };

const repoRoot = path.join(__dirname, '..');
const node = process.execPath;

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

async function getClosedPort() {
  const server = await startServer((req, res) => res.end('ok'));
  const port = server.address().port;
  await closeServer(server);
  return port;
}

function healthServer(json) {
  return startServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(json));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"ok":false}');
  });
}

function runStatus(relayPort, petPort) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-status-health-'));
  return new Promise((resolve) => {
    const child = spawn(node, ['orchestrator/work.js', 'status'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        SN_BRAIN_PORT: String(relayPort),
        SN_RELAY_PET_PORT: String(petPort),
        SN_BRAIN_DATA_DIR: dataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: -1, out: out + '\nTIMEOUT', firstLine: (out.split(/\r?\n/)[0] || '') });
    }, 3000);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, firstLine: (out.split(/\r?\n/)[0] || '') });
    });
  });
}

async function main() {
  console.log('\n-- 1. work.js status link-health combinations --');

  let relayPort = await getClosedPort();
  let petPort = await getClosedPort();
  let r = await runStatus(relayPort, petPort);
  check(r.code === 0, 'status succeeds when relay and pet are both down');
  check(/Link health: relay=down\(:\d+\) pet=down\(:\d+\) relay->pet=unknown/.test(r.firstLine), 'both down reported in first line');

  const pet = await healthServer({ ok: true, app: 'FakePet', protocolVersion: 'test' });
  relayPort = await getClosedPort();
  petPort = pet.address().port;
  r = await runStatus(relayPort, petPort);
  check(r.code === 0, 'status succeeds when only pet is up');
  check(/relay=down/.test(r.firstLine) && /pet=up/.test(r.firstLine) && /relay->pet=unknown/.test(r.firstLine), 'pet-only state reported');
  await closeServer(pet);

  const relayNoPet = await healthServer({
    ok: true,
    app: 'SuperNoNoBrainRelay',
    pet: { reachable: false },
    counters: { received: 2, forwarded: 1, missed: 1, rejected: 0 },
  });
  relayPort = relayNoPet.address().port;
  petPort = await getClosedPort();
  r = await runStatus(relayPort, petPort);
  check(r.code === 0, 'status succeeds when only relay is up');
  check(/relay=up/.test(r.firstLine) && /pet=down/.test(r.firstLine) && /relay->pet=down/.test(r.firstLine), 'relay-only state reported');
  check(/received=2 missed=1/.test(r.firstLine), 'relay counters included');
  await closeServer(relayNoPet);

  const pet2 = await healthServer({ ok: true, app: 'FakePet', protocolVersion: 'test' });
  const relayWithPet = await healthServer({
    ok: true,
    app: 'SuperNoNoBrainRelay',
    pet: { reachable: true },
    counters: { received: 5, forwarded: 5, missed: 0, rejected: 0 },
  });
  relayPort = relayWithPet.address().port;
  petPort = pet2.address().port;
  r = await runStatus(relayPort, petPort);
  check(r.code === 0, 'status succeeds when relay and pet are both up');
  check(/relay=up/.test(r.firstLine) && /pet=up/.test(r.firstLine) && /relay->pet=up/.test(r.firstLine), 'both-up state reported');
  await closeServer(relayWithPet);
  await closeServer(pet2);

  console.log('\n-- 2. relay port-in-use message --');
  const blocker = await startServer((req, res) => { res.writeHead(200); res.end('occupied'); });
  const occupiedPort = blocker.address().port;
  const relay = spawnSync(node, ['orchestrator/relay.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SN_BRAIN_PORT: String(occupiedPort),
      SN_RELAY_PET_PORT: String(await getClosedPort()),
      SN_BRAIN_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'sn-relay-busy-')),
    },
    encoding: 'utf8',
    timeout: 3000,
  });
  const relayOut = (relay.stdout || '') + (relay.stderr || '');
  check(relay.status === 1, 'relay exits non-zero when listen port is occupied');
  check(/port \d+ is already in use/.test(relayOut) && /可能已有 relay 在跑/.test(relayOut), 'relay explains likely existing relay');
  await closeServer(blocker);

  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
