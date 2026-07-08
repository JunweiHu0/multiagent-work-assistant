'use strict';
/*
 * brain.js - Node <-> Python brain boundary (Phase 5 spike).
 *
 * Node keeps the local device layer: hooks, relay, CLI, and pet-facing glue.
 * Python gets a narrow stdin/stdout JSON slot for deeper planning logic. The
 * Python script receives metadata only and returns a plan draft. No agent is
 * spawned, no LLM API is called, and Python never enters hook hot paths.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createWorkStore } = require('./work-store');
const { renderPlanMarkdown } = require('./phase4');

const DEFAULT_DIR = path.join(__dirname, '..', '.supernono');
const PLANNER = path.join(__dirname, '..', 'brain-python', 'planner.py');
const TIMEOUT_MS = 5000;

function dataDir(dirOverride) { return dirOverride || process.env.SN_BRAIN_DATA_DIR || DEFAULT_DIR; }
function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
function safeText(v, max) { return (typeof v === 'string' ? v : '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 240); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function pythonCandidates(options) {
  options = options || {};
  const out = [];
  function add(command, args, label) {
    if (command) out.push({ command, args: args || [], label: label || command });
  }
  add(options.python || process.env.SN_PYTHON, [], 'SN_PYTHON');
  add(process.env.PYTHON, [], 'PYTHON');
  add('python', [], 'python');
  add('py', ['-3'], 'py -3');
  add('python3', [], 'python3');
  return out.filter((c, idx, arr) => c.command && arr.findIndex((x) => x.command === c.command && x.args.join('\u0000') === c.args.join('\u0000')) === idx);
}

function compactStatus(status) {
  const ws = status.activeSession || status.sessions[status.sessions.length - 1] || null;
  return {
    activeSession: ws ? { id: ws.id, title: ws.title, goal: ws.goal, status: ws.status } : null,
    openDecisions: status.openDecisions.map((d) => ({ id: d.id, summary: d.summary, workItemId: d.workItemId, kind: d.kind })).slice(0, 20),
    items: status.items.map((i) => ({ id: i.id, title: i.title, role: i.role, assignedAgent: i.assignedAgent, status: i.status })).slice(-30),
    runs: status.runs.map((r) => ({ id: r.id, agent: r.agent, state: r.state, lastEventType: r.lastEventType })).slice(-30),
  };
}

function buildPlannerInput(title, options) {
  options = options || {};
  const cleanTitle = safeText(title, 200);
  if (!cleanTitle) throw new Error('brain plan needs a title');
  const store = createWorkStore(dataDir(options.dataDir));
  let status;
  try { status = store.getStatus(); }
  catch (_) { status = { activeSession: null, sessions: [], openDecisions: [], items: [], runs: [] }; }
  return {
    schema: 'supernono.brainPlannerInput.v1',
    title: cleanTitle,
    goal: safeText(options.goal, 500) || cleanTitle,
    mode: options.mode || 'review-loop',
    context: compactStatus(status),
  };
}

function validateDraft(draft) {
  if (!draft || typeof draft !== 'object') throw new Error('Python planner returned non-object JSON');
  if (draft.schema !== 'supernono.planDraft.v1') throw new Error('Python planner returned unsupported schema: ' + draft.schema);
  if (!Array.isArray(draft.workItems) || draft.workItems.length === 0) throw new Error('Python planner returned no workItems');
  for (const item of draft.workItems) {
    if (!item.id || !item.title || !item.role) throw new Error('Python planner returned invalid workItem');
  }
  if (draft.decisionGates && !Array.isArray(draft.decisionGates)) throw new Error('Python planner returned invalid decisionGates');
  return draft;
}

function runPythonPlanner(input, options) {
  options = options || {};
  const candidates = pythonCandidates(options);
  if (!candidates.length) throw new Error('No Python command configured. Set SN_PYTHON to a python executable.');
  const raw = JSON.stringify(input);
  const errors = [];

  for (const c of candidates) {
    const args = c.args.concat([options.script || PLANNER]);
    const res = spawnSync(c.command, args, {
      input: raw,
      encoding: 'utf8',
      timeout: options.timeoutMs || TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 256 * 1024,
    });
    if (res.error) {
      errors.push(`${c.label}: ${res.error.code || res.error.message}`);
      continue;
    }
    if (res.status !== 0) {
      const stderr = String(res.stderr || '').trim().slice(0, 500);
      errors.push(`${c.label}: exit ${res.status}${stderr ? ' - ' + stderr : ''}`);
      continue;
    }
    let draft;
    try { draft = JSON.parse(res.stdout); }
    catch (e) {
      errors.push(`${c.label}: invalid JSON from Python planner: ${e.message}`);
      continue;
    }
    try {
      draft.python = { command: c.command, label: c.label, script: path.relative(path.join(__dirname, '..'), options.script || PLANNER).replace(/\\/g, '/') };
      return validateDraft(draft);
    } catch (e) {
      errors.push(`${c.label}: ${e.message}`);
      continue;
    }
  }

  throw new Error('Python planner failed. Tried: ' + errors.join('; '));
}

function writePythonPlanDraft(title, options) {
  options = options || {};
  const dir = dataDir(options.dataDir);
  const outDir = options.outDir || path.join(dir, 'plans');
  ensureDir(outDir);
  const input = buildPlannerInput(title, options);
  const draft = runPythonPlanner(input, options);
  const base = 'brain-plan-' + stamp(new Date());
  const jsonPath = options.outPath || path.join(outDir, base + '.json');
  const mdPath = jsonPath.replace(/\.json$/i, '.md');
  draft.jsonPath = jsonPath;
  draft.mdPath = mdPath;
  draft.brainInput = { schema: input.schema, mode: input.mode, title: input.title };
  fs.writeFileSync(jsonPath, JSON.stringify(draft, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderPlanMarkdown(draft), 'utf8');
  return { draft, jsonPath, mdPath, input };
}

function checkPythonBrain(options) {
  const input = { schema: 'supernono.brainPlannerInput.v1', title: 'Brain health check', goal: 'Verify Python planner', mode: 'review-loop', context: {} };
  const draft = runPythonPlanner(input, options || {});
  return { ok: true, draftId: draft.draftId, planner: draft.planner || draft.python };
}

module.exports = {
  buildPlannerInput,
  runPythonPlanner,
  writePythonPlanDraft,
  checkPythonBrain,
  pythonCandidates,
  validateDraft,
};
