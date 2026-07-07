'use strict';

const u = require('./settings-utils');

function main() {
  const args = u.parseArgs(process.argv.slice(2));
  const settingsPath = u.settingsPathFromArgs(args);
  const before = u.readSettings(settingsPath);
  const after = u.removeAdapterHooks(JSON.parse(JSON.stringify(before)));

  if (args.dryRun) {
    console.log('[supernono] dry run: would remove Claude Code hooks from ' + settingsPath);
    console.log(JSON.stringify(u.countAdapterHooks(before), null, 2));
    return;
  }

  const backup = u.backupSettings(settingsPath);
  u.writeSettings(settingsPath, after);
  console.log('[supernono] removed Claude Code hooks');
  console.log('  settings: ' + settingsPath);
  if (backup) console.log('  backup:   ' + backup);
  console.log('  next:     restart Claude Code session for settings to take effect');
}

try { main(); }
catch (err) {
  console.error('[supernono] uninstall failed: ' + (err && err.message || err));
  process.exit(1);
}