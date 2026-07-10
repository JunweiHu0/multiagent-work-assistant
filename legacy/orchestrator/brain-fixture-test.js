'use strict';
/* Phase 5 fixture test: Node -> Python planner boundary. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkStore } = require('./work-store');
const { buildPlannerInput, runPythonPlanner, writePythonPlanDraft } = require('./brain');

let failures = 0;
const check = (c, l) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) failures++; };

const python = process.env.SN_PYTHON || process.env.PYTHON;
if (!python) {
  console.log('SKIP: set SN_PYTHON or PYTHON to run the Python brain fixture test.');
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-brain-test-'));
const store = createWorkStore(dir);
store.startSession('Existing session', 'Make sure context is metadata-only');
store.addItem('Existing item from prior context', { role: 'build' });
store.assignItem('wi1', 'codex');
store.ingestEvent({ type: 'command_running', agent: 'codex', adapter: 'codex-plugin-hooks', sessionId: 'codex-s1', payload: { command: 'SECRET_SHOULD_NOT_APPEAR' } });

const input = buildPlannerInput('Ship Python brain', { dataDir: dir, goal: 'Validate Node Python boundary' });
check(input.schema === 'supernono.brainPlannerInput.v1', 'planner input schema set');
check(input.context.activeSession && input.context.activeSession.id === 'ws1', 'metadata context includes active session');
check(JSON.stringify(input).includes('Existing item'), 'metadata context includes item title');
check(!JSON.stringify(input).includes('SECRET_SHOULD_NOT_APPEAR'), 'planner input excludes event payload bodies');

const draft = runPythonPlanner(input, { python });
check(draft.schema === 'supernono.planDraft.v1', 'Python returned plan draft schema');
check(draft.workItems.length === 2, 'Python draft has two work items');
check(draft.workItems[0].assignedAgent === 'codex', 'Python draft assigns builder to codex');
check(draft.workItems[1].assignedAgent === 'claude-code', 'Python draft assigns reviewer to claude-code');
check(Array.isArray(draft.decisionGates) && draft.decisionGates.length === 1, 'Python draft has decision gate');
check(draft.planner && draft.planner.kind === 'python-deterministic', 'Python draft records planner kind');

const written = writePythonPlanDraft('Ship Python brain', { dataDir: dir, goal: 'Validate write path', python });
const jsonBody = fs.readFileSync(written.jsonPath, 'utf8');
const mdBody = fs.readFileSync(written.mdPath, 'utf8');
check(fs.existsSync(written.jsonPath), 'brain plan JSON written');
check(fs.existsSync(written.mdPath), 'brain plan Markdown written');
check(jsonBody.includes('python-deterministic'), 'written JSON includes Python planner metadata');
check(mdBody.includes('# SuperNoNo Plan Draft'), 'written Markdown reuses plan renderer');
check(!jsonBody.includes('SECRET_SHOULD_NOT_APPEAR'), 'written JSON excludes sensitive payload marker');
check(!mdBody.includes('SECRET_SHOULD_NOT_APPEAR'), 'written Markdown excludes sensitive payload marker');

const originalSnPython = process.env.SN_PYTHON;
const originalPython = process.env.PYTHON;
const badCmd = path.join(dir, 'bad-json-python.cmd');
fs.writeFileSync(badCmd, '@echo off\r\necho not-json\r\n', 'utf8');
try {
  process.env.SN_PYTHON = badCmd;
  process.env.PYTHON = python;
  const fallbackDraft = runPythonPlanner(input, {});
  check(fallbackDraft.schema === 'supernono.planDraft.v1', 'bad JSON Python candidate falls through to next candidate');
} finally {
  if (originalSnPython === undefined) delete process.env.SN_PYTHON; else process.env.SN_PYTHON = originalSnPython;
  if (originalPython === undefined) delete process.env.PYTHON; else process.env.PYTHON = originalPython;
}
console.log('\\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);

