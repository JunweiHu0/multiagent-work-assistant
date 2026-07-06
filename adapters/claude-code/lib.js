'use strict';
/*
 * lib.js — Claude Code hooks -> SuperNoNo signal protocol (Phase 2.2.0 MVP).
 *
 * Field names below are backed by REAL probe records (see
 * docs/claude-code/claude-code-hooks-probe-plan.md §7): every hook payload
 * carries session_id / hook_event_name; PreToolUse and PostToolUse carry
 * tool_name / tool_input. Parsing is still DEFENSIVE — missing fields degrade
 * to generic copy, never to a throw.
 *
 * Scope (Phase 2.2.0 — deliberately narrow, see README):
 *   PreToolUse  Bash                              -> command_running
 *   PreToolUse  Read/Grep/Glob/WebFetch/WebSearch -> file_reading
 *   PreToolUse  Write/Edit/MultiEdit/NotebookEdit -> file_editing
 *   PostToolUse (any tool)                        -> step_done
 *   Stop                                          -> turn_ended
 * Everything else (Notification/permission, error mapping, unlisted tools)
 * is intentionally NOT implemented yet.
 *
 * Guarantees (identical to the Codex plugin hooks):
 *   - never throws into the caller's process on bad input;
 *   - only sends SuperNoNo protocol STATE events to the local bridge;
 *   - never executes anything;
 *   - never records or forwards prompt text, source code, diffs, tool output,
 *     transcript content, tokens or secrets. Commands become short redacted
 *     summaries; files become basenames.
 */
const fs = require('fs');
const { sendSignal } = require('./send-signal');

const AGENT = 'claude-code';
const ADAPTER = 'claude-code-hooks';

/* ---- defensive input ---------------------------------------------------- */

// Claude Code delivers the hook payload as JSON on stdin (probe-confirmed).
// Returns {} on anything unexpected. Never throws.
function readHookInput() {
  try {
    if (process.stdin && process.stdin.isTTY) return {}; // nothing piped in
    const data = fs.readFileSync(0, 'utf8');             // fd 0 = stdin
    if (data && data.trim().startsWith('{')) {
      const o = JSON.parse(data);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    }
  } catch (_) { /* no stdin / bad json */ }
  return {};
}

/* ---- redaction / summaries (ported from the Codex plugin lib.js) -------- */

// Short, secret-masked one-line command summary — NEVER the full input.
function safeCommandSummary(cmd) {
  let s = typeof cmd === 'string' ? cmd : '';
  if (Array.isArray(cmd)) s = cmd.filter((x) => typeof x === 'string').join(' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s
    .replace(/(bearer\s+)[A-Za-z0-9._\-]+/gi, '$1[redacted]')
    .replace(/\b(?:sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9]{6,}\b/g, '[redacted-token]')
    .replace(/(--?(?:password|token|secret|api[-_]?key|authorization)[=\s])\S+/gi, '$1[redacted]');
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

// Only the file's basename — never the full path (avoids leaking tree layout).
function baseName(p) {
  const s = typeof p === 'string' ? p : '';
  const parts = s.split(/[\\/]/).filter(Boolean);
  const b = parts.length ? parts[parts.length - 1] : '';
  return b.length > 60 ? b.slice(0, 57) + '...' : b;
}

/* ---- envelope meta ------------------------------------------------------- */

// sessionId: payload.session_id first (probe: present on every event), then
// the CLAUDE_CODE_SESSION_ID env var Claude Code sets for hook processes.
// taskId: deliberately null — Claude Code hooks expose no task-level id and we
// don't fabricate one (see mapping doc §1).
function metaOf(p) {
  p = p && typeof p === 'object' ? p : {};
  const envSid = process.env.CLAUDE_CODE_SESSION_ID;
  const sessionId =
    (typeof p.session_id === 'string' && p.session_id) ? p.session_id
      : (typeof envSid === 'string' && envSid) ? envSid
        : null;
  return { sessionId, taskId: null };
}

/* ---- classification ------------------------------------------------------ */

const TEST_RX = /\b(test|tests|jest|vitest|pytest|mocha|lint|eslint|tsc|typecheck|build|make|ctest|cargo\s+test|go\s+test)\b/i;

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function toolInputOf(p) {
  return (p && typeof p.tool_input === 'object' && p.tool_input) ? p.tool_input : {};
}

function toolNameOf(p) {
  return (p && typeof p.tool_name === 'string') ? p.tool_name : '';
}

/**
 * PreToolUse -> a phase event, or null for tools outside the 2.2.0 scope
 * (Task, mcp__*, AskUserQuestion, ... are deliberately skipped — no event).
 */
function mapPreToolUse(p) {
  p = p && typeof p === 'object' ? p : {};
  const tool = toolNameOf(p);
  const ti = toolInputOf(p);

  if (tool === 'Bash') {
    const summary = safeCommandSummary(ti.command);
    const isTest = TEST_RX.test(typeof ti.command === 'string' ? ti.command : '');
    return {
      type: 'command_running',
      payload: {
        command: summary || 'shell 命令',
        isTest,
        action: (isTest ? '正在运行测试/构建：' : '正在运行命令：') + (summary || 'shell 命令'),
      },
    };
  }

  if (READ_TOOLS.has(tool)) {
    // Only Read carries a file_path we are willing to summarize; Grep/Glob
    // patterns and WebFetch URLs may embed source fragments or private hosts,
    // so they get generic copy only.
    const file = tool === 'Read' ? baseName(ti.file_path) : '';
    return {
      type: 'file_reading',
      payload: {
        ...(file ? { file } : {}),
        action: file ? ('正在读取：' + file) : '正在搜索/读取项目',
      },
    };
  }

  if (EDIT_TOOLS.has(tool)) {
    const file = baseName(ti.file_path || ti.notebook_path);
    return {
      type: 'file_editing',
      payload: {
        ...(file ? { file } : {}),
        action: '正在编辑文件' + (file ? '：' + file : ''),
      },
    };
  }

  return null; // out of 2.2.0 scope: emit nothing rather than guess
}

/**
 * PostToolUse -> step_done, always. No error mapping and NO tool_response
 * inspection in 2.2.0 (probe found no reliable structured failure field, and
 * reading stdout/stderr bodies is forbidden). No testPass energy rule either:
 * without a success signal, claiming "tests passed" would be dishonest UI.
 */
function mapPostToolUse(p) {
  p = p && typeof p === 'object' ? p : {};
  const tool = toolNameOf(p);
  return {
    type: 'step_done',
    payload: { action: '完成一步工具调用' + (tool ? '（' + tool + '）' : '') },
  };
}

/** Stop -> turn_ended. `last_assistant_message` etc. are NEVER read. */
function mapStop() {
  return { type: 'turn_ended', payload: { action: 'Claude Code 完成一个回合' } };
}

/* ---- send ----------------------------------------------------------------- */

async function send(event, meta) {
  if (!event || !event.type) return { ok: false, error: 'no event' };
  meta = meta && typeof meta === 'object' ? meta : {};
  try {
    return await sendSignal({
      type: event.type,
      agent: AGENT,
      adapter: ADAPTER,
      sessionId: meta.sessionId || null,
      taskId: meta.taskId || null,
      payload: event.payload || {},
    });
  } catch (_) {
    return { ok: false, error: 'send failed' };
  }
}

module.exports = {
  readHookInput, metaOf, mapPreToolUse, mapPostToolUse, mapStop, send,
  safeCommandSummary, baseName,
};
