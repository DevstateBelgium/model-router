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

## How to use it

**Start a task.** Ask for the work as you normally would. The skill loads by itself when Claude splits multi-step work across subagents. To force it, start the request with `/model-router` (or `/model-router:run` when the mod is not loaded):
```
/model-router move the date helpers into utils/ and add tests
```
Ask "which model should do X?" to get a routing suggestion without running anything. Orchestration works best when the main session runs Claude Opus 5.5 at xhigh effort, because the orchestrator does the planning and verification.

**Automatic mode.** Type `/model-router:start` once, and every prompt you type after that is routed, without a prefix. The status line starts with `auto ·` while it is on. `/model-router:stop` turns it off. It lasts for the current session only, so each new session starts with it off. Prompts that start with a slash command are left alone, and `/model-router <task>` keeps working as a one-off without changing the mode. The first routed prompt loads the skill; later prompts get a short reminder, so the skill text is not repeated every turn. Needs the mod.

**What happens during a run.** Claude splits the request into tasks, each with the files it may touch and an acceptance check. Each task goes to the cheapest tier that fits:

| Task looks like | Tier |
|---|---|
| Reading, searching, renames, boilerplate, running tests | scout |
| Clear spec, 1 to 3 files, a test to pass | builder |
| Multi-file change, refactor, bug with an unknown cause | engineer |
| Engineer task that failed once | senior |
| Trade-off, security-sensitive logic, two failed attempts | architect |

Independent tasks run in parallel. Claude checks every result itself (reads the diff, runs the check). A failed task is retried once with a sharper brief, then moved one tier up. Small edits that take less time to do than to brief are done directly, without a subagent.

**See what it cost.** Type `/router` for this session's cost per tier and model (needs the mod, Claude Code 2.1.287+). `/model-router:stats 7` shows subagent cost over the last 7 days from telemetry, with or without the mod.

**How it learns.** After each verified task, Claude adds one judgment row to `pending-runs.md`: tier, model, effort, whether the check passed, and whether the tier was too strong or too weak. When a run teaches something new, the reply ends with a one-line `Model-router: learned …` note. Once five rows are pending, or one pattern repeats three times, Claude proposes routing rules in `boundaries.md`, marked `(proposed)`. A rule needs at least three consistent rows, and it takes effect only after you push.

**Share what it learned.** With a knowledge repo configured (`/model-router:setup`):
- `/model-router:push` sends pending rows, telemetry and proposed rules to the repo. It lists the proposed rules first, so you see what goes live.
- `/model-router:pull` brings in what other machines and cloud sessions learned. The SessionStart summary tells you when the local copy is stale.

## What you get

| Component | What it does |
|---|---|
| `/model-router:run` skill | Orchestration rules: split work, pick a tier, verify, escalate, log. Loads when Claude delegates work. |
| 5 tier agents | `model-router:scout` (Claude Haiku 5.5, medium), `builder` (Claude Sonnet 5.5, high), `engineer` (Claude Opus 5.5, medium), `senior` (Claude Opus 5.5, xhigh), `architect` (Claude Fable 5.1, high). Each pins its model **and effort**. |
| SessionStart hook | Seeds the data dir on first run, then adds a short summary to context: active boundaries, pending rows, a stale-mirror warning, a model-check reminder. |
| PostToolUse + SubagentStop hooks | Log every subagent: resolved model, tokens summed over the whole subagent transcript, duration, estimated USD. No model effort needed. |
| Mod (`hooks/router.tsx`) | Runs inside Claude Code (needs v2.1.287+, otherwise ignored). Drops a `model` override on `model-router:*` spawns so the pinned model and effort always run. Meters every model request, orchestrator included, and shows `router $… · subagents $…` in the status line. Keeps per-session totals across sessions. |
| `/router` | Mod command. Opens a pane with this session's cost per tier and model, plus the last 7 days. Answers instantly with no model turn, and also works in `claude -p`. |
| `/model-router <task>` | Mod command. Short form of `/model-router:run`: forwards the task to the skill. Without the mod, use `/model-router:run`. |
| `/model-router:start`, `/model-router:stop` | Turn automatic mode on or off for this session. The mod answers them directly, with no model turn. |
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
