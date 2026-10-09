# INSTALL.md (for an LLM agent)

Install model-router with its own installer. It works the same on Windows, macOS, Linux and in cloud sessions, and it can make the plugin usable in the session you are in, with no restart.

1. Get the code if you don't have it yet: `git clone --depth 1 https://github.com/DevstateBelgium/model-router <tmp-dir>`.
2. Run, with the Bash or PowerShell tool:
   ```
   node <tmp-dir>/scripts/install.mjs --live
   ```
   - `--scope project` installs into the current repository's `.claude/skills/` instead of the user's `~/.claude/skills/`. Use it only when the user asks.
   - If it exits with code 2, an install already exists: tell the user its version, and re-run with `--force` only after they confirm. The old copy is kept as a backup.
3. Read the installer's output and act on it:
   - **live skill / live agents hot-loaded**: they are usable from your next step: the `model-router-live` skill and the agents `model-router-scout`, `-builder`, `-engineer`, `-senior` and `-architect`.
   - **NOT hot-loaded**: read the skill file it names and follow it for this session; use `general-purpose` with the tier's model ID instead of the tier agents.
   - **NEXT**: run the first-run configuration it describes now.
   - **CLOUD**: pass the setup-script line on to the user.
4. Tell the user in two or three lines what is active now and what becomes active at the next session start or after `/reload-plugins`: hooks, automatic telemetry, the mod with `/router`, and the `/model-router:*` commands.

The live copies remove themselves the first time the plugin loads properly. Do not create GitHub repos or push anything unless the configuration step asks the user and they agree.
