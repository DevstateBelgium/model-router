---
name: setup
description: Connect model-router to a private GitHub knowledge repo, creating and seeding it if needed, or show the current setup.
argument-hint: "[owner/repo]"
disable-model-invocation: true
---

Target repo: `$ARGUMENTS`

1. Show the current state by running with the Bash or PowerShell tool:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs" status --data "${CLAUDE_PLUGIN_DATA}" --repo "${user_config.knowledge_repo}"
```

2. If no target repo was given, report the status in two lines and explain that `/model-router:setup <owner/repo>` connects a repo. Stop.
3. If a target repo was given, check that it looks like `owner/repo`. Then write `{"knowledge_repo": "<owner/repo>"}` to `${CLAUDE_PLUGIN_DATA}/config.json` with the Write tool. Mention that the `/config` panel's model-router "Knowledge repo" field takes precedence when it is set.
4. Ask the user to confirm before creating anything on GitHub. Say whether the repo will be created (private) or only seeded. After confirmation, run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs" init --data "${CLAUDE_PLUGIN_DATA}" --repo "<owner/repo>"
```

5. Report the result in one line.
