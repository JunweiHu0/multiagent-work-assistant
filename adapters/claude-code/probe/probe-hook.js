'use strict';
/*
 * probe-hook.js — Claude Code hooks diagnostic probe (Phase 2.1).
 *
 * Wired temporarily into Claude Code's settings hooks, this script records ONLY:
 *   - the hook execution environment: cwd, PATH, which node runs it, whether
 *     bare `node` resolves on PATH (the known Codex-hook pitfall on Windows),
 *     and which CLAUDE_* env var NAMES exist;
 *   - the SHAPE of the stdin payload: field names + value types
 *     (string(len=N) / array[N] / nested keys to depth 3). NEVER values.
 *
 * Hard privacy rules (same as the Codex notify probe in codex-task-pet):
 *   - no prompt text, no source code, no diffs, no tokens/secrets;
 *   - transcript_path is described as a shape only and NEVER read;
 *   - Notification messages are reduced to length + derived booleans;
 *   - sensitive-looking keys are redacted before their type is described.
 *
 * Behaviour rules:
 *   - never throws into Claude Code; always exits 0;
 *   - writes NOTHING to stdout (PreToolUse hook stdout can carry permission
 *     decisions — this probe must be a pure observer);
 *   - appends one JSON line per invocation to probe-observed.jsonl (gitignored).
 *
 * Usage (configured in settings, see docs/claude-code/claude-code-hooks-probe-plan.md):
 *   node <abs-path>/probe-hook.js <EventLabel>
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'probe-observed.jsonl');
const SENSITIVE_KEY = /(token|api[_-]?key|authorization|auth|secret|password|passwd|pwd|credential|cookie|private[_-]?key|access[_-]?key)/i;
const MAX_DEPTH = 3;
const SAFE_ID = /^[A-Za-z0-9._\-]{1,80}$/; // tool names / event names are plain identifiers

/* ---- shape description (types only, never values) ----------------------- */

function describeValue(v, depth) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array[' + v.length + ']';
  const t = typeof v;
  if (t === 'string') return 'string(len=' + v.length + ')';
  if (t === 'object') return depth < MAX_DEPTH ? describeShape(v, depth + 1) : 'object(depth-limited)';
  return t; // number, boolean, ...
}

function describeShape(obj, depth) {
  depth = depth || 1;
  const shape = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return shape;
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY.test(k)) { shape[k] = '[redacted-key]'; continue; }
    shape[k] = describeValue(v, depth);
  }
  return shape;
}

/* ---- environment probes -------------------------------------------------- */

// Does a bare `node` resolve on this hook's PATH? (Codex Desktop lesson:
// hooks there run WITHOUT node on PATH and need an absolute path.)
function findNodeOnPath() {
  try {
    const names = process.platform === 'win32' ? ['node.exe', 'node.cmd', 'node.bat'] : ['node'];
    const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const d of dirs) {
      for (const n of names) {
        try { if (fs.existsSync(path.join(d, n))) return path.join(d, n); } catch (_) { /* ignore */ }
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

function claudeEnvNames() {
  try {
    return Object.keys(process.env).filter((k) => k.toUpperCase().startsWith('CLAUDE')).sort();
  } catch (_) { return []; }
}

function readStdin() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8'); // fd 0 = stdin
  } catch (_) { return ''; }
}

/* ---- main ----------------------------------------------------------------- */

function main() {
  const raw = readStdin();
  let payload = null;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && !Array.isArray(o)) payload = o;
  } catch (_) { /* keep payload = null */ }
  const p = payload || {};

  const record = {
    observedAt: new Date().toISOString(),
    // which settings entry invoked us (we pass the event name as argv[2])
    argvLabel: typeof process.argv[2] === 'string' ? process.argv[2].slice(0, 40) : null,

    /* -- execution environment (the questions this probe exists to answer) -- */
    cwd: String(process.cwd()).slice(0, 300),
    execPath: process.execPath,
    nodeVersion: process.version,
    platform: process.platform,
    nodeOnPath: findNodeOnPath(),          // null => bare `node` would NOT spawn
    pathEntryCount: String(process.env.PATH || '').split(path.delimiter).filter(Boolean).length,
    envPath: String(process.env.PATH || ''), // recorded on purpose (probe plan §privacy)
    claudeEnvNames: claudeEnvNames(),       // env var NAMES only, never values

    /* -- payload structure (shape only) ------------------------------------ */
    stdinBytes: raw.length,
    stdinParsed: payload !== null,
    hookEventName: (typeof p.hook_event_name === 'string' && SAFE_ID.test(p.hook_event_name)) ? p.hook_event_name : null,
    toolName: (typeof p.tool_name === 'string' && p.tool_name.length <= 120) ? p.tool_name : null,
    payloadShape: describeShape(p, 1),

    // Notification classification WITHOUT storing the text: adapter design
    // needs to know if permission requests are distinguishable from idle pings.
    notificationFlags: typeof p.message === 'string' ? {
      len: p.message.length,
      mentionsPermission: /permission|approv|授权|批准/i.test(p.message),
      mentionsWaiting: /waiting|idle|input|等待/i.test(p.message),
    } : null,
  };

  fs.appendFileSync(OUT, JSON.stringify(record) + '\n');
}

try { main(); } catch (_) { /* a probe must never hurt Claude Code */ }
process.exit(0);
