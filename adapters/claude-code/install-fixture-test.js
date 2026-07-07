'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const u = require('./settings-utils');

let failures = 0;
function check(cond, label) {
  console.log((cond ? 'PASS ' : 'FAIL ') + label);
  if (!cond) failures++;
}
function run(script, args) {
  return spawnSync(process.execPath, [path.join(__dirname, script), ...args], { encoding: 'utf8' });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supernono-claude-install-'));
const settings = path.join(tmp, '.claude', 'settings.json');
fs.mkdirSync(path.dirname(settings), { recursive: true });
fs.writeFileSync(settings, JSON.stringify({
  hooks: {
    PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'node keep-existing.js', timeout: 5 }] }],
    Notification: [{ hooks: [{ type: 'command', command: 'node notify-existing.js', timeout: 5 }] }],
  },
}, null, 2), 'utf8');

let r = run('install.js', ['--settings', settings]);
check(r.status === 0, 'install exits 0');
let installed = u.readSettings(settings);
let counts = u.countAdapterHooks(installed);
check(counts.byEvent.PreToolUse === 1, 'installs PreToolUse hook');
check(counts.byEvent.PostToolUse === 1, 'installs PostToolUse hook');
check(counts.byEvent.Stop === 1, 'installs Stop hook');
check(installed.hooks.Notification.length === 1, 'preserves unrelated Notification hooks');
check(installed.hooks.PreToolUse.some((e) => String((e.hooks && e.hooks[0] && e.hooks[0].command) || '').includes('keep-existing.js')), 'preserves unrelated PreToolUse hooks');
check(fs.readdirSync(path.dirname(settings)).some((f) => f.includes('supernono-backup')), 'creates backup before install');

r = run('install.js', ['--settings', settings]);
check(r.status === 0, 'second install exits 0');
installed = u.readSettings(settings);
counts = u.countAdapterHooks(installed);
check(counts.byEvent.PreToolUse === 1 && counts.byEvent.PostToolUse === 1 && counts.byEvent.Stop === 1, 'install is idempotent');

r = run('health-check.js', ['--settings', settings]);
check(r.status === 0, 'health check exits 0 when installed');

r = run('uninstall.js', ['--settings', settings]);
check(r.status === 0, 'uninstall exits 0');
const after = u.readSettings(settings);
counts = u.countAdapterHooks(after);
check(counts.count === 0, 'uninstall removes adapter hooks');
check(after.hooks.Notification.length === 1, 'uninstall preserves unrelated hooks');
check(after.hooks.PreToolUse.length === 1, 'uninstall preserves unrelated PreToolUse entry');

if (failures) {
  console.error('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nALL PASS');