'use strict';
/*
 * relay-fixture-test.js — Phase 3.1 relay verification. No real pet or agents
 * needed: starts a FAKE pet bridge + the real relay (in-process, ephemeral
 * ports, temp data dir) and asserts the four contracts:
 *
 *   1. TRANSPARENCY  — the fake pet receives the exact bytes the "adapter"
 *      sent (unknown fields, key order, everything). Responses are ok:true.
 *   2. VALIDATION    — bad JSON / missing type / oversized body / browser
 *      Origin are rejected without forwarding.
 *   3. PET DOWN      — relay still answers ok:true, does not crash, and logs
 *      the event with forward:"missed".
 *   4. LOG HYGIENE   — JSONL lines contain exactly { at, envelope, forward },
 *      nothing else (no headers, no derived content).
 *
 * Usage: node orchestrator/relay-fixture-test.js
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startRelay } = require('./relay');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST raw bytes to a port; resolve {status, json}. */
function post(port, rawBody, headers) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1', port, path: '/signal', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody), ...(headers || {}) },
        timeout: 3000,
        agent: false, // fresh socket per request: the 413 case destroys its
                      // socket by design, which would poison a keep-alive pool
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch (_) { /* ignore */ }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.write(rawBody);
    req.end();
  });
}

function getJson(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function main() {
  // ---- fake pet bridge (records raw bodies byte-for-byte) -----------------
  const petReceived = [];
  const fakePet = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{"ok":true,"app":"FakePet"}');
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      petReceived.push(Buffer.concat(chunks));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => fakePet.listen(0, '127.0.0.1', r));
  const petPort = fakePet.address().port;

  // ---- real relay, ephemeral port + temp data dir --------------------------
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-relay-test-'));
  const relay = await startRelay({ port: 0, petPort, dataDir, quiet: true });
  // port 0 -> ephemeral; read the real one back
  const relayPort = relay.server.address().port;

  console.log(`[relay-fixture-test] relay :${relayPort} -> fake pet :${petPort}\n`);

  // ---- 1. transparency ------------------------------------------------------
  // Deliberately exotic: unknown fields, non-alphabetical key order, unicode,
  // and marker strings that must arrive EXACTLY as sent.
  const envelopes = [
    '{"type":"command_running","agent":"codex","adapter":"codex-plugin-hooks","sessionId":"s1","taskId":"t1","payload":{"command":"npm test","isTest":true,"action":"正在运行 npm test"}}',
    '{"payload":{"action":"完成一步工具调用（Bash）"},"sessionId":"claude-s1","type":"step_done","agent":"claude-code","adapter":"claude-code-hooks","futureField":{"nested":[1,2,3]}}',
    '{"type":"turn_ended","agent":"claude-code","sessionId":"claude-s1","payload":{"action":"Claude Code 完成一个回合","outcome":"UNKNOWN-enum-passthrough"}}',
  ];
  for (const raw of envelopes) {
    const res = await post(relayPort, raw);
    check(res.status === 200 && res.json && res.json.ok === true, 'accepted: ' + JSON.parse(raw).type);
  }
  await sleep(300); // async forward
  check(petReceived.length === 3, `fake pet received all events (${petReceived.length}/3)`);
  for (let i = 0; i < envelopes.length; i++) {
    check(petReceived[i] && petReceived[i].toString('utf8') === envelopes[i],
      `byte-for-byte identical forward #${i + 1} (key order + unknown fields preserved)`);
  }

  // ---- 2. validation --------------------------------------------------------
  let res = await post(relayPort, 'this is not json {{{');
  check(res.status === 400, 'bad JSON -> 400');
  res = await post(relayPort, '{"agent":"codex","payload":{}}');
  check(res.status === 400, 'missing type -> 400');
  res = await post(relayPort, JSON.stringify({ type: 'x', payload: { big: 'a'.repeat(70 * 1024) } }));
  check(res.status === 413, 'oversized body -> 413');
  res = await post(relayPort, '{"type":"completed"}', { Origin: 'http://evil.example' });
  check(res.status === 403, 'browser Origin header -> 403');
  await sleep(300);
  check(petReceived.length === 3, 'rejected events were NOT forwarded');

  // ---- 3. pet down ----------------------------------------------------------
  await new Promise((r) => fakePet.close(r));
  const t0 = Date.now();
  res = await post(relayPort, '{"type":"command_running","agent":"codex","sessionId":"s1","payload":{"command":"echo x"}}');
  check(res.status === 200 && res.json && res.json.ok === true, 'pet down: relay still answers ok:true');
  check(Date.now() - t0 < 500, `pet down: upstream answered fast (${Date.now() - t0}ms, forward is async)`);
  await sleep(1200); // let the forward attempt fail + log
  const health = await getJson(relayPort, '/health');
  check(health && health.ok === true, 'pet down: relay /health still ok (no crash)');
  check(health.counters.received === 4 && health.counters.forwarded === 3 && health.counters.missed === 1,
    `counters correct (received=${health.counters.received} forwarded=${health.counters.forwarded} missed=${health.counters.missed})`);
  check(health.pet && health.pet.reachable === false, 'health reports pet unreachable');

  // ---- 4. log hygiene --------------------------------------------------------
  const lines = fs.readFileSync(relay.logFile(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  check(lines.length === 4, `log has one line per accepted event (${lines.length}/4)`);
  check(lines.every((l) => Object.keys(l).sort().join(',') === 'at,envelope,forward'),
    'log lines contain exactly {at, envelope, forward}');
  check(lines.slice(0, 3).every((l) => l.forward.status === 'ok') && lines[3].forward.status === 'missed',
    'forward status recorded (3x ok, 1x missed)');
  check(lines[1].envelope.futureField && lines[1].envelope.futureField.nested.length === 3,
    'unknown envelope fields preserved in the log');
  const logRaw = fs.readFileSync(relay.logFile(), 'utf8');
  check(!logRaw.includes('origin') && !logRaw.includes('Origin') && !logRaw.includes('user-agent'),
    'no HTTP headers leaked into the log');

  await relay.close();
  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
  process.exit(failures === 0 ? 0 : 1);
}

main();
