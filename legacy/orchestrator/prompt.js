'use strict';
/*
 * prompt.js - Phase 3.8 copyable agent prompt generator.
 *
 * Generates prompts from work-store metadata only. It does not execute agents,
 * does not read source/prompt/transcript/tool output, and does not infer hidden
 * context. The user copies the generated prompt into Codex / Claude Code.
 */
const fs = require('fs');
const path = require('path');
const { createWorkStore } = require('./work-store');

const DEFAULT_DIR = path.join(__dirname, '..', '.supernono');
function dataDir(dirOverride) { return dirOverride || process.env.SN_BRAIN_DATA_DIR || DEFAULT_DIR; }
function safeText(v, max) { return (typeof v === 'string' ? v : '').replace(/[\r\n]+/g, ' ').trim().slice(0, max || 240); }
function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }

function getSnapshot(dirOverride) {
  const store = createWorkStore(dataDir(dirOverride));
  return store.getStatus();
}

function activeSession(status) {
  return status.activeSession || status.sessions[status.sessions.length - 1] || null;
}

function findItem(status, itemId) {
  const item = status.items.find((i) => i.id === itemId);
  if (!item) throw new Error('item not found: ' + itemId);
  return item;
}

function itemRuns(status, item) {
  return (item.runs || []).map((rid) => status.runs.find((r) => r.id === rid)).filter(Boolean);
}

function renderCodexPrompt(status, item) {
  const ws = activeSession(status);
  const lines = [];
  lines.push('Please work on this SuperNoNo WorkItem as Codex.');
  lines.push('');
  lines.push('Context:');
  lines.push('- WorkSession: ' + (ws ? `${ws.id} ${safeText(ws.title)}` : 'none'));
  if (ws && ws.goal) lines.push('- Goal: ' + safeText(ws.goal, 400));
  lines.push('- WorkItem: ' + `${item.id} [${item.status}] ${safeText(item.title)}`);
  lines.push('- Role: ' + item.role);
  lines.push('');
  lines.push('Your job:');
  lines.push('- Implement or modify code only for this WorkItem.');
  lines.push('- Keep the change scoped and avoid unrelated refactors.');
  lines.push('- Run focused checks when practical and report exact commands/results.');
  lines.push('- Do not modify SuperNoNo pet UI, Live2D, adapters, or protocol files unless this WorkItem explicitly asks for it.');
  lines.push('- Do not read or expose secrets, transcripts, prompt text, tool output bodies, or unrelated files.');
  lines.push('');
  lines.push('When done, report: changed files, verification, risks, and next recommended review step.');
  return lines.join('\n');
}

function renderClaudePrompt(status, item) {
  const ws = activeSession(status);
  const runs = itemRuns(status, item);
  const lines = [];
  lines.push('Please review this SuperNoNo WorkItem as Claude Code.');
  lines.push('');
  lines.push('Context:');
  lines.push('- WorkSession: ' + (ws ? `${ws.id} ${safeText(ws.title)}` : 'none'));
  if (ws && ws.goal) lines.push('- Goal: ' + safeText(ws.goal, 400));
  lines.push('- WorkItem: ' + `${item.id} [${item.status}] ${safeText(item.title)}`);
  lines.push('- Role: ' + item.role);
  if (runs.length) lines.push('- Linked AgentRuns: ' + runs.map((r) => `${r.id}:${r.agent}/${r.state}/${r.lastEventType}`).join(', '));
  lines.push('');
  lines.push('Review stance:');
  lines.push('- Prioritize correctness, missing tests, integration risks, and product fit.');
  lines.push('- Do not implement fixes unless explicitly asked; produce findings and recommendations first.');
  lines.push('- Check whether the work respects the boundary: no automatic agent spawn, no automatic authorization, no prompt/transcript/source/diff/tool-output leakage.');
  lines.push('- Keep findings ordered by severity with file/path references where possible.');
  lines.push('');
  lines.push('Deliverable: a concise review plus a go/no-go recommendation for the user decision gate.');
  return lines.join('\n');
}

function renderReviewLoopPrompt(status) {
  const ws = activeSession(status);
  const items = ws ? status.items.filter((i) => i.sessionId === ws.id) : status.items;
  const codex = items.find((i) => i.assignedAgent === 'codex') || items.find((i) => i.role === 'build');
  const claude = items.find((i) => i.assignedAgent === 'claude-code') || items.find((i) => i.role === 'review');
  const lines = [];
  lines.push('# Review-loop handoff prompts');
  lines.push('');
  lines.push('Use these manually. The orchestrator does not send or execute them.');
  lines.push('');
  if (codex) {
    lines.push('## Prompt for Codex');
    lines.push('```text');
    lines.push(renderCodexPrompt(status, codex));
    lines.push('```');
    lines.push('');
  }
  if (claude) {
    lines.push('## Prompt for Claude Code');
    lines.push('```text');
    lines.push(renderClaudePrompt(status, claude));
    lines.push('```');
    lines.push('');
  }
  lines.push('## After both agents run');
  lines.push('- Start relay first: node orchestrator/relay.js');
  lines.push('- Link runs: node orchestrator/work.js item link <itemId> <agent:sessionId>');
  lines.push('- Resolve decision: node orchestrator/work.js decision resolve <drId> accept|reject|note');
  lines.push('- Generate handoff: node orchestrator/work.js summary --notify');
  return lines.join('\n');
}

function renderPrompt(kind, itemId, options) {
  const status = getSnapshot(options && options.dataDir);
  if (kind === 'review-loop') return renderReviewLoopPrompt(status);
  if (!itemId) throw new Error('prompt ' + kind + ' requires an item id');
  const item = findItem(status, itemId);
  if (kind === 'codex') return renderCodexPrompt(status, item);
  if (kind === 'claude' || kind === 'claude-code') return renderClaudePrompt(status, item);
  throw new Error('unknown prompt kind: ' + kind);
}

function writePrompt(kind, itemId, options) {
  options = options || {};
  const dir = dataDir(options.dataDir);
  const body = renderPrompt(kind, itemId, { dataDir: dir });
  const outDir = options.outDir || path.join(dir, 'prompts');
  fs.mkdirSync(outDir, { recursive: true });
  const safeKind = String(kind || 'prompt').replace(/[^a-z0-9_-]/gi, '-');
  const outPath = options.outPath || path.join(outDir, 'prompt-' + safeKind + '-' + stamp(new Date()) + '.md');
  fs.writeFileSync(outPath, body, 'utf8');
  return { outPath, body };
}

function main() {
  const args = process.argv.slice(2);
  const kind = args[0];
  const itemId = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
  const result = writePrompt(kind, itemId, { outPath });
  console.log('OK prompt written: ' + result.outPath);
  console.log('');
  console.log(result.body);
}

if (require.main === module) {
  try { main(); } catch (err) { console.error('prompt failed: ' + ((err && err.message) || err)); process.exit(1); }
}

module.exports = { renderPrompt, writePrompt, renderCodexPrompt, renderClaudePrompt, renderReviewLoopPrompt };
