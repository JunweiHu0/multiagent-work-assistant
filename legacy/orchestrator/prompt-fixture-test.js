'use strict';
/* Phase 3.8 prompt generator fixture test. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-prompt-test-'));
function cli(args) {
  const res = spawnSync(process.execPath, [path.join(__dirname, 'work.js'), ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, SN_BRAIN_DATA_DIR: dir },
  });
  return { code: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

let r = cli(['workflow', 'review-loop', 'Improve', 'summary', '--goal', 'Make the summary useful']);
check(r.code === 0, 'review-loop created');
r = cli(['prompt', 'codex', 'wi1']);
check(r.code === 0 && /OK prompt written:/.test(r.out), 'codex prompt command works');
check(/Please work on this SuperNoNo WorkItem as Codex/.test(r.out), 'codex prompt has role header');
check(/Do not read or expose secrets/.test(r.out), 'codex prompt includes safety boundary');
r = cli(['prompt', 'claude', 'wi2']);
check(r.code === 0 && /Please review this SuperNoNo WorkItem as Claude Code/.test(r.out), 'claude prompt command works');
check(/go\/no-go recommendation/.test(r.out), 'claude prompt asks for go/no-go');
r = cli(['prompt', 'review-loop']);
check(r.code === 0 && /# Review-loop handoff prompts/.test(r.out), 'review-loop prompt command works');
check(/Prompt for Codex/.test(r.out) && /Prompt for Claude Code/.test(r.out), 'review-loop prompt includes both agents');
const promptDir = path.join(dir, 'prompts');
const prompts = fs.existsSync(promptDir) ? fs.readdirSync(promptDir).filter((f) => f.endsWith('.md')) : [];
check(prompts.length === 3, 'three prompt files written');

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
