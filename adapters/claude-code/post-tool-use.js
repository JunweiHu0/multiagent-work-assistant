'use strict';
/*
 * post-tool-use.js — Claude Code PostToolUse hook entry (Phase 2.2.0).
 * Every finished tool call becomes one step_done. No error mapping and no
 * tool_response inspection in this phase (see README). Zero stdout, exit 0.
 */
const { readHookInput, metaOf, mapPostToolUse, send } = require('./lib');

(async () => {
  try {
    const payload = readHookInput();
    await send(mapPostToolUse(payload), metaOf(payload));
  } catch (_) { /* never affect Claude Code */ }
  process.exit(0);
})();
