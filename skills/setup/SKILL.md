---
name: setup
description: First-run configuration for model-router, or reconfigure it. Checks prerequisites, connects or creates an optional private GitHub knowledge repo, and explains cloud persistence. Use when the model-router SessionStart context says FIRST RUN, or when the user asks to configure model-router.
argument-hint: "[owner/repo | local]"
---

Arguments: `$ARGUMENTS`

Keep this short: a few lines of output, at most one question.

1. Run with the Bash or PowerShell tool:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs" --data "${CLAUDE_PLUGIN_DATA}" --repo "${user_config.knowledge_repo}"
```

2. If `configuredAt` is set and no arguments were given, report the status in two lines and stop.
3. Report problems from the doctor output, one line each with the fix. Skip what is fine.
   - `node.ok` false: hooks and scripts need Node.js 18+.
   - `claudeCode.modsSupported` false: the live cost pane, `/router` and pinned-model enforcement need Claude Code 2.1.287+; everything else works.
   - `gh.authenticated` false: only needed for a knowledge repo; locally `gh auth login`.
4. Choose the knowledge repo:
   - An `owner/repo` argument: use it. `local`: none.
   - Otherwise ask one question with AskUserQuestion: "Local only (Recommended for one machine)", "Connect an existing repo", or "Create a new private repo". For a new repo, suggest `<gh.user>/model-router-knowledge`.
   - If you cannot ask (non-interactive session), choose local only and say how to change it later: `/model-router:setup <owner/repo>`.
5. For a repo: confirm before creating anything on GitHub, then run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs" init --data "${CLAUDE_PLUGIN_DATA}" --repo "<owner/repo>"
```

6. Mark the configuration done (add `--repo "<owner/repo>"` when a repo was chosen):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs" --data "${CLAUDE_PLUGIN_DATA}" --mark-configured
```

7. If `env` is `cloud`, add two lines: this container is temporary, so push learned rows before the session ends. To have the plugin from the start in every new cloud session, add this line to the cloud environment's setup script:
   `git clone --depth 1 https://github.com/DevstateBelgium/model-router ~/.claude/skills/model-router || true`
8. End with one line: what was configured, and that routing is active (`/router` shows live cost when the mod is supported).
