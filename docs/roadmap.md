# Roadmap

## Current Status

- Phase 2.1: Claude Code hooks probe complete.
- Phase 2.2.0: Claude Code adapter MVP complete and verified.
- Phase 2.3: Dual-agent acceptance assets complete; user reported real test passed.
- Phase 2.4: Multiagent panel productization complete in `codex-task-pet`.
- Phase 2.5: Adapter install / uninstall / health-check tooling complete.
- Phase 2.6: Semantic gates complete; live permission/error/testPass mappings remain gated on real structured payload evidence.

## Next Recommended Phase

Phase 2.7 should focus on real-world operations:

1. Run `health-check.js` on a fresh project and on the user's actual project.
2. Capture new probe records for Notification and failed tool calls.
3. If structured fields are confirmed, wire `permission_required`, `error`, and `testPass` one at a time.
4. Start Phase 3 orchestrator only after semantics are evidence-backed.