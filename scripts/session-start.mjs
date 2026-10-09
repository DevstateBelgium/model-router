import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA, bootstrap, knowledgeRepo, readJson, readStdinJson, removeShims, tableRows, daysSince } from './lib.mjs';

try {
  const input = await readStdinJson();
  const created = bootstrap();
  const firstRun = created.includes('state.json');
  const state = readJson(path.join(DATA, 'state.json'), {});
  const repo = knowledgeRepo();
  const pending = tableRows(path.join(DATA, 'pending-runs.md')).length;

  // The plugin is loaded now, so the live-install shims would only duplicate its skill and agents.
  const shimDirs = [path.join(os.homedir(), '.claude')];
  if (input.cwd) shimDirs.push(path.join(input.cwd, '.claude'));
  const removedShims = process.env.CLAUDE_PLUGIN_ROOT ? removeShims(shimDirs) : [];

  let boundaries = [];
  try {
    boundaries = fs
      .readFileSync(path.join(DATA, 'mirror', 'boundaries.md'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith('- ') && !/proposed/i.test(l));
  } catch {}

  const lines = [
    `[model-router] data dir: ${DATA.replace(/\\/g, '/')}`,
    `knowledge repo: ${repo || 'not set (local-only)'} | last pull: ${state.lastPull || 'never'} | pending rows: ${pending} | active boundaries: ${boundaries.length}`,
  ];
  if (boundaries.length) lines.push(...boundaries.slice(0, 10));

  if (!state.configuredAt) {
    lines.push(
      firstRun
        ? 'FIRST RUN: model-router was just installed and is not configured. Unless /model-router:setup already ran in this session, invoke the model-router:setup skill at the start of your next reply, then continue with what the user asked.'
        : 'model-router setup was never completed. Offer /model-router:setup once, in one line, when it fits.',
    );
  }

  const notes = [];
  if (created.length) notes.push(`seeded ${created.join(', ')}`);
  if (removedShims.length) notes.push(`removed ${removedShims.length} live-install shim file(s); the plugin's own skill and agents are active`);
  if (repo && daysSince(state.lastPull) > 7) notes.push('mirror may be stale, suggest /model-router:pull once');
  if (daysSince(state.lastModelCheck) > 30) notes.push('last model check is over 30 days old, run the "New models" check');
  if (pending && process.env.CLAUDE_CODE_REMOTE === 'true')
    notes.push('cloud session with unpushed rows: they are lost when the session ends unless pushed');
  if (pending >= 5) notes.push('5+ pending rows: a routing review is due');
  if (notes.length) lines.push(`notes: ${notes.join('; ')}`);

  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } }),
  );
} catch (err) {
  process.stderr.write(`model-router session-start: ${err.message}\n`);
}
process.exit(0);
