# CHANGELOG

- 2026-10-09: skill created. Seed routing from third-party benchmarks for Claude Haiku 5.5, Claude Sonnet 5.5, Claude Opus 5.5, and Claude Fable 5.1. Last model check: 2026-10-09.
- 2026-10-09: v2.0.0 packaged as a Claude Code plugin. Tier agents pin model and effort; hooks log real subagent tokens and cost to telemetry.jsonl.
- 2026-10-09: v2.1.0 adds a mod: pinned tiers ignore model overrides, live per-tier cost including the orchestrator in the status line and the /router pane.
- 2026-10-09: v2.2.0 adds a first-run configuration run, a cross-platform installer, and live install: plain skill and agent copies that work in the running session (cloud included) until the plugin loads.
