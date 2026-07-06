'use strict';
/*
 * fixture-test.js — self-test for probe-hook.js. No Claude Code needed.
 *
 * Pipes realistic fixture payloads for each hook event into the probe and
 * verifies the four guarantees:
 *   1. exit code 0 and EMPTY stdout for every event (pure observer);
 *   2. one JSONL record appended per invocation;
 *   3. shape-only recording — the fixtures contain marker strings (a fake
 *      secret, fake source code, a fake prompt); NONE may appear in the log;
 *   4. malformed stdin (non-JSON) does not crash the probe.
 *
 * Usage:  node adapters/claude-code/probe/fixture-test.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROBE = path.join(__dirname, 'probe-hook.js');
const OUT = path.join(__dirname, 'probe-observed.jsonl');

// Marker strings that MUST NOT leak into probe-observed.jsonl.
const LEAK_MARKERS = [
  'sk-FAKESECRET123456',
  'const leakedSourceCode = 42',
  'FAKE_PROMPT_TEXT_DO_NOT_RECORD',
  'C:/fake/leaked/path/deep/file.ts',
];

const FIXTURES = [
  ['PreToolUse', {
    session_id: 'sess-fixture-1', transcript_path: 'C:/fake/transcript.jsonl', cwd: 'C:/fake/project',
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'npm test --token sk-FAKESECRET123456', description: 'run tests' },
  }],
  ['PreToolUse', {
    session_id: 'sess-fixture-1', hook_event_name: 'PreToolUse', tool_name: 'Edit',
    tool_input: { file_path: 'C:/fake/leaked/path/deep/file.ts', old_string: 'const leakedSourceCode = 42', new_string: 'const leakedSourceCode = 43' },
  }],
  ['PostToolUse', {
    session_id: 'sess-fixture-1', hook_event_name: 'PostToolUse', tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: 'const leakedSourceCode = 42', stderr: '', interrupted: false },
  }],
  ['Notification', {
    session_id: 'sess-fixture-1', hook_event_name: 'Notification',
    message: 'Claude needs your permission to use Bash',
  }],
  ['Stop', {
    session_id: 'sess-fixture-1', hook_event_name: 'Stop', stop_hook_active: false,
  }],
  ['SessionStart', {
    session_id: 'sess-fixture-1', hook_event_name: 'SessionStart', source: 'startup',
  }],
  // hostile inputs: prompt-ish content and broken JSON
  ['Notification', {
    session_id: 'sess-fixture-1', hook_event_name: 'Notification',
    message: 'FAKE_PROMPT_TEXT_DO_NOT_RECORD',
  }],
  ['Broken', 'this is not json {{{'],
];

let failures = 0;
function check(cond, label) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label);
  if (!cond) failures++;
}

function main() {
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).length : 0;

  for (const [label, payload] of FIXTURES) {
    const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const res = spawnSync(process.execPath, [PROBE, label], { input, encoding: 'utf8', timeout: 10000 });
    check(res.status === 0, `${label}: exit 0`);
    check((res.stdout || '') === '', `${label}: empty stdout`);
  }

  const lines = fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean);
  check(lines.length === before + FIXTURES.length, `one record per invocation (${lines.length - before}/${FIXTURES.length})`);

  const newLog = lines.slice(before).join('\n');
  for (const marker of LEAK_MARKERS) {
    check(!newLog.includes(marker), `no leak: ${marker.slice(0, 30)}...`);
  }

  // spot-check the latest well-formed record for the fields the probe exists to capture
  const rec = JSON.parse(lines[lines.length - 2]); // second-to-last = hostile Notification (parsed ok)
  check(typeof rec.cwd === 'string' && typeof rec.envPath === 'string', 'env fields recorded');
  check(rec.notificationFlags && typeof rec.notificationFlags.len === 'number', 'notification reduced to flags');
  const broken = JSON.parse(lines[lines.length - 1]); // last = broken JSON
  check(broken.stdinParsed === false && broken.stdinBytes > 0, 'malformed stdin handled without crash');

  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
  process.exit(failures === 0 ? 0 : 1);
}

main();
