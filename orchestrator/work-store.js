'use strict';
/*
 * work-store.js — local work bookkeeping store (Phase 3.2).
 *
 * State file: <dataDir>/workbench-state.json  (dataDir defaults like event-log:
 * SN_BRAIN_DATA_DIR || <repo>/.supernono; gitignored).
 *
 * Data model (design doc §5): WorkSession / WorkItem / AgentRun /
 * DecisionRequest, keyed by short readable ids (ws1, wi2, ar1, dr1).
 *
 * Contracts:
 *   - NO scheduling, NO agent control: this is bookkeeping only. AgentRuns are
 *     built from signal envelopes (already adapter-redacted); user intent
 *     (sessions/items/assign/done/decisions) comes only from the CLI.
 *   - Corruption safety: an unparsable state file makes load() THROW a clear
 *     error with the file path — it is NEVER silently overwritten. save()
 *     writes tmp-then-rename to avoid partial files.
 *   - ingestEvent() never throws (relay calls it per event; a store problem
 *     must never affect forwarding or the upstream hook).
 *   - Known MVP limitation: relay and CLI are separate processes doing
 *     read-modify-write on one file; concurrent writes can race. Acceptable at
 *     human scale; revisit if it ever bites.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '..', '.supernono');
const FILE_NAME = 'workbench-state.json';
const STATE_VERSION = 1;

// signal type -> AgentRun state
const RUN_STATE_BY_TYPE = {
  task_start: 'working', plan_ready: 'working', file_reading: 'working',
  file_editing: 'working', command_running: 'working', test_running: 'working',
  step_done: 'working', permission_resolved: 'working', error: 'working',
  permission_required: 'waiting_user', blocked: 'waiting_user',
  completed: 'completed',
  turn_ended: 'idle', idle: 'idle',
};

const AGENTS = ['codex', 'claude-code', 'generic-cli'];
const ITEM_ROLES = ['build', 'review', 'doc', 'test'];

function nowIso() { return new Date().toISOString(); }
function str(v) { return typeof v === 'string' && v ? v : null; }

function emptyState() {
  return {
    version: STATE_VERSION,
    updatedAt: nowIso(),
    counters: { ws: 0, wi: 0, ar: 0, dr: 0 },
    activeSessionId: null,
    sessions: {},
    items: {},
    runs: {},
    decisions: {},
  };
}

function createWorkStore(dirOverride) {
  const dir = dirOverride || process.env.SN_BRAIN_DATA_DIR || DEFAULT_DIR;
  const filePath = path.join(dir, FILE_NAME);

  /* ---- persistence ------------------------------------------------------ */

  function load() {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      if (e && e.code === 'ENOENT') return emptyState(); // first use
      throw new Error(`无法读取 work store（${filePath}）：${e.message}`);
    }
    let state;
    try {
      state = JSON.parse(raw);
    } catch (_) {
      throw new Error(
        `work store 文件损坏，拒绝覆盖：${filePath}\n` +
        '请手动检查/修复该 JSON，或将其移走后重试（移走 = 从空状态重新开始）。'
      );
    }
    if (!state || typeof state !== 'object' || typeof state.version !== 'number') {
      throw new Error(`work store 结构不合法，拒绝覆盖：${filePath}（缺少 version 字段）`);
    }
    return state;
  }

  function save(state) {
    state.updatedAt = nowIso();
    fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, filePath); // atomic-ish replace
  }

  /** load -> mutate -> save; returns fn's result. */
  function withState(fn) {
    const state = load();
    const result = fn(state);
    save(state);
    return result;
  }

  function nextId(state, kind) {
    state.counters[kind] = (state.counters[kind] || 0) + 1;
    return kind === 'ws' ? 'ws' + state.counters.ws
      : kind === 'wi' ? 'wi' + state.counters.wi
        : kind === 'ar' ? 'ar' + state.counters.ar
          : 'dr' + state.counters.dr;
  }

  /* ---- sessions ---------------------------------------------------------- */

  function startSession(title, goal) {
    if (!str(title)) throw new Error('session 需要标题');
    return withState((s) => {
      const id = nextId(s, 'ws');
      s.sessions[id] = {
        id, title: title.slice(0, 200), goal: str(goal) ? goal.slice(0, 500) : null,
        status: 'active', createdAt: nowIso(), closedAt: null, items: [],
      };
      s.activeSessionId = id;
      return s.sessions[id];
    });
  }

  function closeSession(sessionId) {
    return withState((s) => {
      const id = sessionId || s.activeSessionId;
      const ws = s.sessions[id];
      if (!ws) throw new Error(`找不到 session：${id || '(无 active session)'}`);
      ws.status = 'closed';
      ws.closedAt = nowIso();
      if (s.activeSessionId === id) s.activeSessionId = null;
      return ws;
    });
  }

  /* ---- items ------------------------------------------------------------- */

  function addItem(title, opts) {
    opts = opts || {};
    if (!str(title)) throw new Error('item 需要标题');
    if (opts.role && !ITEM_ROLES.includes(opts.role)) {
      throw new Error(`role 必须是 ${ITEM_ROLES.join('/')}`);
    }
    return withState((s) => {
      const sessionId = opts.sessionId || s.activeSessionId;
      const ws = s.sessions[sessionId];
      if (!ws) throw new Error('没有 active session，先执行：work.js session start "<标题>"');
      if (ws.status !== 'active') throw new Error(`session ${sessionId} 已关闭`);
      const id = nextId(s, 'wi');
      s.items[id] = {
        id, sessionId, title: title.slice(0, 200),
        role: opts.role || 'build', assignedAgent: null,
        status: 'todo', runs: [], createdAt: nowIso(), updatedAt: nowIso(),
      };
      ws.items.push(id);
      return s.items[id];
    });
  }

  function getItemOrThrow(s, itemId) {
    const item = s.items[itemId];
    if (!item) throw new Error(`找不到 item：${itemId}`);
    return item;
  }

  function assignItem(itemId, agent) {
    if (!AGENTS.includes(agent)) throw new Error(`agent 必须是 ${AGENTS.join('/')}`);
    return withState((s) => {
      const item = getItemOrThrow(s, itemId);
      item.assignedAgent = agent;
      item.updatedAt = nowIso();
      return item;
    });
  }

  /** Link an existing AgentRun (by "agent:sessionId" key or run id) to an item. */
  function linkRun(itemId, runRef) {
    return withState((s) => {
      const item = getItemOrThrow(s, itemId);
      let run = s.runs[runRef] || null; // by run id (ar1)
      if (!run) {
        run = Object.values(s.runs).find((r) => r.agent + ':' + r.agentSessionId === runRef) || null;
      }
      if (!run) {
        const known = Object.values(s.runs).map((r) => `${r.id}(${r.agent}:${r.agentSessionId})`).join(', ') || '(暂无 run，先让 agent 发事件)';
        throw new Error(`找不到 run：${runRef}\n已知 runs：${known}`);
      }
      run.workItemId = item.id;
      if (!item.runs.includes(run.id)) item.runs.push(run.id);
      // Linking means "work has been attached to this item" — sync the status
      // even when the run already settled (idle/completed), otherwise a todo
      // item with a finished run under it would mislead the summary. done and
      // dropped are user verdicts and stay untouched; done is always manual.
      if (item.status !== 'done' && item.status !== 'dropped') {
        if (run.state === 'waiting_user') item.status = 'waiting_user';
        else if (item.status === 'todo') item.status = 'in_progress';
      }
      item.updatedAt = nowIso();
      return { item, run };
    });
  }

  function markItemDone(itemId) {
    return withState((s) => {
      const item = getItemOrThrow(s, itemId);
      item.status = 'done';
      item.updatedAt = nowIso();
      return item;
    });
  }

  /* ---- decisions ---------------------------------------------------------- */

  function addDecision(summary, opts) {
    opts = opts || {};
    if (!str(summary)) throw new Error('decision 需要一句话 summary');
    return withState((s) => {
      if (opts.itemId) getItemOrThrow(s, opts.itemId);
      const id = nextId(s, 'dr');
      s.decisions[id] = {
        id, workItemId: opts.itemId || null, agentRunId: opts.runId || null,
        kind: opts.kind || 'manual', summary: summary.slice(0, 300),
        createdAt: nowIso(), resolvedAt: null, resolution: null,
      };
      return s.decisions[id];
    });
  }

  function resolveDecision(decisionId, resolution) {
    const allowed = ['accept', 'reject', 'note'];
    if (!allowed.includes(resolution)) throw new Error(`resolution 必须是 ${allowed.join('/')}`);
    return withState((s) => {
      const d = s.decisions[decisionId];
      if (!d) throw new Error(`找不到 decision：${decisionId}`);
      if (d.resolvedAt) throw new Error(`decision ${decisionId} 已在 ${d.resolvedAt} 处理过（${d.resolution}）`);
      d.resolvedAt = nowIso();
      d.resolution = resolution;
      return d;
    });
  }

  /* ---- event ingestion (called by the relay, per envelope) ---------------- */

  /**
   * Create/update the AgentRun for an envelope. Only envelope fields are used
   * (they are already adapter-redacted). Returns { ok, runId?, ignored? } and
   * NEVER throws — a store failure must never affect relay forwarding.
   */
  function ingestEvent(envelope) {
    try {
      const agent = str(envelope && envelope.agent);
      const agentSessionId = str(envelope && envelope.sessionId);
      const type = str(envelope && envelope.type);
      if (!agent || !agentSessionId || !type) return { ok: true, ignored: true };

      return withState((s) => {
        let run = Object.values(s.runs).find((r) => r.agent === agent && r.agentSessionId === agentSessionId);
        if (!run) {
          const id = nextId(s, 'ar');
          run = s.runs[id] = {
            id, agent, agentSessionId,
            adapter: str(envelope.adapter),
            workItemId: null, // unassigned until `work.js item link`
            startedAt: nowIso(), lastEventAt: nowIso(), lastEventType: type,
            state: RUN_STATE_BY_TYPE[type] || 'working',
            eventCounts: { [type]: 1 },
          };
        } else {
          run.lastEventAt = nowIso();
          run.lastEventType = type;
          if (str(envelope.adapter)) run.adapter = envelope.adapter;
          if (RUN_STATE_BY_TYPE[type]) run.state = RUN_STATE_BY_TYPE[type];
          run.eventCounts[type] = (run.eventCounts[type] || 0) + 1;
        }

        // minimal auto status for the linked item (done stays manual)
        const item = run.workItemId ? s.items[run.workItemId] : null;
        if (item && item.status !== 'done' && item.status !== 'dropped') {
          if (run.state === 'waiting_user') item.status = 'waiting_user';
          else if (run.state === 'working' && (item.status === 'todo' || item.status === 'waiting_user')) item.status = 'in_progress';
          item.updatedAt = nowIso();
        }
        return { ok: true, runId: run.id };
      });
    } catch (e) {
      return { ok: false, error: String((e && e.message) || 'ingest failed').slice(0, 200) };
    }
  }

  /* ---- status snapshot ----------------------------------------------------- */

  function getStatus() {
    const s = load();
    const active = s.activeSessionId ? s.sessions[s.activeSessionId] : null;
    const runs = Object.values(s.runs);
    return {
      activeSession: active,
      sessions: Object.values(s.sessions),
      items: Object.values(s.items),
      runs,
      unassignedRuns: runs.filter((r) => !r.workItemId),
      openDecisions: Object.values(s.decisions).filter((d) => !d.resolvedAt),
      decisions: Object.values(s.decisions),
      filePath,
    };
  }

  return {
    filePath, dir, load, save,
    startSession, closeSession,
    addItem, assignItem, linkRun, markItemDone,
    addDecision, resolveDecision,
    ingestEvent, getStatus,
  };
}

module.exports = { createWorkStore, RUN_STATE_BY_TYPE };
