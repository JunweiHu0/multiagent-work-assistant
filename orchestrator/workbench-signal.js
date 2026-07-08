'use strict';
/*
 * workbench-signal.js - assistant/workbench signal sender.
 *
 * Used by summary/decision workflows to notify the pet. It tries relay first
 * (4175) and falls back to the direct pet bridge (4174) so direct mode remains
 * usable when the relay is not running.
 */
const http = require('http');

const SEND_TIMEOUT_MS = 800;

function unique(values) {
  const out = [];
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

function targetPorts(options) {
  options = options || {};
  if (Array.isArray(options.ports)) return unique(options.ports);
  if (options.port) return unique([options.port]);
  return unique([
    process.env.SN_SUMMARY_NOTIFY_PORT,
    process.env.SN_BRAIN_PORT,
    process.env.SUPERNONO_BRIDGE_PORT,
    4175,
    4174,
  ]);
}

function postToPort(port, event, options) {
  options = options || {};
  const raw = JSON.stringify(event);
  const timeout = Number(options.timeoutMs || SEND_TIMEOUT_MS);
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port, path: '/signal', method: 'POST', timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, port }));
    });
    req.on('error', (err) => resolve({ ok: false, port, error: String((err && (err.code || err.message)) || 'error').slice(0, 80) }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, port, error: 'timeout' }); });
    req.write(raw);
    req.end();
  });
}

async function sendWorkbenchSignal(event, options) {
  const attempts = [];
  for (const port of targetPorts(options)) {
    const result = await postToPort(port, event, options);
    attempts.push(result);
    if (result.ok) return { ...result, attempts };
  }
  const last = attempts[attempts.length - 1] || { ok: false, port: null, error: 'no target ports' };
  return { ...last, ok: false, attempts };
}

function assistantEvent(type, payload, options) {
  options = options || {};
  return {
    type,
    agent: 'assistant',
    adapter: 'workbench',
    sessionId: options.sessionId || 'workbench',
    taskId: options.taskId || null,
    payload: payload || {},
  };
}

module.exports = { sendWorkbenchSignal, assistantEvent, targetPorts };
