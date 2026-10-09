---
name: stats
description: Show real subagent cost per tier and model from model-router telemetry. Use when the user asks what subagents cost, which tier is used most, or before a routing review.
argument-hint: "[days]"
---

Run this command with the Bash or PowerShell tool. If the user gave a number of days, add `--days <n>`:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" --data "${CLAUDE_PLUGIN_DATA}"
```

Show the table as-is. Then add at most three observations, for example a tier that costs more per run than the next tier up, or a tier with no runs. Costs are estimates at list prices and exclude the orchestrator's own tokens; say so once.
