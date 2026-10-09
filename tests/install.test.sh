#!/usr/bin/env bash
# Offline test of scripts/install.mjs, the live shims, first-run state and shim cleanup. Uses a fake home.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
to_native() { command -v cygpath >/dev/null && cygpath -m "$1" || echo "$1"; }
FAKE_HOME="$(to_native "$T/home")"; PROJ="$(to_native "$T/proj")"
mkdir -p "$T/home" "$T/proj"
export HOME="$FAKE_HOME" USERPROFILE="$FAKE_HOME"
TARGET="$T/home/.claude/skills/model-router"
DATA="$T/home/.claude/plugins/data/model-router-skills-dir"
fails=0
check() { if eval "$2"; then echo "ok   - $1"; else echo "FAIL - $1"; fails=$((fails+1)); fi; }
install() { (cd "$T/proj" && node "$ROOT/scripts/install.mjs" "$@"); }

OUT="$(install)"; check "plain install exits 0" "[ $? -eq 0 ]"
check "plugin copied" "[ -f '$TARGET/.claude-plugin/plugin.json' ] && [ -f '$TARGET/hooks/router.tsx' ]"
check "no .git or generated types copied" "[ ! -e '$TARGET/.git' ] && [ ! -e '$TARGET/.claude-plugin/types' ]"
check "data dir seeded" "[ -f '$DATA/state.json' ] && [ -f '$DATA/mirror/models.md' ]"
check "no shims without --live" "[ ! -e '$T/home/.claude/agents/model-router-scout.md' ]"
check "tells the model to configure" "echo \"\$OUT\" | grep -q 'NEXT: run the first-run configuration'"

install >/dev/null; check "existing install needs --force (exit 2)" "[ $? -eq 2 ]"

OUT="$(install --force --live)"
check "skills dir existed, so live skill is hot-loaded" "echo \"\$OUT\" | grep -q 'live skill: .*hot-loaded as /model-router-live'"
check "no agents dir: tiers become forked skills" "echo \"\$OUT\" | grep -q 'tiers are forked skills'"
check "backup kept on --force, outside skills/" "ls -d '$T/home/.claude/backups/'model-router-* >/dev/null 2>&1 && ! ls -d '$T/home/.claude/skills/'model-router.* >/dev/null 2>&1"
check "agents dir not created in skills mode" "[ ! -d '$T/home/.claude/agents' ]"
TS="$T/home/.claude/skills/model-router-scout/SKILL.md"
check "tier skill forks with pinned model and effort" "grep -q '^context: fork$' '$TS' && grep -q '^model: claude-haiku-5-5$' '$TS' && grep -q '^effort: medium$' '$TS' && grep -q '^background: false$' '$TS'"
check "tier skill carries the brief and marker" "grep -q '\$ARGUMENTS' '$TS' && grep -q 'model-router-live-shim' '$TS'"
check "live skill says tiers are forked skills" "grep -q 'Tiers in this session are forked skills' '$T/home/.claude/skills/model-router-live/SKILL.md'"
check "architect tier skill pins fable" "grep -q '^model: claude-fable-5-1$' '$T/home/.claude/skills/model-router-architect/SKILL.md'"

mkdir -p "$T/home/.claude/agents"
OUT="$(install --force --live)"
check "agents hot-loaded once the dir exists" "echo \"\$OUT\" | grep -q 'live tiers: agents .*(hot-loaded'"
check "re-install replaced the forked tier skills" "[ ! -e '$TS' ]"
SKILL="$T/home/.claude/skills/model-router-live/SKILL.md"
check "shim skill has marker and name" "grep -q 'generated-by: model-router-live-shim' '$SKILL' && grep -q '^name: model-router-live$' '$SKILL'"
check "shim skill has no unresolved plugin variables" "! grep -q '\${CLAUDE_PLUGIN\|\${user_config' '$SKILL'"
check "shim skill points at plain agent names" "grep -q 'model-router-scout' '$SKILL' && ! grep -q 'model-router:scout' '$SKILL'"
check "shim agents named and marked" "grep -q '^name: model-router-architect$' '$T/home/.claude/agents/model-router-architect.md' && grep -q 'model-router-live-shim' '$T/home/.claude/agents/model-router-architect.md'"
check "shim agent frontmatter still starts with ---" "head -1 '$T/home/.claude/agents/model-router-scout.md' | grep -q '^---'"

echo '---
name: model-router-scout
description: my own
---' > "$T/proj/user-own.md"
cp "$T/proj/user-own.md" "$T/home/.claude/agents/model-router-unrelated.md"

HOOK="$(cd "$T/proj" && echo "{\"hook_event_name\":\"SessionStart\",\"cwd\":\"$PROJ\"}" | CLAUDE_PLUGIN_ROOT="$(to_native "$TARGET")" CLAUDE_PLUGIN_DATA="$(to_native "$DATA")" node "$TARGET/scripts/session-start.mjs")"
check "hook removes shims once the plugin loads" "[ ! -e '$SKILL' ] && [ ! -e '$T/home/.claude/agents/model-router-scout.md' ] && [ ! -e '$TS' ] && [ ! -d '$T/home/.claude/skills/model-router-scout' ]"
check "hook keeps unmarked user files" "[ -f '$T/home/.claude/agents/model-router-unrelated.md' ]"
check "hook reports the cleanup" "echo \"\$HOOK\" | grep -q 'removed 6 live-install shim'"
check "hook asks for setup while unconfigured" "echo \"\$HOOK\" | grep -q 'setup was never completed'"

node "$TARGET/scripts/doctor.mjs" --data "$(to_native "$DATA")" --mark-configured --repo me/knowledge >/dev/null
HOOK="$(echo '{}' | CLAUDE_PLUGIN_ROOT="$(to_native "$TARGET")" CLAUDE_PLUGIN_DATA="$(to_native "$DATA")" node "$TARGET/scripts/session-start.mjs")"
check "no setup note once configured" "! echo \"\$HOOK\" | grep -qi 'setup'"
check "configured repo is used" "echo \"\$HOOK\" | grep -q 'knowledge repo: me/knowledge'"

rm -rf "$DATA"
HOOK="$(echo '{}' | CLAUDE_PLUGIN_ROOT="$(to_native "$TARGET")" CLAUDE_PLUGIN_DATA="$(to_native "$DATA")" node "$TARGET/scripts/session-start.mjs")"
check "fresh data dir triggers FIRST RUN" "echo \"\$HOOK\" | grep -q 'FIRST RUN'"

DOC="$(node "$TARGET/scripts/doctor.mjs" --data "$(to_native "$DATA")")"
check "doctor reports node and paths" "echo \"\$DOC\" | grep -q '\"ok\": true' && echo \"\$DOC\" | grep -q 'dataDir'"

rm -rf "$T"
echo "failures: $fails"
exit $fails
