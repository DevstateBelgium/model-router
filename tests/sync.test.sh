#!/usr/bin/env bash
# Offline end-to-end test of scripts/sync.mjs against tests/fake-gh.mjs. Run from the plugin root.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
to_native() { command -v cygpath >/dev/null && cygpath -m "$1" || echo "$1"; }
export CLAUDE_PLUGIN_ROOT="$(to_native "$ROOT")"
export MODEL_ROUTER_GH="$(to_native "$ROOT/tests/fake-gh.mjs")"
export FAKE_GH_DIR="$(to_native "$T/gh")"
A="$(to_native "$T/machineA")"; B="$(to_native "$T/machineB")"
REPO=me/knowledge
sync() { node "$ROOT/scripts/sync.mjs" "$@" --repo "$REPO"; }
fails=0
check() { if eval "$2"; then echo "ok   - $1"; else echo "FAIL - $1"; fails=$((fails+1)); fi; }
mkdir -p "$T/gh"

sync pull --data "$A" >/dev/null; check "pull refuses missing repo" "[ $? -ne 0 ]"
sync push --data "$A" >/dev/null; check "push with nothing pending exits 0" "[ $? -eq 0 ]"

sync init --data "$A" >/dev/null; check "init creates and seeds repo" "[ -f '$T/gh/me/knowledge/knowledge/runs.md' ] && [ -f '$T/gh/me/knowledge/CHANGELOG.md' ]"

echo '| local-1 | 2026-10-09 | local | a1 | t | scout | Claude Haiku 5.5 | medium | - | pass | as expected | n |' >> "$A/pending-runs.md"
echo '{"event":"call","agent_id":"a1"}' >> "$A/telemetry.jsonl"
echo '- multi-file rename | builder | 3 | 2026-10-09 (proposed)' >> "$A/mirror/boundaries.md"
sync push --data "$A" --trailer "Co-Authored-By: Test <t@example.com>" >/dev/null; check "push succeeds" "[ $? -eq 0 ]"
check "run row reached repo" "grep -q 'local-1' '$T/gh/me/knowledge/knowledge/runs.md'"
check "telemetry reached repo" "grep -q '\"a1\"' '$T/gh/me/knowledge/knowledge/telemetry.jsonl'"
check "proposal went live without marker" "grep -q '^- multi-file rename | builder | 3 | 2026-10-09$' '$T/gh/me/knowledge/knowledge/boundaries.md'"
check "explanatory text kept intact" "grep -q 'containing \"(proposed)\"' '$T/gh/me/knowledge/knowledge/boundaries.md'"
check "pending emptied, header kept" "! grep -q 'local-1' '$A/pending-runs.md' && grep -q '^| id |' '$A/pending-runs.md'"
check "trailer in commit message" "grep -q 'Co-Authored-By: Test' '$T/gh/commits.log'"

sync push --data "$A" >/dev/null; check "second push has nothing to do" "[ $? -eq 0 ] && [ \$(grep -c 'local-1' '$T/gh/me/knowledge/knowledge/runs.md') -eq 1 ]"

sync pull --data "$B" >/dev/null; check "machine B pulls" "grep -q 'local-1' '$B/mirror/runs.md'"
echo '- b rule | engineer | 3 | 2026-10-09 (proposed)' >> "$B/mirror/boundaries.md"
echo '- a rule | scout | 3 | 2026-10-09 (proposed)' >> "$A/mirror/boundaries.md"
sync push --data "$A" >/dev/null
sync push --data "$B" >/dev/null; check "stale proposal push is a conflict (exit 2)" "[ $? -eq 2 ]"
sync pull --data "$B" >/dev/null; check "pull keeps local proposal" "grep -q 'b rule.*(proposed)' '$B/mirror/boundaries.md' && grep -q '^- a rule' '$B/mirror/boundaries.md'"
sync push --data "$B" >/dev/null; check "push after pull succeeds" "[ $? -eq 0 ] && grep -q '^- b rule' '$T/gh/me/knowledge/knowledge/boundaries.md' && grep -q '^- a rule' '$T/gh/me/knowledge/knowledge/boundaries.md'"

rm -rf "$T"
echo "failures: $fails"
exit $fails
