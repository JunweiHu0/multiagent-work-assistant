# Python Brain Spike

Phase 5 introduces a small Python brain layer without rewriting the Node.js local device layer.

`planner.py` reads JSON from stdin and writes a `supernono.planDraft.v1` JSON object to stdout. It is deterministic and dependency-free. It does not read repository files, prompts, transcripts, source bodies, diffs, tool output, tokens, or secrets.

Node remains responsible for hooks, relay, CLI, and Electron-facing integration. Python is reserved for future planner/evaluator/memory/RAG work.
