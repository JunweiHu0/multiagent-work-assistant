# Roadmap

## Current Status

- Phase 2.1: Claude Code hooks probe complete.
- Phase 2.2.0: Claude Code adapter MVP complete and verified.
- Phase 2.3: Dual-agent acceptance assets complete; user reported real test passed.
- Phase 2.4: Multiagent panel productization complete in `codex-task-pet`.
- Phase 2.5: Adapter install / uninstall / health-check tooling complete.
- Phase 2.6: Semantic gates complete; live permission/error/testPass mappings remain gated on real structured payload evidence.
- Phase 2.7: Real-world operations verified (install -> health-check -> live hook -> uninstall -> restore). Phase 2 closed.
- Phase 3.0: Orchestrator design complete — see `docs/planning/phase-3-orchestrator-plan.md`.
- Phase 3.1: Brain relay + local event log complete (`orchestrator/`): transparent 4175 -> 4174 forwarding verified byte-for-byte, fixture 22/22, real dual-agent run 7/7 with zero adapter/pet changes.

## Next Recommended Phase

Phase 3.2 — manual WorkItem + agent assignment:

1. `workbench-state.json` store (WorkSession / WorkItem / AgentRun / DecisionRequest).
2. `work new/add/assign/link/status/decide/done` CLI; AgentRuns auto-built from the relay event stream.
3. Acceptance: one real dual-agent work session fully recorded; `work status` truthfully answers "where are we, who waits on me".

Notification / failure-state probes stay in backlog and do not block Phase 3.