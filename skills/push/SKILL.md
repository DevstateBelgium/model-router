---
name: push
description: Push pending model-router run rows, telemetry, and proposed routing changes to the GitHub knowledge repo.
disable-model-invocation: true
---

1. If `mirror/boundaries.md` or `mirror/models.md` in `${CLAUDE_PLUGIN_DATA}` has lines marked `(proposed)`, list them for the user in one line each. They go live with this push.
2. Run this command with the Bash or PowerShell tool:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs" push --data "${CLAUDE_PLUGIN_DATA}" --repo "${user_config.knowledge_repo}"
```

   If your session requires attribution trailers on commits, add each one as `--trailer "<line>"`. Do not add model names or session URLs otherwise.

3. Report in one short line: what was pushed and the commit URL.

Exit codes: 0 means done or nothing to push. 2 means a conflict: run `/model-router:pull`, then push again. Never force anything. 1 means another failure: report it.

- If no repo is configured, suggest `/model-router:setup <owner/repo>`.
- If `gh` is not authenticated: locally, suggest `gh auth login`. In a cloud session, add the repo with the add_repo tool (push access) and retry once. Do not try any other route.
