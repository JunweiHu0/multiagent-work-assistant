'use strict';
/*
 * work.js - manual work bookkeeping CLI (Phase 3.2+).
 *
 * Usage:
 *   node orchestrator/work.js session start "Implement Claude adapter" [--goal "..."]
 *   node orchestrator/work.js session close [wsId]
 *   node orchestrator/work.js item add "Let Codex implement relay" [--role build|review|doc|test]
 *   node orchestrator/work.js item assign <itemId> <codex|claude-code|generic-cli>
 *   node orchestrator/work.js item link <itemId> <agent:sessionId | runId>
 *   node orchestrator/work.js item done <itemId> [--resolve <drId>] [--no-notify]
 *   node orchestrator/work.js decision add "Accept this plan?" [--item <itemId>]
 *   node orchestrator/work.js decision resolve <drId> <accept|reject|note> [--no-notify]
 *   node orchestrator/work.js workflow review-loop "Feature title" [--goal "..."]
 *   node orchestrator/work.js go "Feature title" [--goal "..."]
 *   node orchestrator/work.js summary [--out path] [--notify]
 *   node orchestrator/work.js prompt <codex|claude|review-loop|pack> [itemId|sessionId] [--out path]
 *   node orchestrator/work.js plan draft "Feature title" [--goal "..."] [--mode review-loop]
 *   node orchestrator/work.js brain check [--python path]
 *   node orchestrator/work.js brain plan "Feature title" [--goal "..."] [--python path]
 *   node orchestrator/work.js plan accept <plan.json> [--force]
 *   node orchestrator/work.js decision brief <drId> [--notify]
 *   node orchestrator/work.js status
 */
const { createWorkStore } = require('./work-store');
const { probeLinks, formatLinkHealthLine } = require('./health-probe');

const store = createWorkStore();
const argv = process.argv.slice(2);

function parseArgs(args) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else {
      pos.push(args[i]);
    }
  }
  return [pos, flags];
}

const RUN_STATE_LABEL = { working: 'working', waiting_user: 'waiting_user', completed: 'completed', idle: 'idle' };
const ITEM_STATE_LABEL = { todo: 'todo', in_progress: 'in_progress', waiting_user: 'waiting_user', done: 'done', dropped: 'dropped' };

function relTime(iso) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  return Math.round(m / 60) + 'h ago';
}

async function printStatus() {
  const health = await probeLinks({ timeoutMs: 500 });
  console.log(formatLinkHealthLine(health));

  const st = store.getStatus();
  if (!st.activeSession && st.sessions.length === 0) {
    console.log('No work session yet. Start one: node orchestrator/work.js session start "<title>"');
    return;
  }

  const ws = st.activeSession;
  if (ws) console.log(`Session ${ws.id} [${ws.status}] ${ws.title}${ws.goal ? ' - ' + ws.goal : ''}`);
  else console.log('(no active session)');

  const items = st.items.filter((i) => !ws || i.sessionId === ws.id);
  console.log('\nItems:');
  if (!items.length) console.log('  (none; add one with: work.js item add "<title>")');
  for (const i of items) {
    const runs = i.runs.map((rid) => {
      const r = st.runs.find((x) => x.id === rid);
      return r ? `${r.id}:${RUN_STATE_LABEL[r.state] || r.state}` : rid;
    }).join(', ');
    console.log(`  ${i.id}  [${ITEM_STATE_LABEL[i.status] || i.status}]  ${i.title}`
      + `  (role=${i.role}${i.assignedAgent ? ' agent=' + i.assignedAgent : ''}${runs ? ' runs=' + runs : ''})`);
  }

  if (st.unassignedRuns.length) {
    console.log('\nUnassigned AgentRuns (link with: work.js item link <itemId> <agent:sessionId>):');
    for (const r of st.unassignedRuns) {
      const events = Object.entries(r.eventCounts).map(([t, n]) => `${t}x${n}`).join(' ');
      console.log(`  ${r.id}  ${r.agent}:${r.agentSessionId}  [${RUN_STATE_LABEL[r.state] || r.state}]  last ${relTime(r.lastEventAt)}  (${events})`);
    }
  }

  if (st.openDecisions.length) {
    console.log('\nOpen decisions:');
    for (const d of st.openDecisions) {
      console.log(`  ${d.id}  ${d.summary}${d.workItemId ? '  (item ' + d.workItemId + ')' : ''}  created ${relTime(d.createdAt)}`);
    }
  }

  console.log(`\nstore: ${st.filePath}`);
}

function createReviewLoop(title, goal) {
  if (!title) throw new Error('workflow review-loop needs a title');
  const ws = store.startSession(title, goal);
  const build = store.addItem('Codex implement: ' + title, { role: 'build' });
  store.assignItem(build.id, 'codex');
  const review = store.addItem('Claude Code review: ' + title, { role: 'review' });
  store.assignItem(review.id, 'claude-code');
  const decision = store.addDecision('Accept the review result for: ' + title, { itemId: review.id });
  return { ws, build, review, decision };
}

async function resolveDecisionAndMaybeNotify(decisionId, resolution, flags) {
  const { sendAssistantDecisionResolved } = require('./phase4');
  const d = store.resolveDecision(decisionId, resolution || 'accept');
  console.log(`OK decision ${d.id} resolved: ${d.resolution}`);
  if (!flags['no-notify']) {
    const sent = await sendAssistantDecisionResolved(d);
    console.log(sent.ok ? `OK assistant resolved port ${sent.port}` : `WARN assistant resolve notify failed: ${sent.error || sent.status}`);
  }
  return d;
}

async function main() {
  const [pos, flags] = parseArgs(argv);
  const [group, verb, ...rest] = pos;

  try {
    if (group === 'status' || (!group && !verb)) return await printStatus();

    if (group === 'session' && verb === 'start') {
      const ws = store.startSession(rest.join(' '), flags.goal);
      console.log(`OK session ${ws.id} started: ${ws.title}`);
      return;
    }
    if (group === 'session' && verb === 'close') {
      const ws = store.closeSession(rest[0]);
      console.log(`OK session ${ws.id} closed: ${ws.title}`);
      return;
    }
    if (group === 'item' && verb === 'add') {
      const item = store.addItem(rest.join(' '), { role: flags.role });
      console.log(`OK item ${item.id} added: ${item.title} (role=${item.role})`);
      return;
    }
    if (group === 'item' && verb === 'assign') {
      const item = store.assignItem(rest[0], rest[1]);
      console.log(`OK item ${item.id} assigned to ${item.assignedAgent}`);
      return;
    }
    if (group === 'item' && verb === 'link') {
      const { item, run } = store.linkRun(rest[0], rest[1]);
      console.log(`OK run ${run.id} (${run.agent}:${run.agentSessionId}) linked to item ${item.id}`);
      return;
    }
    if (group === 'item' && verb === 'done') {
      const item = store.markItemDone(rest[0]);
      console.log(`OK item ${item.id} done: ${item.title}`);
      if (flags.resolve) await resolveDecisionAndMaybeNotify(flags.resolve, flags.resolution || 'accept', flags);
      return;
    }
    if (group === 'decision' && verb === 'add') {
      const d = store.addDecision(rest.join(' '), { itemId: flags.item });
      console.log(`OK decision ${d.id} added: ${d.summary}`);
      return;
    }
    if (group === 'decision' && verb === 'resolve') {
      await resolveDecisionAndMaybeNotify(rest[0], rest[1], flags);
      return;
    }
    if (group === 'decision' && verb === 'brief') {
      const { writeDecisionBrief, sendAssistantDecisionBrief } = require('./phase4');
      const result = writeDecisionBrief(rest[0], { outPath: flags.out && flags.out !== true ? flags.out : null });
      console.log(`OK decision brief written: ${result.outPath}`);
      if (flags.notify) {
        const sent = await sendAssistantDecisionBrief(result.outPath, result.decision);
        console.log(sent.ok ? `OK assistant notified port ${sent.port}` : `WARN assistant notify failed on port ${sent.port}: ${sent.error || sent.status}`);
      }
      return;
    }
    if (group === 'workflow' && verb === 'review-loop') {
      const flow = createReviewLoop(rest.join(' '), flags.goal);
      console.log(`OK workflow review-loop created: ${flow.ws.id}`);
      console.log(`  ${flow.build.id} -> codex (${flow.build.title})`);
      console.log(`  ${flow.review.id} -> claude-code (${flow.review.title})`);
      console.log(`  ${flow.decision.id} -> decision (${flow.decision.summary})`);
      return;
    }
    if (group === 'go') {
      const title = [verb, ...rest].filter(Boolean).join(' ');
      const { writePlanDraft, acceptPlan, writePromptPack } = require('./phase4');
      const draft = writePlanDraft(title, { goal: flags.goal, mode: flags.mode });
      const accepted = acceptPlan(draft.jsonPath);
      const pack = writePromptPack(accepted.ws.id);
      console.log(`OK go plan draft: ${draft.jsonPath}`);
      console.log(`OK go plan accepted: ${accepted.ws.id}`);
      for (const item of accepted.items) console.log(`  ${item.id} -> ${item.assignedAgent || 'unassigned'} (${item.title})`);
      for (const d of accepted.decisions) console.log(`  ${d.id} -> decision (${d.summary})`);
      console.log(`OK go prompt pack: ${pack.outDir}`);
      for (const f of pack.files) console.log(`  ${f.kind}: ${f.path}`);
      return;
    }
    if (group === 'plan' && verb === 'draft') {
      const { writePlanDraft } = require('./phase4');
      const result = writePlanDraft(rest.join(' '), {
        goal: flags.goal,
        mode: flags.mode,
        outPath: flags.out && flags.out !== true ? flags.out : null,
        outDir: flags['out-dir'] && flags['out-dir'] !== true ? flags['out-dir'] : null,
      });
      console.log(`OK plan draft written: ${result.jsonPath}`);
      console.log(`OK plan markdown written: ${result.mdPath}`);
      return;
    }
    if (group === 'brain' && verb === 'check') {
      const { checkPythonBrain } = require('./brain');
      const result = checkPythonBrain({ python: flags.python && flags.python !== true ? flags.python : null });
      console.log(`OK Python brain planner: ${result.draftId}`);
      return;
    }
    if (group === 'brain' && verb === 'plan') {
      const { writePythonPlanDraft } = require('./brain');
      const result = writePythonPlanDraft(rest.join(' '), {
        goal: flags.goal,
        mode: flags.mode,
        python: flags.python && flags.python !== true ? flags.python : null,
        outPath: flags.out && flags.out !== true ? flags.out : null,
        outDir: flags['out-dir'] && flags['out-dir'] !== true ? flags['out-dir'] : null,
      });
      console.log(`OK brain plan draft written: ${result.jsonPath}`);
      console.log(`OK brain plan markdown written: ${result.mdPath}`);
      console.log(`  planner: ${result.draft.planner ? result.draft.planner.kind : 'python'}`);
      return;
    }
    if (group === 'plan' && verb === 'accept') {
      const { acceptPlan } = require('./phase4');
      const result = acceptPlan(rest[0], { force: !!flags.force });
      console.log(`OK plan accepted: ${result.ws.id}`);
      for (const item of result.items) console.log(`  ${item.id} -> ${item.assignedAgent || 'unassigned'} (${item.title})`);
      for (const d of result.decisions) console.log(`  ${d.id} -> decision (${d.summary})`);
      return;
    }
    if (group === 'summary') {
      const { writeSummary, sendAssistantSummary } = require('./summary');
      const result = writeSummary({ outPath: flags.out && flags.out !== true ? flags.out : null });
      console.log(`OK summary written: ${result.outPath}`);
      if (flags.notify) {
        const sent = await sendAssistantSummary(result.outPath);
        console.log(sent.ok ? `OK assistant notified port ${sent.port}` : `WARN assistant notify failed on port ${sent.port}: ${sent.error || sent.status}`);
      }
      return;
    }
    if (group === 'prompt' && verb === 'pack') {
      const { writePromptPack } = require('./phase4');
      const result = writePromptPack(rest[0], { outDir: flags['out-dir'] && flags['out-dir'] !== true ? flags['out-dir'] : null });
      console.log(`OK prompt pack written: ${result.outDir}`);
      for (const f of result.files) console.log(`  ${f.kind}: ${f.path}`);
      return;
    }
    if (group === 'prompt') {
      const { writePrompt } = require('./prompt');
      const kind = verb;
      const itemId = rest[0];
      const result = writePrompt(kind, itemId, { outPath: flags.out && flags.out !== true ? flags.out : null });
      console.log(`OK prompt written: ${result.outPath}`);
      console.log('');
      console.log(result.body);
      return;
    }

    console.log('Usage: node orchestrator/work.js status');
    process.exitCode = 2;
  } catch (e) {
    console.error('ERROR: ' + ((e && e.message) || e));
    process.exitCode = 1;
  }
}

main();



