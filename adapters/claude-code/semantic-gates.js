'use strict';

/*
 * Phase 2.6 semantic gates for future permission/error/testPass mapping.
 * These helpers are intentionally NOT wired into the hook entries yet. They
 * encode the safety rule: only structured, non-content fields may unlock a
 * semantic event. stdout/stderr/source/diff/transcript text must never be read
 * to infer success, failure, or permission state.
 */

const TEST_RX = /\b(test|tests|jest|vitest|pytest|mocha|lint|eslint|tsc|typecheck|build|make|ctest|cargo\s+test|go\s+test)\b/i;

function isTestCommand(command) {
  return typeof command === 'string' && TEST_RX.test(command);
}

function classifyToolResponse(toolResponse) {
  const r = toolResponse && typeof toolResponse === 'object' ? toolResponse : {};

  // Claude probe showed `interrupted`; it is structured and content-free, but
  // it means interruption rather than ordinary test failure. Treat as failure
  // candidate only after a future UX decision maps it to error/blocked.
  if (r.interrupted === true) return { outcome: 'failure', reason: 'interrupted' };

  for (const key of ['exit_code', 'exitCode', 'statusCode']) {
    if (typeof r[key] === 'number') {
      return r[key] === 0
        ? { outcome: 'success', reason: key + '=0' }
        : { outcome: 'failure', reason: key + '=' + r[key] };
    }
  }

  for (const key of ['success', 'ok']) {
    if (typeof r[key] === 'boolean') {
      return r[key]
        ? { outcome: 'success', reason: key + '=true' }
        : { outcome: 'failure', reason: key + '=false' };
    }
  }

  if (r.is_error === true || r.isError === true) return { outcome: 'failure', reason: 'is_error=true' };
  if (typeof r.status === 'string') {
    const s = r.status.toLowerCase();
    if (['success', 'ok', 'passed', 'pass'].includes(s)) return { outcome: 'success', reason: 'status=' + s };
    if (['error', 'failed', 'failure', 'fail'].includes(s)) return { outcome: 'failure', reason: 'status=' + s };
  }

  return { outcome: 'unknown', reason: 'no structured outcome field' };
}

function shouldEmitTestPass(preToolPayload, postToolPayload) {
  const command = preToolPayload && preToolPayload.tool_input && preToolPayload.tool_input.command;
  if (!isTestCommand(command)) return false;
  const outcome = classifyToolResponse(postToolPayload && postToolPayload.tool_response);
  return outcome.outcome === 'success';
}

function classifyNotification(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const keys = ['kind', 'type', 'notification_type', 'notificationType', 'category', 'reason'];
  for (const key of keys) {
    if (typeof p[key] !== 'string') continue;
    const v = p[key].toLowerCase();
    if (v.includes('permission') || v.includes('approval') || v.includes('confirm')) {
      return { kind: 'permission_required', reason: key + '=' + v };
    }
  }
  return { kind: 'unknown', reason: 'no structured permission field' };
}

module.exports = {
  isTestCommand,
  classifyToolResponse,
  shouldEmitTestPass,
  classifyNotification,
};