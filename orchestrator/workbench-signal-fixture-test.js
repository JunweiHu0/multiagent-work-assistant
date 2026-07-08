'use strict';
/* Phase 6A fixture: assistant/workbench signal lifecycle and fallback. */
const http = require('http');
const { assistantEvent, sendWorkbenchSignal, targetPorts } = require('./workbench-signal');
const { sendAssistantDecisionBrief, sendAssistantDecisionResolved } = require('./phase4');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };

function listen(server, port) {
  return new Promise((resolve) => server.listen(port || 0, '127.0.0.1', () => resolve(server.address().port)));
}
function close(server) { return new Promise((resolve) => server.close(resolve)); }

async function reserveClosedPort() {
  const s = http.createServer((_, res) => res.end('unused'));
  const port = await listen(s);
  await close(s);
  return port;
}

async function fakePet() {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { received.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { received.push({ parseFailed: true }); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  const port = await listen(server);
  return { port, received, close: () => close(server) };
}

(async function main() {
  const closedPort = await reserveClosedPort();
  const pet = await fakePet();
  try {
    check(targetPorts({ ports: [closedPort, pet.port, pet.port] }).join(',') === closedPort + ',' + pet.port, 'explicit fallback port list is supported and deduped');

    const direct = await sendWorkbenchSignal(assistantEvent('completed', { action: 'hello' }), { port: pet.port, timeoutMs: 80 });
    check(direct.ok && direct.port === pet.port, 'direct assistant signal delivered');

    const fallback = await sendWorkbenchSignal(assistantEvent('completed', { action: 'fallback' }), { ports: [closedPort, pet.port], timeoutMs: 80 });
    check(fallback.ok && fallback.port === pet.port, 'fallback tries next port after miss');
    check(fallback.attempts.length === 2 && fallback.attempts[0].ok === false && fallback.attempts[1].ok === true, 'fallback records both attempts');

    const decision = { id: 'dr1', summary: 'Accept the review result?', resolution: 'accept' };
    const brief = await sendAssistantDecisionBrief('C:\\tmp\\decision-dr1.md', decision, { ports: [closedPort, pet.port], timeoutMs: 80 });
    const resolved = await sendAssistantDecisionResolved(decision, { ports: [closedPort, pet.port], timeoutMs: 80 });
    check(brief.ok && resolved.ok, 'decision brief and resolve notifications delivered');

    // Full lifecycle is THREE events: the resolve must be followed by a settle
    // (turn_ended), otherwise the pet parks the assistant in its previous
    // visual state forever (verified against the real renderer modules:
    // resumePhase:'thinking' left the assistant holding focus indefinitely).
    const lifecycle = pet.received.slice(-3);
    check(lifecycle[0].type === 'permission_required', 'decision brief sends permission_required');
    check(lifecycle[1].type === 'permission_resolved', 'decision resolve sends permission_resolved');
    check(lifecycle[2].type === 'turn_ended', 'decision resolve settles the assistant with turn_ended');
    check(lifecycle.every((e) => e.agent === 'assistant' && e.adapter === 'workbench' && e.sessionId === 'workbench'), 'assistant lifecycle uses stable workbench identity');
    check(lifecycle.every((e) => e.taskId === 'dr1'), 'assistant lifecycle keeps decision taskId');
    check(lifecycle[1].payload && lifecycle[1].payload.approved === true && !lifecycle[1].payload.resumePhase, 'permission_resolved carries approved; settling is turn_ended\'s job (no resumePhase)');
  } finally {
    await pet.close();
  }

  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => { console.error(err && err.stack || err); process.exit(1); });