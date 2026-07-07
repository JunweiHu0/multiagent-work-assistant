# Phase 3.6 Real-Use Acceptance Plan

Date: 2026-07-07
Status: ready to run with a real task

Phase 3.6 is not another feature build. It is the first product-quality field test of the local orchestrator MVP.

## Goal

Prove whether the manual loop actually reduces coordination load:

```text
workflow review-loop
-> Codex implements
-> Claude Code reviews
-> link AgentRuns
-> resolve decision / mark done
-> summary --notify
-> user reads the handoff
```

The acceptance question is not "did the scripts run?" The question is:

> Would the user willingly use this summary and workflow again on a real workday?

## Setup

Terminal A:

```cmd
cd C:\Users\1\Desktop\project\multiagent-work-assistant
node orchestrator\relay.js
```

Agent environment:

```cmd
set SUPERNONO_BRIDGE_PORT=4175
```

Create a workflow:

```cmd
node orchestrator\work.js workflow review-loop "<real task title>" --goal "<one sentence outcome>"
node orchestrator\work.js status
node orchestrator\work.js prompt review-loop
```

## Run Checklist

1. Copy the Codex prompt into Codex and let Codex work on the build item.
2. Copy the Claude Code prompt into Claude Code and let it review the result.
3. Keep relay running while both agents work.
4. Use `work status` to find unassigned runs.
5. Link runs:

```cmd
node orchestrator\work.js item link wi1 codex:<sessionId>
node orchestrator\work.js item link wi2 claude-code:<sessionId>
```

6. Resolve the review decision:

```cmd
node orchestrator\work.js decision resolve dr1 accept
```

7. Mark items done only when the user agrees they are done:

```cmd
node orchestrator\work.js item done wi1
node orchestrator\work.js item done wi2
```

8. Generate handoff:

```cmd
node orchestrator\work.js summary --notify
```

## What To Observe

Record answers after the run:

- Did `work status` tell you where the work stood without opening both agent windows?
- Were unassigned AgentRuns easy to link?
- Did the review-loop prompt save time, or did you rewrite most of it?
- Did the summary contain useful next actions?
- Was anything noisy, stale, or misleading?
- Did the pet notification help, or was it decorative?
- What did you still have to remember manually?

## Pass Criteria

Phase 3.6 passes only if all are true:

- The workflow can be completed without editing runtime JSON manually.
- `work status` accurately reflects active/done/waiting items.
- `summary` is readable enough to serve as a handoff note.
- No prompt, transcript, source, diff, tool output, token, or secret appears in the summary.
- The user can name one concrete way this reduced coordination effort.

## Fail Criteria

Any of these means improve Phase 3.7 before adding automation:

- Summary is too generic to be useful.
- User still needs to inspect every agent window to know the state.
- WorkItem / AgentRun linking is confusing.
- The prompt generator creates text the user mostly discards.
- The pet notification does not correspond to a meaningful user moment.

## Review Prompt For CC/Fable

```text
Please review the Phase 3.6 real-use result for SuperNoNo / Multiagent Work Assistant.

Read:
- docs/acceptance/phase-3-6-real-use.md
- docs/planning/next-task-plan.md
- orchestrator/README.md
- generated .supernono/summaries/*.md if provided by the user

Review question:
Does the current manual orchestrator loop reduce coordination load enough to justify adding automation?

Prioritize:
1. Product usefulness of work status and summary.
2. Whether prompt generator outputs are actually copyable.
3. Missing safety boundaries or accidental content leakage risks.
4. The smallest next improvement before any auto-scheduling.

Do not implement code unless asked. Produce findings first, then recommended next steps.
```
