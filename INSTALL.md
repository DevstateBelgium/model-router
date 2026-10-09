# INSTALL.md (for an LLM agent)

This folder is a complete Claude Code plugin. Installing it means copying the folder; there are no install scripts to run.

1. Default target is personal scope: `<home>/.claude/skills/model-router/` (Windows `%USERPROFILE%\.claude\skills\model-router\`). Use project scope (`<repo>/.claude/skills/model-router/`) only if the user asks for it. Project-scope plugins load only from the session's primary working directory, after the user trusts the folder.
2. If the target exists, read its `.claude-plugin/plugin.json` `version`, tell the user what will be replaced, and wait for confirmation. Move the old folder aside as `model-router.bak` rather than deleting it.
3. Copy the whole folder, including the hidden `.claude-plugin/` directory. Do not edit any file.
4. Remove legacy v1 files if they exist, after telling the user: `<home>/.claude/commands/model-router-pull.md`, `<home>/.claude/commands/model-router-push.md`, and a `<home>/.claude/skills/model-router/` that has a `SKILL.md` at its root but no `.claude-plugin/`. v1 queue data (`pending-runs.md`) should be copied into the new data dir after the first session start.
5. Verify: if the `claude` CLI is available, run `claude plugin validate <target>`. Check that `node --version` works; without Node.js, hooks are off and the skill falls back to manual seeding.
6. Tell the user: start a new session (or run `/reload-plugins`), then check that `/model-router:stats` exists. Optionally connect shared knowledge with `/model-router:setup <owner/repo>`.

Do not create GitHub repos, push, or run `/model-router:setup` during installation.
