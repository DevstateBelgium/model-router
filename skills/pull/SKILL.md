---
name: pull
description: Pull the shared model-router knowledge from the GitHub knowledge repo into the local mirror.
disable-model-invocation: true
---

Run this command with the Bash or PowerShell tool and report its output in one short line:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs" pull --data "${CLAUDE_PLUGIN_DATA}" --repo "${user_config.knowledge_repo}"
```

- The script overwrites `mirror/` but keeps local lines marked `(proposed)` and never touches `pending-runs.md`.
- If it says no repo is configured, suggest `/model-router:setup <owner/repo>`.
- If it says `gh` is not authenticated: locally, suggest `gh auth login`. In a cloud session, add the repo with the add_repo tool (push access) and run the command again once. Do not try any other route.
