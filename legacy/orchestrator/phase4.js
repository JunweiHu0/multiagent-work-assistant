'use strict';
/*
 * phase4.js - semi-automatic brain helpers.
 *
 * Phase 4 keeps the orchestrator conservative: it drafts plans, accepts plans
 * into the existing work store, packages copyable prompts, and writes decision
 * briefs. It does not call an LLM, spawn agents, authorize tools, or read
 * prompt/transcript/source/diff/tool-output content.
 */
const fs = require('fs');
const path = require('path');
const { createWorkStore } = require('./work-store');
const { assistantEvent, sendWorkbenchSignal } = require('./workbench-signal');
const { renderCodexPrompt, renderClaudePrompt } = require('./prompt');

const DEFAULT_DIR = path.join(__dirname, '..', '.supernono');

function dataDir(dirOverride) { return dirOverride || process.env.SN_BRAIN_DATA_DIR || DEFAULT_DIR; }
function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
function safeText(v, max) { return (typeof v === 'string' ? v : '').replace(/[\r\n]+/g, ' ').trim().slice(0, max || 240); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function short(v) { const s = typeof v === 'string' ? v : ''; return s.length > 12 ? s.slice(0, 8) + '...' : s; }

function normalizeMode(mode) {
  const value = mode || 'review-loop';
  if (value !== 'review-loop') throw new Error('Phase 4 planner currently supports only --mode review-loop');
  return value;
}

function buildPlanDraft(title, options) {
  options = options || {};
  const cleanTitle = safeText(title, 200);
  if (!cleanTitle) throw new Error('plan draft needs a title');
  const mode = normalizeMode(options.mode);
  const goal = safeText(options.goal || cleanTitle, 500);
  const createdAt = new Date().toISOString();
  return {
    schema: 'supernono.planDraft.v1',
    draftId: 'pd-' + stamp(new Date()),
    createdAt,
    mode,
    title: cleanTitle,
    goal,
    workItems: [
      {
        id: 'pwi1',
        title: 'Codex implement: ' + cleanTitle,
        role: 'build',
        assignedAgent: 'codex',
        notes: 'Keep implementation scoped. Report changed files, checks, and risks.',
      },
      {
        id: 'pwi2',
        title: 'Claude Code review: ' + cleanTitle,
        role: 'review',
        assignedAgent: 'claude-code',
        after: ['pwi1'],
        notes: 'Review correctness, integration risk, missing tests, and product fit before fixes.',
      },
    ],
    decisionGates: [
      {
        id: 'pdr1',
        kind: 'manual',
        itemRef: 'pwi2',
        summary: 'Accept the review result for: ' + cleanTitle,
      },
    ],
    checklist: [
      'Start relay before agent work: node orchestrator/relay.js',
      'Copy generated prompts into Codex and Claude Code manually.',
      'Link observed AgentRuns with work.js item link.',
      'Resolve the decision gate manually.',
      'Generate summary with work.js summary --notify.',
    ],
    constraints: [
      'No automatic agent spawn.',
      'No automatic authorization.',
      'No prompt/transcript/source/diff/tool-output ingestion.',
    ],
    acceptedAt: null,
    acceptedSessionId: null,
  };
}

function renderPlanMarkdown(draft) {
  const lines = [];
  lines.push('# SuperNoNo Plan Draft');
  lines.push('');
  lines.push('- Draft: ' + draft.draftId);
  lines.push('- Mode: ' + draft.mode);
  lines.push('- Title: ' + draft.title);
  lines.push('- Goal: ' + draft.goal);
  lines.push('- Created: ' + draft.createdAt);
  lines.push('');
  lines.push('## Work Items');
  for (const item of draft.workItems || []) {
    lines.push(`- ${item.id} [${item.role}] ${item.title} -> ${item.assignedAgent || 'unassigned'}`);
    if (item.after && item.after.length) lines.push('  - after: ' + item.after.join(', '));
    if (item.notes) lines.push('  - notes: ' + item.notes);
  }
  lines.push('');
  lines.push('## Decision Gates');
  for (const d of draft.decisionGates || []) lines.push(`- ${d.id}: ${d.summary}${d.itemRef ? ' (item ' + d.itemRef + ')' : ''}`);
  if (!(draft.decisionGates || []).length) lines.push('- None.');
  lines.push('');
  lines.push('## Checklist');
  for (const c of draft.checklist || []) lines.push('- ' + c);
  lines.push('');
  lines.push('## Accept');
  lines.push('```cmd');
  lines.push('node orchestrator\\work.js plan accept ' + path.basename(draft.jsonPath || '<plan-json>'));
  lines.push('```');
  lines.push('');
  lines.push('## Safety');
  for (const c of draft.constraints || []) lines.push('- ' + c);
  lines.push('');
  return lines.join('\n');
}

function writePlanDraft(title, options) {
  options = options || {};
  const dir = dataDir(options.dataDir);
  const outDir = options.outDir || path.join(dir, 'plans');
  ensureDir(outDir);
  const draft = buildPlanDraft(title, options);
  const base = 'plan-' + stamp(new Date());
  const jsonPath = options.outPath || path.join(outDir, base + '.json');
  const mdPath = jsonPath.replace(/\.json$/i, '.md');
  draft.jsonPath = jsonPath;
  draft.mdPath = mdPath;
  fs.writeFileSync(jsonPath, JSON.stringify(draft, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderPlanMarkdown(draft), 'utf8');
  return { draft, jsonPath, mdPath };
}

function readPlanDraft(planPath) {
  if (!planPath) throw new Error('plan accept needs a plan JSON path');
  const raw = fs.readFileSync(planPath, 'utf8');
  const draft = JSON.parse(raw);
  if (!draft || draft.schema !== 'supernono.planDraft.v1') throw new Error('not a SuperNoNo plan draft: ' + planPath);
  if (!Array.isArray(draft.workItems)) throw new Error('plan draft missing workItems');
  return draft;
}

function acceptPlan(planPath, options) {
  options = options || {};
  const draft = readPlanDraft(planPath);
  if (draft.acceptedAt && !options.force) {
    throw new Error('plan already accepted into ' + draft.acceptedSessionId + ' (use --force to accept again)');
  }
  const store = createWorkStore(dataDir(options.dataDir));
  const ws = store.startSession(draft.title, draft.goal);
  const itemMap = {};
  const acceptedItems = [];
  for (const draftItem of draft.workItems) {
    const item = store.addItem(draftItem.title, { role: draftItem.role || 'build' });
    let finalItem = item;
    if (draftItem.assignedAgent) finalItem = store.assignItem(item.id, draftItem.assignedAgent);
    itemMap[draftItem.id] = finalItem.id;
    acceptedItems.push(finalItem);
  }
  const acceptedDecisions = [];
  for (const gate of draft.decisionGates || []) {
    const decision = store.addDecision(gate.summary, { itemId: gate.itemRef ? itemMap[gate.itemRef] : null, kind: gate.kind || 'manual' });
    acceptedDecisions.push(decision);
  }
  draft.acceptedAt = new Date().toISOString();
  draft.acceptedSessionId = ws.id;
  draft.acceptedItems = acceptedItems.map((i) => i.id);
  draft.acceptedDecisions = acceptedDecisions.map((d) => d.id);
  fs.writeFileSync(planPath, JSON.stringify(draft, null, 2), 'utf8');
  return { ws, items: acceptedItems, decisions: acceptedDecisions, itemMap, draft };
}

function getStatus(dirOverride) {
  return createWorkStore(dataDir(dirOverride)).getStatus();
}

function selectSession(status, sessionId) {
  if (sessionId) {
    const ws = status.sessions.find((s) => s.id === sessionId);
    if (!ws) throw new Error('session not found: ' + sessionId);
    return ws;
  }
  return status.activeSession || status.sessions[status.sessions.length - 1] || null;
}

function renderGenericPrompt(status, item) {
  const ws = selectSession(status, item.sessionId);
  return [
    'Please work on this SuperNoNo WorkItem as a generic CLI agent.',
    '',
    'Context:',
    '- WorkSession: ' + (ws ? `${ws.id} ${safeText(ws.title)}` : 'none'),
    '- WorkItem: ' + `${item.id} [${item.status}] ${safeText(item.title)}`,
    '- Role: ' + item.role,
    '',
    'Rules:',
    '- Keep the work scoped to this item.',
    '- Report commands, changed files, verification, and risks.',
    '- Do not expose secrets, transcripts, prompt text, source bodies, diffs, or tool output bodies.',
  ].join('\n');
}

function promptForItem(status, item) {
  if (item.assignedAgent === 'codex') return renderCodexPrompt(status, item);
  if (item.assignedAgent === 'claude-code') return renderClaudePrompt(status, item);
  return renderGenericPrompt(status, item);
}

function renderPromptPackIndex(ws, items, files) {
  const lines = [];
  lines.push('# SuperNoNo Prompt Pack');
  lines.push('');
  lines.push('- Session: ' + ws.id + ' ' + safeText(ws.title));
  if (ws.goal) lines.push('- Goal: ' + safeText(ws.goal, 500));
  lines.push('');
  lines.push('## Prompts');
  for (const f of files.filter((x) => x.kind === 'agent')) lines.push('- ' + path.basename(f.path) + ' -> ' + f.itemId + ' / ' + f.agent);
  lines.push('');
  lines.push('## User Checklist');
  lines.push('- Start relay: `node orchestrator\\relay.js`');
  lines.push('- Copy each prompt into its target agent manually.');
  lines.push('- Check observed runs: `node orchestrator\\work.js status`');
  for (const item of items) lines.push('- Link ' + item.id + ': `node orchestrator\\work.js item link ' + item.id + ' <agent:sessionId>`');
  lines.push('- Resolve decisions: `node orchestrator\\work.js decision brief <drId> --notify`, then `node orchestrator\\work.js decision resolve <drId> accept|reject|note`');
  lines.push('- Finish with: `node orchestrator\\work.js summary --notify`');
  lines.push('');
  lines.push('## Safety');
  lines.push('- Prompt pack is metadata-only and manually copied. It does not spawn agents.');
  return lines.join('\n');
}

function writePromptPack(sessionId, options) {
  options = options || {};
  const dir = dataDir(options.dataDir);
  const status = getStatus(dir);
  const ws = selectSession(status, sessionId);
  if (!ws) throw new Error('no session available for prompt pack');
  const items = status.items.filter((i) => i.sessionId === ws.id);
  const outDir = options.outDir || path.join(dir, 'prompts', ws.id);
  ensureDir(outDir);
  const files = [];
  for (const item of items) {
    const agent = item.assignedAgent || 'generic-cli';
    const file = path.join(outDir, agent + '-' + item.id + '.md');
    fs.writeFileSync(file, promptForItem(status, item), 'utf8');
    files.push({ kind: 'agent', path: file, itemId: item.id, agent });
  }
  const checklist = path.join(outDir, 'user-checklist.md');
  fs.writeFileSync(checklist, renderPromptPackIndex(ws, items, files), 'utf8');
  files.push({ kind: 'checklist', path: checklist });
  const index = path.join(outDir, 'README.md');
  fs.writeFileSync(index, renderPromptPackIndex(ws, items, files), 'utf8');
  files.push({ kind: 'index', path: index });
  return { session: ws, items, outDir, files };
}

function runsForItem(status, item) {
  return item ? (item.runs || []).map((rid) => status.runs.find((r) => r.id === rid)).filter(Boolean) : [];
}

function renderDecisionBrief(status, decision) {
  const item = decision.workItemId ? status.items.find((i) => i.id === decision.workItemId) : null;
  const runs = runsForItem(status, item);
  const lines = [];
  lines.push('# SuperNoNo Decision Brief');
  lines.push('');
  lines.push('- Decision: ' + decision.id + ' [' + (decision.resolvedAt ? 'resolved' : 'open') + ']');
  lines.push('- Summary: ' + safeText(decision.summary, 300));
  lines.push('- Kind: ' + decision.kind);
  if (decision.resolution) lines.push('- Resolution: ' + decision.resolution + ' at ' + decision.resolvedAt);
  if (item) lines.push('- Related item: ' + item.id + ' [' + item.status + '] ' + safeText(item.title, 200));
  lines.push('');
  lines.push('## Agent Context');
  if (!runs.length) lines.push('- No linked AgentRuns yet. Use `work.js status` and `item link` before deciding if needed.');
  for (const run of runs) {
    const counts = Object.entries(run.eventCounts || {}).map(([k, v]) => k + ' x' + v).join(', ') || 'none';
    lines.push('- ' + run.id + ' ' + run.agent + ':' + short(run.agentSessionId) + ' [' + run.state + '], last=' + run.lastEventType + ', events=' + counts);
  }
  lines.push('');
  lines.push('## Options');
  lines.push('- accept: proceed with the reviewed result.');
  lines.push('- reject: do not accept; create/follow up with another WorkItem.');
  lines.push('- note: record that the user made a manual note or deferred the decision.');
  lines.push('');
  lines.push('## Commands');
  lines.push('```cmd');
  lines.push('node orchestrator\\work.js decision resolve ' + decision.id + ' accept');
  lines.push('node orchestrator\\work.js decision resolve ' + decision.id + ' reject');
  lines.push('node orchestrator\\work.js decision resolve ' + decision.id + ' note');
  lines.push('```');
  lines.push('');
  lines.push('## Safety');
  lines.push('- Metadata-only: no prompt, transcript, source, diff, tool output, token, or secret is included.');
  lines.push('');
  return lines.join('\n');
}

function writeDecisionBrief(decisionId, options) {
  options = options || {};
  const dir = dataDir(options.dataDir);
  const status = getStatus(dir);
  const decision = status.decisions.find((d) => d.id === decisionId);
  if (!decision) throw new Error('decision not found: ' + decisionId);
  const body = renderDecisionBrief(status, decision);
  const outDir = options.outDir || path.join(dir, 'briefs');
  ensureDir(outDir);
  const outPath = options.outPath || path.join(outDir, 'decision-' + decision.id + '-' + stamp(new Date()) + '.md');
  fs.writeFileSync(outPath, body, 'utf8');
  return { outPath, body, decision };
}

function sendAssistantDecisionBrief(outPath, decision, options) {
  const event = assistantEvent('permission_required', {
    action: 'Decision needed: ' + safeText(decision.summary, 120),
    command: 'Resolve decision ' + decision.id,
    decisionId: decision.id,
    artifact: outPath,
    artifacts: [{ title: 'Decision brief ' + decision.id, path: outPath }],
    source: 'workbench-decision-brief',
  }, { taskId: decision.id });
  return sendWorkbenchSignal(event, options || {});
}

async function sendAssistantDecisionResolved(decision, options) {
  options = options || {};
  const approved = decision && decision.resolution === 'accept';
  const resolved = await sendWorkbenchSignal(assistantEvent('permission_resolved', {
    action: 'Decision resolved: ' + safeText(decision && decision.summary, 120),
    approved,
    resolution: decision && decision.resolution,
    decisionId: decision && decision.id,
    source: 'workbench-decision-resolve',
  }, { taskId: decision && decision.id }), options);
  // Close the lifecycle with a settle event. Without it the pet keeps the
  // assistant entry in its previous visual state forever (a resumePhase would
  // park it in an eternal "thinking" — working states never decay; and with
  // no resumePhase the visual stays waiting_approval). turn_ended settles the
  // assistant back to idle so it stops holding pet focus after the decision.
  await sendWorkbenchSignal(assistantEvent('turn_ended', {
    action: 'Workbench decision flow finished',
    source: 'workbench-decision-resolve',
  }, { taskId: decision && decision.id }), options);
  return resolved;
}
module.exports = {
  buildPlanDraft,
  writePlanDraft,
  readPlanDraft,
  acceptPlan,
  renderPlanMarkdown,
  writePromptPack,
  renderDecisionBrief,
  writeDecisionBrief,
  sendAssistantDecisionBrief,
  sendAssistantDecisionResolved,
};
