import fs from 'node:fs';
import path from 'node:path';
import { DATA, bootstrap, knowledgeRepo, readJson, readStdinJson, tableRows, daysSince } from './lib.mjs';

try {
  await readStdinJson();
  const created = bootstrap();
  const state = readJson(path.join(DATA, 'state.json'), {});
  const repo = knowledgeRepo();
  const pending = tableRows(path.join(DATA, 'pending-runs.md')).length;

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

  const notes = [];
  if (created.length) notes.push(`first run: seeded ${created.join(', ')}`);
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
