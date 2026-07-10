'use strict';
/*
 * relay.js — SuperNoNo brain relay (Phase 3.1).
 *
 *   agent adapters ──(SUPERNONO_BRIDGE_PORT=4175)──► this relay (127.0.0.1:4175)
 *                                                        │ 1) log envelope + forward status (JSONL)
 *                                                        │ 2) forward the RAW body byte-for-byte
 *                                                        ▼
 *                                            pet bridge (127.0.0.1:4174 /signal)
 *
 * Contracts (design doc: docs/planning/phase-3-orchestrator-plan.md §4):
 *   - TRANSPARENT: the original request body is forwarded unmodified — the
 *     relay never rewrites type/agent/adapter/sessionId/taskId/payload, never
 *     reorders keys, never strips unknown fields.
 *   - NEVER HURT AGENTS: valid events are answered { ok:true, accepted:true }
 *     IMMEDIATELY; forwarding happens asynchronously afterwards, so upstream
 *     hook latency does not depend on whether the pet is running. If the pet
 *     is down the event is still logged with forward:"missed".
 *   - PRIVACY: only the (adapter-redacted) envelope and forward status are
 *     logged. No headers, no raw sockets, no derived content.
 *
 * Env:
 *   SN_BRAIN_PORT      relay listen port          (default 4175)
 *   SN_RELAY_PET_PORT  downstream pet bridge port (default 4174) — deliberately
 *                      a DIFFERENT variable from SUPERNONO_BRIDGE_PORT so that
 *                      exporting SUPERNONO_BRIDGE_PORT=4175 for adapters can
 *                      never make the relay forward to itself.
 *   SN_BRAIN_DATA_DIR  JSONL log directory        (default <repo>/.supernono)
 *
 * Run:   node orchestrator/relay.js
 * Test:  node orchestrator/relay-fixture-test.js
 */
const http = require('http');
const { createEventLog } = require('./event-log');
const { createWorkStore } = require('./work-store');

const HOST = '127.0.0.1';
const MAX_BODY = 64 * 1024;        // mirror the pet bridge limit
const FORWARD_TIMEOUT_MS = 800;    // mirror adapter sender behaviour
const RELAY_VERSION = '0.1.0';

function startRelay(options) {
  options = options || {};
  // options.port may legitimately be 0 (ephemeral, used by tests) — don't ||-default it away.
  const listenPort = Number(options.port !== undefined ? options.port : (process.env.SN_BRAIN_PORT || 4175));
  const petPort = Number(options.petPort !== undefined ? options.petPort : (process.env.SN_RELAY_PET_PORT || 4174));
  const log = createEventLog(options.dataDir);
  const workStore = createWorkStore(options.dataDir);
  const quiet = !!options.quiet;
  let ingestWarned = false; // warn once, not per event

  if (listenPort === petPort) {
    throw new Error(
      `refusing to start: relay port (${listenPort}) equals pet port (${petPort}) — this would forward events to itself`
    );
  }

  const counters = { received: 0, forwarded: 0, missed: 0, rejected: 0, startedAt: new Date().toISOString() };
  const say = (...a) => { if (!quiet) console.log('[brain-relay]', ...a); };

  const json = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  /** Forward the raw body bytes to the pet bridge. Resolves a status record. */
  function forwardToPet(rawBody) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      try {
        const req = http.request(
          {
            host: HOST, port: petPort, path: '/signal', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': rawBody.length },
            timeout: FORWARD_TIMEOUT_MS,
          },
          (res) => {
            res.resume();
            const ok = res.statusCode >= 200 && res.statusCode < 300;
            resolve({ status: ok ? 'ok' : 'missed', petStatus: res.statusCode, ms: Date.now() - t0 });
          }
        );
        req.on('error', (err) => resolve({ status: 'missed', error: shortErr(err), ms: Date.now() - t0 }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 'missed', error: 'timeout', ms: Date.now() - t0 }); });
        req.write(rawBody);
        req.end();
      } catch (err) {
        resolve({ status: 'missed', error: shortErr(err), ms: Date.now() - t0 });
      }
    });
  }

  function shortErr(err) {
    return String((err && (err.code || err.message)) || 'error').slice(0, 60);
  }

  /** Probe the pet bridge /health (for our own /health report). */
  function probePet() {
    return new Promise((resolve) => {
      try {
        const req = http.request(
          { host: HOST, port: petPort, path: '/health', method: 'GET', timeout: 500 },
          (res) => { res.resume(); resolve(res.statusCode === 200); }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      } catch (_) { resolve(false); }
    });
  }

  const server = http.createServer((req, res) => {
    // Browser pages always send an Origin header; local adapters never do.
    // Reject them so a web page cannot inject fake events through the relay.
    if (req.headers.origin) { counters.rejected++; return json(res, 403, { ok: false, error: 'forbidden' }); }

    if (req.method === 'GET' && req.url === '/health') {
      return probePet().then((petReachable) => json(res, 200, {
        ok: true,
        app: 'SuperNoNoBrainRelay',
        role: 'relay',
        protocolVersion: RELAY_VERSION,
        listen: `http://${HOST}:${listenPort}`,
        pet: { target: `http://${HOST}:${petPort}`, reachable: petReachable },
        logFile: log.currentFile(),
        counters,
      }));
    }

    if (req.method !== 'POST' || req.url !== '/signal') {
      return json(res, 404, { ok: false, error: 'not found' });
    }

    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        aborted = true;
        counters.rejected++;
        json(res, 413, { ok: false, error: 'payload too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      const rawBody = Buffer.concat(chunks);

      // Defensive parse + minimal envelope validation (mirror the pet bridge:
      // JSON object with a non-empty string `type`). The parsed object is used
      // ONLY for validation and logging — forwarding uses the raw bytes.
      let envelope;
      try {
        envelope = JSON.parse(rawBody.toString('utf8') || '{}');
      } catch (_) {
        counters.rejected++;
        return json(res, 400, { ok: false, error: 'invalid json' });
      }
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
        counters.rejected++;
        return json(res, 400, { ok: false, error: 'invalid envelope' });
      }
      const type = typeof envelope.type === 'string' ? envelope.type.trim() : '';
      if (!type) {
        counters.rejected++;
        return json(res, 400, { ok: false, error: 'missing type' });
      }

      counters.received++;
      // Answer the upstream hook NOW — its latency must not depend on the pet.
      json(res, 200, { ok: true, accepted: true });

      // Then forward + log + bookkeep asynchronously (one JSONL line per event).
      forwardToPet(rawBody).then((forward) => {
        if (forward.status === 'ok') counters.forwarded++;
        else counters.missed++;
        log.append({ at: new Date().toISOString(), envelope, forward });
        // Work bookkeeping (Phase 3.2): create/update the AgentRun for this
        // envelope. ingestEvent never throws; a store failure (e.g. corrupted
        // state file) must never affect forwarding or the upstream hook.
        const ingest = workStore.ingestEvent(envelope);
        if (!ingest.ok && !ingestWarned) {
          ingestWarned = true; // warn once; ingest keeps being retried per event
          say('work-store ingest failing (forwarding unaffected):', ingest.error);
        }
      });
    });

    req.on('error', () => { try { res.destroy(); } catch (_) { /* ignore */ } });
  });

  server.on('error', (err) => say('server error:', shortErr(err)));

  return new Promise((resolve, reject) => {
    server.once('error', reject); // e.g. port already in use at bind time
    server.listen(listenPort, HOST, () => {
      server.removeListener('error', reject);
      say(`listening:  http://${HOST}:${listenPort}  (POST /signal, GET /health)`);
      say(`forwarding: http://${HOST}:${petPort}/signal`);
      say(`event log:  ${log.currentFile()}`);
      say(`work store: ${workStore.filePath}`);
      resolve({
        server,
        port: listenPort,
        petPort,
        counters,
        logFile: () => log.currentFile(),
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { startRelay };

/* ---- CLI ------------------------------------------------------------------ */
if (require.main === module) {
  // A relay crash means silent event loss for every agent, so log-and-continue
  // beats dying on an unexpected edge (the request handlers are all defensive
  // already; this is a last-resort net).
  process.on('uncaughtException', (err) => console.error('[brain-relay] uncaught:', err && err.message));
  process.on('unhandledRejection', (err) => console.error('[brain-relay] unhandled:', err && err.message));

  startRelay().then(() => {
    console.log('[brain-relay] point adapters here with: SUPERNONO_BRIDGE_PORT=' + (process.env.SN_BRAIN_PORT || 4175));
    console.log('[brain-relay] Ctrl+C to stop.');
  }).catch((err) => {
    if (err && err.code === 'EADDRINUSE') {
      const port = process.env.SN_BRAIN_PORT || 4175;
      console.error(`[brain-relay] failed to start: port ${port} is already in use; 可能已有 relay 在跑。`);
      console.error('[brain-relay] Try: node orchestrator/health-check.js  or stop the existing relay before starting a new one.');
      process.exit(1);
      return;
    }
    console.error('[brain-relay] failed to start:', err && err.message);
    process.exit(1);
  });
}
