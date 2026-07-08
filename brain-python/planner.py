#!/usr/bin/env python3
"""
SuperNoNo deterministic Python planner (Phase 5 spike).

Reads a single JSON object from stdin and writes one SuperNoNo plan draft JSON
object to stdout. It has no third-party dependencies and intentionally does not
read repository files, transcripts, prompts, diffs, tool output, tokens, or
secrets. This is an interface spike, not an LLM planner.
"""
from __future__ import annotations

import datetime as _dt
import json
import re
import sys
from typing import Any, Dict

VERSION = "0.1.0"


def _safe_text(value: Any, limit: int = 240) -> str:
    if not isinstance(value, str):
        return ""
    text = re.sub(r"[\r\n\t]+", " ", value).strip()
    return text[:limit]


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _stamp() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%d-%H%M%S")


def _build_review_loop(title: str, goal: str, mode: str, context: Dict[str, Any]) -> Dict[str, Any]:
    active_session = context.get("activeSession") if isinstance(context.get("activeSession"), dict) else None
    assumptions = [
        "The user will manually review and accept this plan before any WorkSession is created.",
        "Codex is the builder and Claude Code is the reviewer by default.",
        "The orchestrator will not spawn agents or approve tools automatically.",
    ]
    if active_session and active_session.get("id"):
        assumptions.append("There is an existing active session: %s; accepting this draft will create a new session." % active_session.get("id"))

    return {
        "schema": "supernono.planDraft.v1",
        "draftId": "pdpy-" + _stamp(),
        "createdAt": _now_iso(),
        "mode": mode or "review-loop",
        "title": title,
        "goal": goal,
        "planner": {
            "kind": "python-deterministic",
            "version": VERSION,
            "interface": "stdin-stdout-json",
        },
        "workItems": [
            {
                "id": "pwi1",
                "title": "Codex implement: " + title,
                "role": "build",
                "assignedAgent": "codex",
                "notes": "Implement the smallest useful change, keep scope tight, and report changed files plus checks.",
            },
            {
                "id": "pwi2",
                "title": "Claude Code review: " + title,
                "role": "review",
                "assignedAgent": "claude-code",
                "after": ["pwi1"],
                "notes": "Review correctness, integration risk, missing tests, and product fit before suggesting fixes.",
            },
        ],
        "decisionGates": [
            {
                "id": "pdr1",
                "kind": "manual",
                "itemRef": "pwi2",
                "summary": "Accept the review result for: " + title,
            }
        ],
        "assumptions": assumptions,
        "risks": [
            "The plan is template-based and may miss project-specific subtasks.",
            "Manual run linking is still required after agents emit events.",
            "If this draft feels too generic, improve the planner template before adding LLM calls.",
        ],
        "checklist": [
            "Review this draft before accepting it.",
            "Run: node orchestrator/work.js plan accept <plan.json>",
            "Run: node orchestrator/work.js prompt pack <sessionId>",
            "Copy prompts into Codex and Claude Code manually.",
            "Link observed AgentRuns and resolve the decision gate manually.",
            "Generate a summary with: node orchestrator/work.js summary --notify",
        ],
        "constraints": [
            "No automatic agent spawn.",
            "No automatic authorization.",
            "No prompt/transcript/source/diff/tool-output ingestion.",
            "Python stays out of hook hot paths.",
        ],
        "acceptedAt": None,
        "acceptedSessionId": None,
    }


def main() -> int:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw or "{}")
    except Exception as exc:  # noqa: BLE001 - CLI boundary should return structured failure.
        sys.stderr.write("invalid planner input JSON: %s\n" % exc)
        return 2

    if not isinstance(data, dict):
        sys.stderr.write("planner input must be a JSON object\n")
        return 2

    title = _safe_text(data.get("title"), 200)
    if not title:
        sys.stderr.write("planner input requires title\n")
        return 2
    goal = _safe_text(data.get("goal"), 500) or title
    mode = _safe_text(data.get("mode"), 80) or "review-loop"
    if mode != "review-loop":
        sys.stderr.write("unsupported mode: %s\n" % mode)
        return 2

    context = data.get("context") if isinstance(data.get("context"), dict) else {}
    draft = _build_review_loop(title, goal, mode, context)
    sys.stdout.write(json.dumps(draft, ensure_ascii=False, indent=2))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
