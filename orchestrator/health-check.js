'use strict';
/*
 * health-check.js — brain relay operational check (Phase 3.1).
 *
 * Verifies, without changing anything:
 *   1. relay reachable on SN_BRAIN_PORT (default 4175) + its counters;
 *   2. pet bridge reachable on SN_RELAY_PET_PORT (default 4174), both as seen
 *      by this process and as reported by the relay itself;
 *   3. data dir writable, today's log file presence/size;
 *   4. loop-config sanity (relay port != pet port).
 *
 * Exit code: 0 when no FAIL (WARNs allowed — e.g. pet not running is a WARN).
 *
 * Usage: node orchestrator/health-check.js
 */
const fs = require('fs');
const path = require('path');
const { createEventLog } = require('./event-log');
const { HOST, probeLinks } = require('./health-probe');

const RELAY_PORT = Number(process.env.SN_BRAIN_PORT || 4175);
const PET_PORT = Number(process.env.SN_RELAY_PET_PORT || 4174);

let fails = 0;
const ok = (l) => console.log('  OK    ' + l);
const warn = (l) => console.log('  WARN  ' + l);
const fail = (l) => { fails++; console.log('  FAIL  ' + l); };

async function main() {
  console.log(`[brain health-check] relay=${HOST}:${RELAY_PORT}  pet=${HOST}:${PET_PORT}\n`);
  const health = await probeLinks({ relayPort: RELAY_PORT, petPort: PET_PORT, timeoutMs: 500 });

  // 4) loop config first — a misconfig here invalidates everything else
  if (!health.loopOk) fail(`loop config: SN_BRAIN_PORT == SN_RELAY_PET_PORT (${RELAY_PORT})`);
  else ok(`loop config sane (relay ${RELAY_PORT} -> pet ${PET_PORT})`);

  // 1) relay
  if (!health.relay.up) {
    fail(`relay not reachable on ${RELAY_PORT} — start it with: node orchestrator/relay.js`);
  } else {
    const c = health.relay.counters || {};
    ok(`relay up (received=${c.received || 0} forwarded=${c.forwarded || 0} missed=${c.missed || 0} rejected=${c.rejected || 0})`);
    if (health.relay.petReachable) ok('relay -> pet forwarding path reachable');
    else warn('relay reports pet NOT reachable (start the pet: cd codex-task-pet && npm start)');
    if ((c.missed || 0) > 0) warn(`${c.missed} event(s) missed since relay start (pet was down at the time)`);
  }

  // 2) pet directly (independent of the relay's view)
  if (health.pet.up) ok(`pet bridge up (${health.pet.json.app || 'unknown'} protocol ${health.pet.json.protocolVersion || '?'})`);
  else warn(`pet bridge not reachable on ${PET_PORT} (events will be logged with forward:"missed")`);

  // 3) data dir + today's log
  const log = createEventLog();
  try {
    fs.mkdirSync(log.dir, { recursive: true });
    const probe = path.join(log.dir, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    ok(`data dir writable: ${log.dir}`);
  } catch (e) {
    fail(`data dir not writable: ${log.dir} (${e && e.message})`);
  }
  try {
    const st = fs.statSync(log.currentFile());
    ok(`today's log: ${path.basename(log.currentFile())} (${st.size} bytes)`);
  } catch (_) {
    warn(`today's log not created yet: ${path.basename(log.currentFile())} (appears on first event)`);
  }

  console.log('\n' + (fails === 0 ? 'HEALTH OK' + ' (WARNs above, if any, are non-fatal)' : fails + ' FAILURE(S)'));
  process.exit(fails === 0 ? 0 : 1);
}

main();
