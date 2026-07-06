'use strict';
/*
 * stop.js — Claude Code Stop hook entry (Phase 2.2.0).
 * One agent turn ended -> one coarse turn_ended (session-scoped; the pet
 * settles quietly). The payload's last_assistant_message is NEVER read.
 * Zero stdout, exit 0.
 */
const { readHookInput, metaOf, mapStop, send } = require('./lib');

(async () => {
  try {
    const payload = readHookInput();
    await send(mapStop(), metaOf(payload));
  } catch (_) { /* never affect Claude Code */ }
  process.exit(0);
})();
