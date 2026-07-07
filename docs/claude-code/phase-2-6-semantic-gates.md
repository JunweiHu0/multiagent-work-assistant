# Phase 2.6 Semantic Gates

- Date: 2026-07-06
- Scope: Claude Code adapter semantic expansion
- Status: gated, not wired into live hooks yet

Phase 2.6 is intentionally conservative. The current real probe records prove that Claude Code can deliver Bash / Read / Write / Stop hook payloads, but they do not yet prove a stable permission or failure schema. Therefore this phase adds explicit semantic gates and tests, instead of guessing from prompt text, stdout, stderr, source, diffs, or transcript content.

## What Is Safe To Ship Now

The shipped adapter remains the Phase 2.2.0 MVP:

- `PreToolUse:Bash -> command_running`
- `PreToolUse:Read/Grep/Glob/WebFetch/WebSearch -> file_reading`
- `PreToolUse:Write/Edit/MultiEdit/NotebookEdit -> file_editing`
- `PostToolUse -> step_done`
- `Stop -> turn_ended`

No live hook currently emits `permission_required`, `permission_resolved`, `error`, or `testPass`.

## Gates Added In This Phase

Files:

```text
adapters/claude-code/semantic-gates.js
adapters/claude-code/semantic-gates-test.js
```

The gate module is not imported by the live hook entries yet. It defines what kind of evidence is allowed to unlock future mappings:

- `testPass` may only be emitted when the previous command looks like a test/build command **and** a structured success field exists.
- `error` may only be emitted from structured fields such as `exit_code`, `success`, `ok`, `is_error`, or stable status enums.
- `permission_required` may only be emitted from structured notification fields such as `notification_type`, `kind`, `category`, or `reason` when they explicitly identify a permission/approval request.
- Message-only notifications are not enough because they are language- and UI-dependent.

## Explicit Non-Gates

These must not be used to infer semantics:

- `stdout` body
- `stderr` body
- source file content
- diffs / patches
- `last_assistant_message`
- transcript text
- prompt text
- arbitrary human-facing notification text

## Why This Counts As Phase 2.6 Progress

The goal of Phase 2.6 is not to make the pet appear smarter by guessing. The goal is to safely prepare high-value semantics so they can be enabled once real payload evidence exists. This phase turns that rule into executable tests.

Run:

```cmd
node adapters\claude-code\semantic-gates-test.js
```

Expected result: `ALL PASS`.

## Remaining Work To Actually Enable Semantics

Before wiring the gates into live hooks, collect new real probe records for:

1. A Claude Code permission/approval wait that emits a `Notification` payload with structured fields.
2. A failed Bash command or failed tool call with a structured outcome field.
3. A successful test/build command with a structured success field.

After that, update `adapters/claude-code/lib.js` and `manual-fixture-test.js` in one small PR/commit, keeping the same no-leak guarantees.