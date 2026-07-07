'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ADAPTER_DIR = __dirname;
const SCRIPT_NAMES = ['pre-tool-use.js', 'post-tool-use.js', 'stop.js'];
const DEFAULT_MATCHER = 'Bash|Read|Grep|Glob|WebFetch|WebSearch|Write|Edit|MultiEdit|NotebookEdit';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user') out.user = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
    else if (a === '--send-test') out.sendTest = true;
    else if (a === '--settings') out.settings = argv[++i];
    else if (a === '--project') out.project = argv[++i];
    else if (a === '--node') out.node = argv[++i];
    else out._.push(a);
  }
  return out;
}

function settingsPathFromArgs(args, cwd) {
  cwd = cwd || process.cwd();
  if (args.settings) return path.resolve(args.settings);
  if (args.user) return path.join(os.homedir(), '.claude', 'settings.json');
  const project = args.project ? path.resolve(args.project) : cwd;
  return path.join(project, '.claude', 'settings.json');
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('settings.json must contain an object');
  }
  return parsed;
}

function writeSettings(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backupSettings(file) {
  if (!fs.existsSync(file)) return null;
  const backup = file + '.supernono-backup-' + timestamp();
  fs.copyFileSync(file, backup);
  return backup;
}

function asArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function quoteCommandPart(s) {
  s = String(s || '');
  return /\s/.test(s) ? '"' + s.replace(/"/g, '\\"') + '"' : s;
}

function commandFor(scriptName, nodeCmd) {
  return quoteCommandPart(nodeCmd || 'node') + ' "' + path.join(ADAPTER_DIR, scriptName) + '"';
}

function isAdapterCommand(command) {
  const c = String(command || '').toLowerCase().replace(/\\/g, '/');
  if (!c.includes('/adapters/claude-code/')) return false;
  return SCRIPT_NAMES.some((s) => c.includes('/' + s.toLowerCase()));
}

function ensureHooks(settings) {
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }
  return settings.hooks;
}

function removeAdapterHooks(settings) {
  const hooks = ensureHooks(settings);
  for (const eventName of Object.keys(hooks)) {
    const nextEntries = [];
    for (const entry of asArray(hooks[eventName])) {
      if (!entry || typeof entry !== 'object') continue;
      const keptHooks = asArray(entry.hooks).filter((h) => !isAdapterCommand(h && h.command));
      if (!keptHooks.length) continue;
      nextEntries.push({ ...entry, hooks: keptHooks });
    }
    if (nextEntries.length) hooks[eventName] = nextEntries;
    else delete hooks[eventName];
  }
  return settings;
}

function installHooks(settings, options) {
  options = options || {};
  const nodeCmd = options.node || 'node';
  removeAdapterHooks(settings);
  const hooks = ensureHooks(settings);

  hooks.PreToolUse = asArray(hooks.PreToolUse);
  hooks.PostToolUse = asArray(hooks.PostToolUse);
  hooks.Stop = asArray(hooks.Stop);

  hooks.PreToolUse.push({
    matcher: DEFAULT_MATCHER,
    hooks: [{ type: 'command', command: commandFor('pre-tool-use.js', nodeCmd), timeout: 10 }],
  });
  hooks.PostToolUse.push({
    hooks: [{ type: 'command', command: commandFor('post-tool-use.js', nodeCmd), timeout: 10 }],
  });
  hooks.Stop.push({
    hooks: [{ type: 'command', command: commandFor('stop.js', nodeCmd), timeout: 10 }],
  });
  return settings;
}

function countAdapterHooks(settings) {
  const hooks = ensureHooks(settings);
  let count = 0;
  const byEvent = {};
  for (const eventName of Object.keys(hooks)) {
    let n = 0;
    for (const entry of asArray(hooks[eventName])) {
      for (const h of asArray(entry && entry.hooks)) {
        if (isAdapterCommand(h && h.command)) { count++; n++; }
      }
    }
    if (n) byEvent[eventName] = n;
  }
  return { count, byEvent };
}

function adapterFiles() {
  return SCRIPT_NAMES.map((s) => path.join(ADAPTER_DIR, s));
}

module.exports = {
  ADAPTER_DIR,
  SCRIPT_NAMES,
  DEFAULT_MATCHER,
  parseArgs,
  settingsPathFromArgs,
  readSettings,
  writeSettings,
  backupSettings,
  removeAdapterHooks,
  installHooks,
  countAdapterHooks,
  commandFor,
  isAdapterCommand,
  adapterFiles,
};