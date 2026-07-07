'use strict';

const path = require('path');
const u = require('./settings-utils');

function main() {
  const args = u.parseArgs(process.argv.slice(2));
  const settingsPath = u.settingsPathFromArgs(args);
  const before = u.readSettings(settingsPath);
  const after = u.installHooks(JSON.parse(JSON.stringify(before)), { node: args.node || 'node' });

  if (args.dryRun) {
    console.log('[supernono] dry run: would install Claude Code hooks into ' + settingsPath);
    console.log(JSON.stringify(u.countAdapterHooks(after), null, 2));
    return;
  }

  const backup = u.backupSettings(settingsPath);
  u.writeSettings(settingsPath, after);
  const counts = u.countAdapterHooks(after);
  console.log('[supernono] installed Claude Code hooks');
  console.log('  settings: ' + settingsPath);
  if (backup) console.log('  backup:   ' + backup);
  console.log('  hooks:    ' + JSON.stringify(counts.byEvent));
  console.log('  next:     restart Claude Code session for settings to take effect');
}

try { main(); }
catch (err) {
  console.error('[supernono] install failed: ' + (err && err.message || err));
  process.exit(1);
}