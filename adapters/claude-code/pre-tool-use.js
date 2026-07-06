'use strict';
/*
 * pre-tool-use.js — Claude Code PreToolUse hook entry (Phase 2.2.0).
 * Maps an about-to-run tool call to a SuperNoNo phase event
 * (command_running / file_reading / file_editing); out-of-scope tools emit
 * nothing. NEVER writes to stdout (stdout carries hook permission decisions)
 * and NEVER throws into Claude Code.
 */
const { readHookInput, metaOf, mapPreToolUse, send } = require('./lib');

(async () => {
  try {
    const payload = readHookInput();
    const event = mapPreToolUse(payload);
    if (event) await send(event, metaOf(payload));
  } catch (_) { /* never affect Claude Code */ }
  process.exit(0);
})();
