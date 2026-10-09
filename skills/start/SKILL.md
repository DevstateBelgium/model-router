---
name: start
description: Turn on model-router automatic mode for this session: every prompt you type is routed across the tiers. Handled by the model-router mod.
disable-model-invocation: true
---

The model-router mod answers this command itself, so these instructions only reach you when the mod is not loaded. Tell the user in one line: automatic mode needs the model-router mod (Claude Code 2.1.287 or later); without it, route a task by starting the request with `/model-router:run <task>`.
