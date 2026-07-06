'use strict';
/*
 * manual-fixture-test.js — Phase 2.2.0 adapter verification. No Claude Code
 * and no SuperNoNo needed: it starts a FAKE bridge (in-process HTTP server on
 * an ephemeral port), pipes realistic hook payloads (field shapes taken from
 * real probe records) into the three hook entries, and asserts:
 *
 *   1. mapping:   Bash -> command_running, Read -> file_reading,
 *                 Write -> file_editing, PostToolUse -> step_done,
 *                 Stop -> turn_ended; out-of-scope tools emit NOTHING;
 *   2. envelope:  agent/adapter fixed, sessionId from payload with
 *                 CLAUDE_CODE_SESSION_ID env fallback, taskId null;
 *   3. redaction: fake secret / source / prompt / full path markers never
 *                 reach the bridge; commands truncated; files basename-only;
 *   4. hygiene:   every hook exits 0 with EMPTY stdout;
 *   5. silence:   with no bridge listening, hooks still exit 0 fast.
 *
 * Usage:  node adapters/claude-code/manual-fixture-test.js
 */
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const DIR = __dirname;
const SID = '11111111-2222-3333-4444-555555555555';

const LEAK_MARKERS = [
  'sk-FAKESECRET123456',
  'const leakedSource = 42',
  'FAKE_PROMPT_DO_NOT_FORWARD',
  'C:/deep/secret/tree/auth-module', // full path must not leak (basename ok)
  'leaked stdout body',
];

let failures = 0;
function check(cond, label) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label);
  if (!cond) failures++;
}

/** Run one hook script with the given stdin + env; resolve {code, stdout}. */
function runHook(script, payload, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(DIR, script)], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', (code) => resolve({ code, stdout }));
    child.stdin.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
    child.stdin.end();
  });
}

async function main() {
  // ---- fake bridge -------------------------------------------------------
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { received.push(JSON.parse(body)); } catch (_) { /* ignore */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = String(server.address().port);
  const env = { SUPERNONO_BRIDGE_PORT: port };

  const last = () => received[received.length - 1];

  // ---- 1. PreToolUse Bash (with fake secret) -> command_running ----------
  let r = await runHook('pre-tool-use.js', {
    session_id: SID, transcript_path: 'C:/fake/t.jsonl', cwd: 'C:/fake', hook_event_name: 'PreToolUse',
    tool_name: 'Bash', tool_use_id: 'toolu_0000000000000000000000',
    tool_input: { command: 'curl -H "Authorization: Bearer sk-FAKESECRET123456" https://api.example.com && npm run build', description: 'build' },
  }, env);
  check(r.code === 0 && r.stdout === '', 'Bash pre: exit 0, empty stdout');
  check(received.length === 1 && last().type === 'command_running', 'Bash -> command_running');
  check(last().agent === 'claude-code' && last().adapter === 'claude-code-hooks', 'agent/adapter fixed');
  check(last().sessionId === SID && last().taskId === null, 'sessionId from payload, taskId null');
  check(last().payload.isTest === true, 'TEST_RX flags npm run build as test/build');
  check((last().payload.command || '').length <= 80, 'command summary truncated <= 80');

  // ---- 2. PreToolUse Bash npm test (no secret) ----------------------------
  r = await runHook('pre-tool-use.js', {
    session_id: SID, hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'echo hello' },
  }, env);
  check(received.length === 2 && last().payload.isTest === false, 'plain echo: isTest false');

  // ---- 3. PreToolUse Read (deep path) -> file_reading, basename only ------
  r = await runHook('pre-tool-use.js', {
    session_id: SID, hook_event_name: 'PreToolUse', tool_name: 'Read',
    tool_input: { file_path: 'C:/deep/secret/tree/auth-module/auth.ts' },
  }, env);
  check(last().type === 'file_reading' && last().payload.file === 'auth.ts', 'Read -> file_reading, basename only');

  // ---- 4. PreToolUse Grep (pattern may carry source) -> generic copy ------
  r = await runHook('pre-tool-use.js', {
    session_id: SID, hook_event_name: 'PreToolUse', tool_name: 'Grep',
    tool_input: { pattern: 'const leakedSource = 42', path: 'C:/deep/secret/tree' },
  }, env);
  check(last().type === 'file_reading' && !JSON.stringify(last()).includes('leakedSource'), 'Grep -> file_reading, pattern not forwarded');

  // ---- 5. PreToolUse Write (content = source) -> file_editing --------------
  r = await runHook('pre-tool-use.js', {
    session_id: SID, hook_event_name: 'PreToolUse', tool_name: 'Write',
    tool_input: { file_path: 'C:/deep/secret/tree/auth-module/new.ts', content: 'const leakedSource = 42' },
  }, env);
  check(last().type === 'file_editing' && last().payload.file === 'new.ts', 'Write -> file_editing, basename only');

  // ---- 6. PreToolUse out-of-scope tools -> NOTHING -------------------------
  const before = received.length;
  await runHook('pre-tool-use.js', { session_id: SID, hook_event_name: 'PreToolUse', tool_name: 'Task', tool_input: { prompt: 'FAKE_PROMPT_DO_NOT_FORWARD' } }, env);
  await runHook('pre-tool-use.js', { session_id: SID, hook_event_name: 'PreToolUse', tool_name: 'mcp__foo__bar', tool_input: {} }, env);
  check(received.length === before, 'Task / mcp__* emit nothing (out of 2.2.0 scope)');

  // ---- 7. PostToolUse -> step_done, tool_response never read ---------------
  r = await runHook('post-tool-use.js', {
    session_id: SID, hook_event_name: 'PostToolUse', tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: 'leaked stdout body', stderr: '', interrupted: false, isImage: false },
    duration_ms: 1234,
  }, env);
  check(r.code === 0 && r.stdout === '', 'PostToolUse: exit 0, empty stdout');
  check(last().type === 'step_done', 'PostToolUse -> step_done');
  check(last().payload.rule === undefined, 'no testPass rule without success signal (2.2.x)');

  // ---- 8. Stop -> turn_ended, last_assistant_message never read ------------
  r = await runHook('stop.js', {
    session_id: SID, hook_event_name: 'Stop', stop_hook_active: false,
    last_assistant_message: 'FAKE_PROMPT_DO_NOT_FORWARD',
  }, env);
  check(last().type === 'turn_ended' && last().sessionId === SID, 'Stop -> turn_ended with sessionId');

  // ---- 9. sessionId env fallback -------------------------------------------
  r = await runHook('stop.js', { hook_event_name: 'Stop' }, { ...env, CLAUDE_CODE_SESSION_ID: 'env-fallback-session' });
  check(last().sessionId === 'env-fallback-session', 'sessionId falls back to CLAUDE_CODE_SESSION_ID');

  // ---- 10. malformed stdin --------------------------------------------------
  r = await runHook('pre-tool-use.js', 'this is not json {{{', env);
  check(r.code === 0 && r.stdout === '', 'malformed stdin: exit 0, empty stdout, no crash');

  // ---- 11. global leak check ------------------------------------------------
  const wire = JSON.stringify(received);
  for (const m of LEAK_MARKERS) check(!wire.includes(m), 'no leak on the wire: ' + m.slice(0, 28) + '...');

  server.close();

  // ---- 12. silent failure: no bridge listening ------------------------------
  const t0 = Date.now();
  r = await runHook('pre-tool-use.js', { session_id: SID, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo x' } }, { SUPERNONO_BRIDGE_PORT: '1' });
  check(r.code === 0 && r.stdout === '', 'no bridge: exit 0, empty stdout');
  check(Date.now() - t0 < 5000, 'no bridge: fails fast (' + (Date.now() - t0) + 'ms)');

  console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
  process.exit(failures === 0 ? 0 : 1);
}

main();
