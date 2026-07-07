'use strict';
/*
 * event-log.js — minimal append-only JSONL event log for the brain relay
 * (Phase 3.1). One file per day: <dataDir>/events-YYYYMMDD.jsonl
 *
 * Privacy contract: callers only pass { at, envelope, forward } records where
 * `envelope` is a signal-protocol envelope ALREADY redacted by the adapters.
 * Nothing else (headers, raw sockets, prompts, tool output) is ever logged.
 *
 * Behaviour contract: append() never throws — a logging failure must never
 * take the relay down or delay a response.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '..', '.supernono');

function dayStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

function createEventLog(dirOverride) {
  const dir = dirOverride || process.env.SN_BRAIN_DATA_DIR || DEFAULT_DIR;
  let ensured = false;

  function currentFile() {
    return path.join(dir, 'events-' + dayStamp(new Date()) + '.jsonl');
  }

  function append(record) {
    try {
      if (!ensured) { fs.mkdirSync(dir, { recursive: true }); ensured = true; }
      fs.appendFileSync(currentFile(), JSON.stringify(record) + '\n');
      return true;
    } catch (_) {
      return false; // logging must never break the relay
    }
  }

  return { append, currentFile, dir };
}

module.exports = { createEventLog };
