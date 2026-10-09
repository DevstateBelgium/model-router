---
name: run
description: Orchestrate coding work by delegating each subtask to the cheapest Claude model and effort that can do it reliably (Claude Haiku 5.5, Claude Sonnet 5.5, Claude Opus 5.5, Claude Fable 5.1). Use for any multi-step coding task where subagents are spawned, when the user asks which model to use for a task, or when they want cost and quality balanced. Logs verified outcomes and revises routing only when the evidence supports it.
---

# Model Router

You are the orchestrator. You plan, split, delegate, and verify. Subagents execute. Keep the intelligence in planning and verification, and push execution to the cheapest tier that can do it. Orchestration works best on Claude Opus 5.5 at xhigh effort; suggest it once if the session runs on something weaker.

## Where things live

- Data dir: `${CLAUDE_PLUGIN_DATA}` (persistent across plugin updates). The SessionStart hook prints the exact path as `[model-router] data dir:`. If the two differ, use the hook's path.
  - `mirror/models.md`, `mirror/boundaries.md`, `mirror/runs.md`, `mirror/CHANGELOG.md`: copy of the knowledge repo.
  - `pending-runs.md`: your judgment rows that are not pushed yet.
  - `telemetry.jsonl`: written by hooks, never by you. One `call` event and one `usage` event per subagent, with resolved model, tokens, duration, and estimated USD.
  - `state.json`: `lastPull`, `lastPush`, `lastModelCheck`.
- Knowledge repo: `${user_config.knowledge_repo}`. If that is empty or shows as a literal placeholder, read `knowledge_repo` from `<data dir>/config.json`. If neither is set, work local-only and do not mention push or pull.
- If the data dir does not exist (hooks could not run, for example Node.js is missing), copy the files from `${CLAUDE_PLUGIN_ROOT}/seed/` into it first, the same way the hook does: `models.md`, `runs.md`, `boundaries.md`, and `CHANGELOG.md` into `mirror/`, and `pending-runs.md` and `prices.json` into the root. Tell the user once that automatic telemetry is off without Node.js.

Use Read, Write, Edit, and Glob for these files, not shell commands.

## Start of a run

1. Read the SessionStart summary in your context. It lists active boundaries, pending rows, and notes such as a stale mirror.
2. Read `mirror/models.md` and `mirror/boundaries.md` once per session.
3. If the summary says the mirror is stale, suggest `/model-router:pull` once. Do not block the task on it.

## Tiers

Each tier is a plugin agent that pins its model and effort. Spawn it with `subagent_type` set to the agent name. Do not pass `model` as well, because that overrides the pinned model.

| Tier | subagent_type | Full model name | Effort | Use for |
|---|---|---|---|---|
| scout | `model-router:scout` | Claude Haiku 5.5 | medium | Reading and searching files, collecting facts, summaries, renames, boilerplate, formatting, running tests and reporting failures. |
| builder | `model-router:builder` | Claude Sonnet 5.5 | high | A well-specified change across 1 to 3 files with a test or command as acceptance check. |
| engineer | `model-router:engineer` | Claude Opus 5.5 | medium | Multi-file changes, refactors across shared interfaces, integration, bugs with an unclear cause. |
| senior | `model-router:senior` | Claude Opus 5.5 | xhigh | An engineer-level task that failed at medium. |
| architect | `model-router:architect` | Claude Fable 5.1 | high | Trade-off decisions, security-sensitive logic, root-cause work after two failed attempts at a lower tier. |

If a `model-router:*` agent is not available, fall back to `general-purpose` with the tier's model in `model`, and log the effort as `default`. Aliases can resolve to an older model (in testing, `haiku` ran Claude Haiku 4.5), so check `resolved_model` in telemetry and log the model that actually ran.

For read-only searching, the built-in `Explore` agent is an acceptable scout substitute.

When the plugin's mod is loaded (Claude Code 2.1.287+), it drops any `model` you pass with a `model-router:*` agent and shows a toast. It also meters every request, yours included. Point the user to `/router` for live cost per tier; `/model-router:stats` covers subagent history from telemetry.

## Routing procedure

1. Split the work into tasks. Each task has one outcome, the files it may touch, and an acceptance check (a test, a command, or an observable behavior). Tasks without an acceptance check go to the engineer tier at minimum, because nothing can verify them cheaply.
2. Classify each task:
   - Read-only, mechanical, or fully specified with a clear check: scout.
   - Clear spec, testable outcome, 1 to 3 files: builder.
   - Spans files, or the cause is unknown: engineer.
   - Trade-off, security, or two failed attempts at a lower tier: architect.
3. Check the active boundaries. If one applies, follow it over the defaults above.
4. Write a brief that needs no other context: goal, paths, constraints, acceptance check, and the expected short report.
5. Run independent tasks in parallel in one message. Run dependent tasks in sequence.
6. Verify every result yourself. Read the diff and run the check. Never report success you did not verify.
7. Escalation: if verification fails, retry once at the same tier with a sharper brief that adds the missing context. If it fails again, move one tier up. Never repeat the same tier with the same brief. Send work to the architect only with a written summary of what the lower tiers tried.
8. Cost rules: do not delegate work that takes less time to do directly than to brief. Do not spawn for a single trivial edit. Prefer one builder over one engineer when the spec is clear. Prefer engineer over senior unless the first attempt failed.

## Logging

Hooks record cost automatically. You record judgment. After each delegated task is verified, append one row to `pending-runs.md`:

`| id | date | env | agent id | task (short) | tier | full model name | effort | escalated from | verification | outcome | note |`

- id: `<env>-<yyyymmddHHMM>-<n>`, so rows from different environments never collide.
- env: `local` or `cloud`.
- agent id: the `agentId` from the Agent result if shown, otherwise `-`. It joins the row to telemetry.
- verification: `pass`, `fail`, or `partial`, plus the check that was used.
- outcome: `as expected`, `over-performed` (a lower tier would likely have passed but was not tried), or `under-performed` (a tier failed on a brief that was clear enough).
- note: one line on the pattern, not the file, for example "multi-file refactor of shared types".

If the outcome could not be verified, write `unverified` and why. Do not guess.

## Output rule

Stay quiet about the skill unless something new was learned. When a run adds an `over-performed` or `under-performed` row, or a boundary changes, end the reply with one short block in the user's language:

`Model-router: learned <n> thing(s): <one line each>. Push with /model-router:push.`

## Self-update

### Review

Run a review when five or more rows are pending, or when the same pattern shows up three times with the same outcome.

1. Read `pending-runs.md` and `mirror/runs.md` in full. Run `/model-router:stats` or read `telemetry.jsonl` for the real cost per tier. If the mod is loaded, `/router` adds the orchestrator's own cost.
2. For each candidate rule, count supporting rows across both files. A rule needs at least three consistent rows before it changes routing. One row is an observation, not a rule.
3. Add the rule to `mirror/boundaries.md` with `(proposed)` in the bullet: pattern, tier, number of supporting rows, date.
4. Change at most three bullets per review.
5. A proposed bullet goes live only after `/model-router:push`. Do not route on it before that.

### Locked sections

Do not change Routing procedure steps 6 and 7 (verification and escalation) or the Logging format. Those are the safeguards. Learned boundaries may change; the rules that make routing trustworthy may not.

### New models

If the SessionStart notes say the last model check is over 30 days old, or the user names a model that is not in `mirror/models.md`, search for current Anthropic model releases with WebSearch, preferring anthropic.com. For each new model:

1. Propose a row for the models table with its full name, API ID, and alias, marked `(proposed)`.
2. Propose a seed-evidence row marked unverified, and a price entry for `<data dir>/prices.json`.
3. Do not put it in a tier until it has three logged runs, unless the user asks.
4. Update `lastModelCheck` in `state.json` and propose a CHANGELOG line.

If a new alias appears in the Agent tool's `model` parameter, map it to a full name in the models table before using it.
