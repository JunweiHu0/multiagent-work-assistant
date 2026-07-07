'use strict';

const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');
const { sendSignal } = require('./send-signal');
const u = require('./settings-utils');

function checkBridge(port) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 600 }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.end();
  });
}

function line(status, label, detail) {
  const mark = status === 'ok' ? 'OK  ' : status === 'warn' ? 'WARN' : 'FAIL';
  console.log(mark + '  ' + label + (detail ? ' — ' + detail : ''));
}

async function main() {
  const args = u.parseArgs(process.argv.slice(2));
  const settingsPath = u.settingsPathFromArgs(args);
  const nodeCmd = args.node || 'node';
  let hardFail = false;

  console.log('[supernono] Claude Code adapter health check');
  console.log('settings: ' + settingsPath);

  const node = spawnSync(nodeCmd, ['-v'], { encoding: 'utf8' });
  if (node.status === 0) line('ok', 'node resolves', (node.stdout || '').trim());
  else { line('fail', 'node resolves', node.error ? node.error.message : (node.stderr || 'not found').trim()); hardFail = true; }

  for (const f of u.adapterFiles()) {
    const ok = fs.existsSync(f);
    line(ok ? 'ok' : 'fail', 'adapter file', f);
    if (!ok) hardFail = true;
  }

  let settings = null;
  try { settings = u.readSettings(settingsPath); line(fs.existsSync(settingsPath) ? 'ok' : 'warn', 'settings readable', fs.existsSync(settingsPath) ? 'exists' : 'missing'); }
  catch (err) { line('fail', 'settings readable', err.message); hardFail = true; }

  if (settings) {
    const counts = u.countAdapterHooks(settings);
    const installed = counts.byEvent.PreToolUse >= 1 && counts.byEvent.PostToolUse >= 1 && counts.byEvent.Stop >= 1;
    line(installed ? 'ok' : 'fail', 'adapter hooks installed', JSON.stringify(counts.byEvent));
    if (!installed) hardFail = true;
    const dupes = Object.values(counts.byEvent).some((n) => n > 1);
    line(dupes ? 'warn' : 'ok', 'duplicate adapter hooks', dupes ? JSON.stringify(counts.byEvent) : 'none');
  }

  const bridgePort = Number(process.env.SUPERNONO_BRIDGE_PORT || 4174);
  const bridge = await checkBridge(bridgePort);
  line(bridge.ok ? 'ok' : 'warn', 'SuperNoNo bridge', bridge.ok ? 'http://127.0.0.1:' + bridgePort + '/health' : (bridge.error || bridge.status));

  if (args.sendTest) {
    const sent = await sendSignal({ type: 'turn_ended', payload: { action: 'Claude Code adapter health check' } });
    line(sent.ok ? 'ok' : 'warn', 'send test signal', sent.ok ? 'status ' + sent.status : sent.error);
  }

  if (hardFail) process.exit(1);
}

main().catch((err) => {
  console.error('[supernono] health check failed: ' + (err && err.message || err));
  process.exit(1);
});