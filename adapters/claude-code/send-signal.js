'use strict';
/*
 * send-signal.js — dependency-free sender for the SuperNoNo unified signal
 * protocol (POST http://127.0.0.1:4174/signal, loopback only).
 *
 * VENDORED from codex-task-pet adapters/shared/send-signal.js (commit 2b26ac8);
 * the two repos are intentionally decoupled, so this copy lives here with only
 * the defaults changed (agent/adapter -> claude-code). Keep behaviour in sync
 * conceptually, not literally.
 *
 * Uses only Node's built-in `http` and NEVER throws: if the pet isn't running
 * (or anything else fails) the send resolves silently so the calling hook can
 * never crash or block Claude Code.
 *
 * It only relays STATE. A `command` field is descriptive text for the pet UI;
 * this sender never executes it.
 */
const http = require('http');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.SUPERNONO_BRIDGE_PORT || 4174);
const DEFAULT_AGENT = 'claude-code';
const DEFAULT_ADAPTER = 'claude-code-hooks';
const DEFAULT_TIMEOUT_MS = 800;

/**
 * Send one protocol event to the SuperNoNo bridge.
 * Always resolves to { ok, status?, error? }; never rejects, never throws.
 */
function sendSignal(event, options) {
  return new Promise((resolve) => {
    try {
      event = event || {};
      options = options || {};

      const type = typeof event.type === 'string' ? event.type.trim() : '';
      if (!type) { resolve({ ok: false, error: 'missing type' }); return; }

      const envelope = {
        type,
        agent: event.agent || DEFAULT_AGENT,
        adapter: event.adapter || DEFAULT_ADAPTER,
        sessionId: event.sessionId || null,
        taskId: event.taskId || null,
        payload: (event.payload && typeof event.payload === 'object') ? event.payload : {},
      };

      const data = Buffer.from(JSON.stringify(envelope));
      const req = http.request(
        {
          host: options.host || DEFAULT_HOST,
          port: Number(options.port || DEFAULT_PORT),
          path: '/signal',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
          timeout: Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
        },
        (res) => {
          res.resume(); // drain so the socket can close
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
        }
      );

      // Pet not running / timeout / any transport error -> resolve silently.
      req.on('error', (err) => resolve({ ok: false, error: (err && err.message) || 'request error' }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });

      req.write(data);
      req.end();
    } catch (err) {
      resolve({ ok: false, error: (err && err.message) || 'send failed' });
    }
  });
}

module.exports = { sendSignal, DEFAULT_PORT, DEFAULT_AGENT, DEFAULT_ADAPTER };
