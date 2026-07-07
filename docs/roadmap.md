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

## Next Recommended Phase

Phase 3.1 — local WorkSession store + event relay:

1. Transparent relay (adapters -> 4175 -> pet 4174) with JSONL event logging; zero changes to adapters and pet.
2. `workbench-state.json` store + read-only `work status` CLI.
3. Acceptance: dual-agent test via relay behaves identically to direct delivery; relay downtime never harms agents.

Notification / failure-state probes stay in backlog and do not block Phase 3.