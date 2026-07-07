'use strict';

const g = require('./semantic-gates');
let failures = 0;
function check(cond, label) {
  console.log((cond ? 'PASS ' : 'FAIL ') + label);
  if (!cond) failures++;
}

check(g.isTestCommand('npm test'), 'detects npm test');
check(g.isTestCommand('pytest tests'), 'detects pytest');
check(!g.isTestCommand('echo hello'), 'does not mark generic command as test');
check(g.classifyToolResponse({ exit_code: 0 }).outcome === 'success', 'exit_code 0 -> success');
check(g.classifyToolResponse({ exit_code: 2 }).outcome === 'failure', 'exit_code nonzero -> failure');
check(g.classifyToolResponse({ success: false }).outcome === 'failure', 'success false -> failure');
check(g.classifyToolResponse({ ok: true }).outcome === 'success', 'ok true -> success');
check(g.classifyToolResponse({ stderr: 'ERROR: leaked text' }).outcome === 'unknown', 'stderr text alone is ignored');
check(g.shouldEmitTestPass({ tool_input: { command: 'npm run build' } }, { tool_response: { exit_code: 0 } }) === true, 'testPass only with test command and success');
check(g.shouldEmitTestPass({ tool_input: { command: 'npm run build' } }, { tool_response: {} }) === false, 'no testPass without structured success');
check(g.classifyNotification({ notification_type: 'permission_request' }).kind === 'permission_required', 'structured permission notification can be classified');
check(g.classifyNotification({ message: 'please approve this dangerous command' }).kind === 'unknown', 'message-only notification is not enough');

if (failures) {
  console.error('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nALL PASS');