'use strict';
/*
 * health-probe.js - small shared loopback health probes for the brain relay and
 * pet bridge. Used by both the standalone health-check and `work.js status`.
 */
const http = require('http');

const HOST = '127.0.0.1';
const DEFAULT_RELAY_PORT = 4175;
const DEFAULT_PET_PORT = 4174;
const DEFAULT_TIMEOUT_MS = 500;

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function defaultRelayPort() { return num(process.env.SN_BRAIN_PORT, DEFAULT_RELAY_PORT); }
function defaultPetPort() { return num(process.env.SN_RELAY_PET_PORT, DEFAULT_PET_PORT); }

function getJson(port, urlPath, timeoutMs) {
  const timeout = num(timeoutMs, DEFAULT_TIMEOUT_MS);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    try {
      const req = http.request(
        { host: HOST, port, path: urlPath, method: 'GET', timeout, agent: false },
        (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(body); } catch (_) { /* ignore */ }
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, ms: Date.now() - startedAt });
          });
        }
      );
      req.on('error', (err) => resolve({ ok: false, status: 0, error: shortErr(err), ms: Date.now() - startedAt }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout', ms: Date.now() - startedAt }); });
      req.end();
    } catch (err) {
      resolve({ ok: false, status: 0, error: shortErr(err), ms: Date.now() - startedAt });
    }
  });
}

function shortErr(err) {
  return String((err && (err.code || err.message)) || 'error').slice(0, 80);
}

async function probeLinks(options) {
  options = options || {};
  const relayPort = num(options.relayPort !== undefined ? options.relayPort : process.env.SN_BRAIN_PORT, DEFAULT_RELAY_PORT);
  const petPort = num(options.petPort !== undefined ? options.petPort : process.env.SN_RELAY_PET_PORT, DEFAULT_PET_PORT);
  const timeoutMs = num(options.timeoutMs, DEFAULT_TIMEOUT_MS);

  const loopOk = relayPort !== petPort;
  const [relay, pet] = await Promise.all([
    loopOk ? getJson(relayPort, '/health', timeoutMs) : Promise.resolve({ ok: false, status: 0, error: 'loop-config' }),
    getJson(petPort, '/health', timeoutMs),
  ]);

  const relayUp = !!(relay && relay.ok && relay.json && relay.json.ok === true);
  const petUp = !!(pet && pet.ok && pet.json && pet.json.ok === true);
  const relayPetReachable = relayUp && relay.json.pet ? relay.json.pet.reachable === true : null;

  return {
    host: HOST,
    relayPort,
    petPort,
    timeoutMs,
    loopOk,
    relay: {
      up: relayUp,
      status: relay && relay.status,
      error: relay && relay.error,
      json: relay && relay.json,
      counters: relayUp ? (relay.json.counters || {}) : {},
      petReachable: relayPetReachable,
    },
    pet: {
      up: petUp,
      status: pet && pet.status,
      error: pet && pet.error,
      json: pet && pet.json,
    },
  };
}

function formatLinkHealthLine(health) {
  const relay = health.relay.up ? 'up' : 'down';
  const pet = health.pet.up ? 'up' : 'down';
  let path = 'unknown';
  if (!health.loopOk) path = 'loop-config-error';
  else if (health.relay.up && health.relay.petReachable !== null) path = health.relay.petReachable ? 'up' : 'down';
  const extra = [];
  if (health.relay.up && health.relay.counters) {
    const c = health.relay.counters;
    extra.push(`events received=${c.received || 0} missed=${c.missed || 0}`);
  }
  if (!health.loopOk) extra.push('SN_BRAIN_PORT equals SN_RELAY_PET_PORT');
  return `Link health: relay=${relay}(:${health.relayPort}) pet=${pet}(:${health.petPort}) relay->pet=${path}${extra.length ? '  [' + extra.join('; ') + ']' : ''}`;
}

module.exports = {
  HOST,
  DEFAULT_RELAY_PORT,
  DEFAULT_PET_PORT,
  DEFAULT_TIMEOUT_MS,
  getJson,
  probeLinks,
  formatLinkHealthLine,
};
