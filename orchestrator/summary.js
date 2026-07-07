'use strict';
/*
 * summary.js - Phase 3.7 user-facing work summary v2.
 *
 * Reads the local work store plus the relay JSONL event log and writes a
 * handoff-style Markdown report. It summarizes metadata only: user-entered
 * titles/decisions, item status, run ids, event type counts, timings, and
 * forward status. It never reads prompt/transcript/source/diff/tool output and
 * never copies payload bodies into the summary.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createWorkStore } = require('./work-store');

const DEFAULT_DIR = path.join(__dirname, '..', '.supernono');
const SEND_TIMEOUT_MS = 800;

function dataDir(dirOverride) { return dirOverride || process.env.SN_BRAIN_DATA_DIR || DEFAULT_DIR; }
function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
function dayStamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function safeText(v, max) { return (typeof v === 'string' ? v : '').replace(/[\r\n]+/g, ' ').trim().slice(0, max || 200); }
function shortId(v) { const s = typeof v === 'string' ? v : ''; return s.length > 12 ? s.slice(0, 8) + '...' : s; }
function msBetween(a, b) {
  if (!a || !b) return null;
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  return Number.isFinite(x) && Number.isFinite(y) && y >= x ? y - x : null;
}
function fmtDuration(ms) {
  if (ms == null) return 'n/a';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return sec + 's';
  const min = Math.round(sec / 60);
  if (min < 60) return min + 'm';
  return (Math.round((min / 60) * 10) / 10) + 'h';
}

function countEventLog(dir) {
  const file = path.join(dir, 'events-' + dayStamp(new Date()) + '.jsonl');
  const out = { file, total: 0, forwarded: 0, missed: 0, rejected: 0, byAgent: {} };
  if (!fs.existsSync(file)) return out;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch (_) { out.rejected++; continue; }
    out.total++;
    if (rec.forward && rec.forward.status === 'ok') out.forwarded++;
    else if (rec.forward && rec.forward.status) out.missed++;
    const env = rec.envelope || {};
    const agent = typeof env.agent === 'string' && env.agent ? env.agent : 'unknown';
    const type = typeof env.type === 'string' && env.type ? env.type : 'unknown';
    out.byAgent[agent] = out.byAgent[agent] || { total: 0, types: {} };
    out.byAgent[agent].total++;
    out.byAgent[agent].types[type] = (out.byAgent[agent].types[type] || 0) + 1;
  }
  return out;
}

function eventCountsText(counts) {
  const entries = Object.entries(counts || {}).sort((a, b) => a[0].localeCompare(b[0]));
  return entries.length ? entries.map(([k, v]) => k + ' x' + v).join(', ') : 'none';
}

function runsForItem(status, item) {
  return (item.runs || []).map((rid) => status.runs.find((r) => r.id === rid)).filter(Boolean);
}

function itemLine(status, item) {
  const runs = runsForItem(status, item);
  const runText = runs.length ? runs.map((r) => `${r.id}:${r.agent}/${r.state}`).join(', ') : 'no linked runs';
  return `- ${item.id} [${item.status}] ${safeText(item.title, 180)} (role=${item.role}${item.assignedAgent ? ', agent=' + item.assignedAgent : ''}; ${runText})`;
}

function addItemGroup(lines, title, status, items) {
  lines.push('## ' + title);
  if (!items.length) lines.push('- None.');
  for (const item of items) {
    lines.push(itemLine(status, item));
    for (const run of runsForItem(status, item)) {
      lines.push(`  - run ${run.id}: ${run.agent}:${shortId(run.agentSessionId)} [${run.state}], last=${run.lastEventType}, events=${eventCountsText(run.eventCounts)}, elapsed=${fmtDuration(msBetween(run.startedAt, run.lastEventAt))}`);
    }
  }
  lines.push('');
}

function nextActions(status, items) {
  const out = [];
  for (const d of status.openDecisions) out.push(`Resolve decision ${d.id}: ${safeText(d.summary, 180)}`);
  for (const item of items.filter((i) => i.status === 'waiting_user')) out.push(`Unblock ${item.id}: ${safeText(item.title, 140)}`);
  if (status.unassignedRuns.length) out.push(`Link ${status.unassignedRuns.length} unassigned AgentRun(s) to WorkItems.`);
  for (const item of items.filter((i) => i.status === 'in_progress')) out.push(`Check progress on ${item.id}: ${safeText(item.title, 140)}`);
  for (const item of items.filter((i) => i.status === 'todo')) out.push(`Start or assign ${item.id}: ${safeText(item.title, 140)}`);
  return out.slice(0, 8);
}

function renderSummary(status, logStats, generatedAt) {
  const ws = status.activeSession || status.sessions[status.sessions.length - 1] || null;
  const items = ws ? status.items.filter((i) => i.sessionId === ws.id) : status.items;
  const completed = items.filter((i) => i.status === 'done');
  const active = items.filter((i) => i.status === 'in_progress');
  const waiting = items.filter((i) => i.status === 'waiting_user');
  const todo = items.filter((i) => i.status === 'todo');
  const dropped = items.filter((i) => i.status === 'dropped');
  const lines = [];

  lines.push('# SuperNoNo Work Handoff');
  lines.push('');
  lines.push('## Snapshot');
  lines.push('- Generated: ' + generatedAt);
  lines.push('- Session: ' + (ws ? `${ws.id} [${ws.status}] ${safeText(ws.title, 160)}` : 'none'));
  if (ws && ws.goal) lines.push('- Goal: ' + safeText(ws.goal, 300));
  lines.push(`- Items: done=${completed.length}, active=${active.length}, waiting=${waiting.length}, todo=${todo.length}, dropped=${dropped.length}`);
  lines.push(`- Runs: linked=${status.runs.length - status.unassignedRuns.length}, unassigned=${status.unassignedRuns.length}`);
  lines.push(`- Decisions: open=${status.openDecisions.length}, total=${status.decisions.length}`);
  lines.push(`- Relay today: total=${logStats.total}, forwarded=${logStats.forwarded}, missed=${logStats.missed}`);
  lines.push('');

  lines.push('## Next Actions');
  const actions = nextActions(status, items);
  if (!actions.length) lines.push('- No obvious next action. Consider closing the session or starting the next WorkItem.');
  for (const action of actions) lines.push('- ' + action);
  lines.push('');

  addItemGroup(lines, 'Completed', status, completed);
  addItemGroup(lines, 'In Progress', status, active);
  addItemGroup(lines, 'Waiting For User', status, waiting);
  addItemGroup(lines, 'Todo / Not Started', status, todo);
  if (dropped.length) addItemGroup(lines, 'Dropped', status, dropped);

  lines.push('## Agent Activity');
  const agents = Object.entries(logStats.byAgent).sort((a, b) => a[0].localeCompare(b[0]));
  if (!agents.length) lines.push('- No relay events found for today.');
  for (const [agent, info] of agents) lines.push(`- ${agent}: total=${info.total}; ${eventCountsText(info.types)}`);
  lines.push('');

  lines.push('## Unassigned Agent Runs');
  if (!status.unassignedRuns.length) lines.push('- None.');
  for (const run of status.unassignedRuns) lines.push(`- ${run.id} ${run.agent}:${shortId(run.agentSessionId)} [${run.state}], last=${run.lastEventType}, events=${eventCountsText(run.eventCounts)}`);
  lines.push('');

  lines.push('## Open Decisions');
  if (!status.openDecisions.length) lines.push('- None.');
  for (const d of status.openDecisions) lines.push(`- ${d.id} ${safeText(d.summary, 240)}${d.workItemId ? ' (item ' + d.workItemId + ')' : ''}`);
  lines.push('');

  lines.push('## Files');
  lines.push('- Store: ' + status.filePath);
  lines.push('- Event log: ' + logStats.file);
  lines.push('');

  lines.push('## Safety Note');
  lines.push('- Metadata-only: this report excludes prompt, transcript, source, diff, tool output, tokens, and secrets.');
  lines.push('- Item completion remains manual; a completed AgentRun does not automatically mark a WorkItem done.');
  lines.push('');
  return lines.join('\n');
}

function writeSummary(options) {
  options = options || {};
  const dir = dataDir(options.dataDir);
  const store = createWorkStore(dir);
  const status = store.getStatus();
  const logStats = countEventLog(dir);
  const generatedAt = new Date().toISOString();
  const body = renderSummary(status, logStats, generatedAt);
  const outDir = options.outDir || path.join(dir, 'summaries');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = options.outPath || path.join(outDir, 'summary-' + stamp(new Date()) + '.md');
  fs.writeFileSync(outPath, body, 'utf8');
  return { outPath, body, status, logStats };
}

function sendAssistantSummary(outPath, options) {
  options = options || {};
  const port = Number(options.port || process.env.SN_SUMMARY_NOTIFY_PORT || process.env.SN_BRAIN_PORT || process.env.SUPERNONO_BRIDGE_PORT || 4175);
  const event = {
    type: 'completed', agent: 'assistant', adapter: 'workbench', sessionId: 'workbench', taskId: null,
    payload: {
      action: 'SuperNoNo work summary generated',
      artifact: outPath,
      artifacts: [{ title: 'Work summary', path: outPath }],
      source: 'workbench-summary',
    },
  };
  const raw = JSON.stringify(event);
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/signal', method: 'POST', timeout: SEND_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } },
    (res) => { res.resume(); res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, port })); });
    req.on('error', (err) => resolve({ ok: false, port, error: String((err && (err.code || err.message)) || 'error').slice(0, 80) }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, port, error: 'timeout' }); });
    req.write(raw);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const notify = args.includes('--notify');
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
  const result = writeSummary({ outPath });
  console.log('OK summary written: ' + result.outPath);
  if (notify) {
    const sent = await sendAssistantSummary(result.outPath);
    console.log(sent.ok ? `OK assistant notified port ${sent.port}` : `WARN assistant notify failed on port ${sent.port}: ${sent.error || sent.status}`);
  }
}

if (require.main === module) main().catch((err) => { console.error('summary failed: ' + ((err && err.message) || err)); process.exit(1); });

module.exports = { writeSummary, renderSummary, countEventLog, sendAssistantSummary };
