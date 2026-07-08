# Roadmap

## Current Status

- Phase 2.1: Claude Code hooks probe complete.
- Phase 2.2.0: Claude Code adapter MVP complete and verified.
- Phase 2.3: Dual-agent acceptance assets complete; user reported real test passed.
- Phase 2.4: Multiagent panel productization complete in `codex-task-pet`.
- Phase 2.5: Adapter install / uninstall / health-check tooling complete.
- Phase 2.6: Semantic gates complete; live permission/error/testPass mappings remain gated on real structured payload evidence.
- Phase 2.7: Real-world operations verified (install -> health-check -> live hook -> uninstall -> restore). Phase 2 closed.
- Phase 3.0: Orchestrator design complete; see `docs/planning/phase-3-orchestrator-plan.md`.
- Phase 3.1: Brain relay + local event log complete.
- Phase 3.2: Work store + manual CLI complete.
- Phase 3.3: Metadata-only work summary complete.
- Phase 3.4: Manual orchestration CLI complete enough for MVP.
- Phase 3.5: Codex -> Claude review-loop template complete.
- Phase 3.6: Real-use acceptance checklist complete.
- Phase 3.7: Summary v2 handoff format complete.
- Phase 3.8: Copyable agent prompt generator complete.
- Phase 4.0-4.6: Semi-automatic brain complete: plan draft, plan accept, prompt pack, decision brief, Python spike conclusion, and real-use checklist.

## Next Recommended Phase

Run Phase 4 on one real task and review product value:

1. `node orchestrator/relay.js`
2. `node orchestrator/work.js plan draft "<task>" --goal "Codex builds, Claude reviews, user decides"`
3. Review the generated `.supernono/plans/*.md`, then run `node orchestrator/work.js plan accept .supernono/plans/plan-xxx.json`.
4. `node orchestrator/work.js prompt pack ws1`
5. Copy prompts into Codex and Claude Code manually.
6. Link runs, generate `decision brief`, resolve the decision, mark items done.
7. `node orchestrator/work.js summary --notify`
8. Ask CC/Fable to review the real-use result using `docs/acceptance/phase-4-semi-automatic-brain.md`.

Do not add automatic scheduling until the Phase 4 semi-automatic loop proves useful.

Backlog remains gated: Notification -> permission_required, permission_resolved synthesis, PostToolUse -> error, testPass, LLM-based automatic decomposition, automatic agent spawning, database/cloud/account features.


