'use strict';
/* Phase 3.4/3.5 workflow CLI fixture test. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-workflow-test-'));
function cli(args) {
  const res = spawnSync(process.execPath, [path.join(__dirname, 'work.js'), ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, SN_BRAIN_DATA_DIR: dir },
  });
  return { code: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

let r = cli(['workflow', 'review-loop', 'Ship', 'brain', 'relay', '--goal', 'Codex builds and Claude reviews']);
check(r.code === 0 && /OK workflow review-loop created: ws1/.test(r.out), 'review-loop created session');
check(/wi1 -> codex/.test(r.out), 'build item assigned to codex');
check(/wi2 -> claude-code/.test(r.out), 'review item assigned to claude-code');
check(/dr1 -> decision/.test(r.out), 'decision created');
r = cli(['status']);
check(r.code === 0 && /Codex implement: Ship brain relay/.test(r.out), 'status shows codex item');
check(r.code === 0 && /Claude Code review: Ship brain relay/.test(r.out), 'status shows claude review item');
r = cli(['summary']);
check(r.code === 0 && /OK summary written:/.test(r.out), 'summary command works');
const summaryDir = path.join(dir, 'summaries');
const summaries = fs.existsSync(summaryDir) ? fs.readdirSync(summaryDir).filter((f) => f.endsWith('.md')) : [];
check(summaries.length === 1, 'summary markdown file exists');
const body = fs.readFileSync(path.join(summaryDir, summaries[0]), 'utf8');
check(body.includes('Codex implement: Ship brain relay'), 'summary includes build item');
check(body.includes('Claude Code review: Ship brain relay'), 'summary includes review item');

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
