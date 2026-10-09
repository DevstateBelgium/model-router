# model-router

A Claude Code plugin that routes each coding subtask to the cheapest Claude model and effort that can do it reliably. It measures what every subagent really costs and learns routing rules from verified runs.

## Install (pick one)

**1. From the marketplace (recommended, gets updates).** At the Claude Code prompt:
```
/plugin install model-router --marketplace DevstateBelgium/model-router
```
Answer `y` to add the marketplace, then pick a scope. Or in two steps:
```
/plugin marketplace add DevstateBelgium/model-router
/plugin install model-router@model-router
```

**2. Drop-in, zero commands.** Clone this repo into `~/.claude/skills/model-router/` (Windows: `%USERPROFILE%\.claude\skills\model-router\`) and start a new session:
```
git clone https://github.com/DevstateBelgium/model-router ~/.claude/skills/model-router
```
Claude Code loads any folder there that has `.claude-plugin/plugin.json` as a plugin (`model-router@skills-dir`), including its agents and hooks.

**3. Whole team, per repository.** Commit this to the project's `.claude/settings.json`. Teammates get it after they trust the folder:
```json
{
  "extraKnownMarketplaces": { "model-router": { "source": { "source": "github", "repo": "DevstateBelgium/model-router" } } },
  "enabledPlugins": { "model-router@model-router": true }
}
```

**4. Ask Claude to install it, in any session.** Say "install the plugin from https://github.com/DevstateBelgium/model-router". Claude follows [INSTALL.md](INSTALL.md), which runs `node scripts/install.mjs --live`.

### First run

The first time the plugin loads, it starts a short configuration run. In an interactive session the mod queues it automatically; in every other session the SessionStart hook tells Claude to run it on your first message. The run checks Node.js, Claude Code and `gh`, then asks one question: local-only, connect an existing knowledge repo, or create a new private one. Run it again any time with `/model-router:setup`.

### Cloud sessions

A cloud session starts from a fresh clone of your repository, and Claude Code loads plugins only at session start. There are two ways to get model-router there:

- **Every session, from the start (recommended):** add this line to the cloud environment's setup script. It runs before Claude Code launches and is cached with the environment, so everything (skill, agents, hooks, mod) is active from the first message:
  ```
  git clone --depth 1 https://github.com/DevstateBelgium/model-router ~/.claude/skills/model-router || true
  ```
- **In a session that is already running:** ask Claude to install it (option 4). The installer's `--live` mode also writes plain copies of the skill and the five tiers. Claude Code watches `~/.claude/skills/` and `~/.claude/agents/` and picks up new files within seconds, so routing works in the same session. Only folders that existed when the session started are watched. Cloud sessions start with a skills folder but no agents folder, so there the tiers are written as forked skills (`context: fork`) that run as subagents with the same pinned model and effort. When even the skills folder is missing, the installer says so and Claude reads the skill file directly. Hooks, telemetry, the mod and `/model-router:*` commands need a plugin reload. Claude can't trigger that itself, and over a remote connection it's refused, so those parts start in the next session. The live copies delete themselves once the plugin loads.

Requirements: a recent Claude Code (tested on 2.1.292). Node.js 18+ on PATH for the hooks and scripts. Without Node.js the skill and agents still work, but automatic telemetry and push/pull are off. `gh` is needed only for push/pull.

## What you get

| Component | What it does |
|---|---|
| `model-router` skill | Orchestration rules: split work, pick a tier, verify, escalate, log. Loads when Claude delegates work. |
| 5 tier agents | `model-router:scout` (Claude Haiku 5.5, medium), `builder` (Claude Sonnet 5.5, high), `engineer` (Claude Opus 5.5, medium), `senior` (Claude Opus 5.5, xhigh), `architect` (Claude Fable 5.1, high). Each pins its model **and effort**. |
| SessionStart hook | Seeds the data dir on first run, then adds a short summary to context: active boundaries, pending rows, a stale-mirror warning, a model-check reminder. |
| PostToolUse + SubagentStop hooks | Log every subagent: resolved model, tokens summed over the whole subagent transcript, duration, estimated USD. No model effort needed. |
| Mod (`hooks/router.tsx`) | Runs inside Claude Code (needs v2.1.287+, otherwise ignored). Drops a `model` override on `model-router:*` spawns so the pinned model and effort always run. Meters every model request, orchestrator included, and shows `router $… · subagents $…` in the status line. Keeps per-session totals across sessions. |
| `/router` | Mod command. Opens a pane with this session's cost per tier and model, plus the last 7 days. Answers instantly with no model turn, and also works in `claude -p`. |
| `/model-router:stats [days]` | Real cost per subagent run, from telemetry (works without the mod). |
| `/model-router:setup [owner/repo \| local]` | First-run configuration, also runnable any time: prerequisite check, then an optional private knowledge repo (created and seeded after confirmation). |
| `scripts/install.mjs` | Cross-platform installer. `--live` makes the skill and agents work in the running session, cloud sessions included. |
| `/model-router:pull`, `/model-router:push` | Sync shared knowledge across machines and cloud sessions. Push detects conflicts instead of overwriting. |

## Data

State lives in `~/.claude/plugins/data/model-router-<origin>/` and survives plugin updates:
`mirror/` (copy of the knowledge repo), `pending-runs.md` (judgment rows), `telemetry.jsonl` (hook-written cost data), `prices.json`, `state.json`, and optional `config.json`.

The knowledge repo is optional. Set it in `/config` (model-router > Knowledge repo) or with `/model-router:setup`. Without one, everything runs locally.

## Tests

- `bash tests/sync.test.sh` runs push/pull end to end against a fake GitHub API (`tests/fake-gh.mjs`), so no network access is needed.
- `bash tests/install.test.sh` checks the installer, the live copies, first-run state and cleanup against a fake home directory.
- `claude plugin test .` runs the mod's tests (`tests/router.test.ts`).
- `claude plugin validate . --strict` checks the manifests and lists what the mod hooks and calls.
- Type-check the mod: load it once (`claude --plugin-dir .`) so Claude Code writes `.claude-plugin/types/`, then run `tsc -p .`. Both generated paths are git-ignored.
