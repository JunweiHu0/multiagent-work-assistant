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
- Phase 3.1: Brain relay + local event log complete (`orchestrator/`): transparent 4175 -> 4174 forwarding, JSONL event log, fixture 22/22.
- Phase 3.2: Work store + manual CLI complete: WorkSession/WorkItem/AgentRun/DecisionRequest, relay auto-builds AgentRuns, corruption-safe state file.
- Phase 3.3: Work summary complete: `work summary` renders metadata-only Markdown from workbench-state + daily JSONL; optional assistant notification to the pet.
- Phase 3.4: Manual orchestration CLI complete enough for MVP: session/item/assign/link/status/decision/done plus `workflow review-loop`.
- Phase 3.5: Codex -> Claude review loop template complete: creates a Codex build item, Claude Code review item, and an explicit user decision gate. It does not spawn or control agents.

## Next Recommended Phase

Use this MVP on a real half-day task and have CC/Fable review the product behavior, not just the code:

1. Start `node orchestrator/relay.js`.
2. Point real adapters at it with `SUPERNONO_BRIDGE_PORT=4175`.
3. Create a review workflow with `node orchestrator/work.js workflow review-loop "<task>" --goal "..."`.
4. Let Codex implement and Claude Code review manually.
5. Link runs with `work.js item link`, mark done manually, then generate `work.js summary --notify`.
6. Review whether the summary is genuinely useful. If not, cut or redesign the summary before adding automation.

Still gated/backlog: Notification -> permission_required, permission_resolved synthesis, PostToolUse -> error, testPass, automatic task decomposition, automatic agent spawning, database/cloud/account features.
