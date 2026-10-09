import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT =
  process.env.CLAUDE_PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// Plugin env vars reach hooks but not Bash-tool commands, so skills pass --data explicitly.
export const DATA =
  arg('data') || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'plugins', 'data', 'model-router-manual');

export const SEED_FILES = [
  ['models.md', 'mirror/models.md'],
  ['runs.md', 'mirror/runs.md'],
  ['boundaries.md', 'mirror/boundaries.md'],
  ['CHANGELOG.md', 'mirror/CHANGELOG.md'],
  ['pending-runs.md', 'pending-runs.md'],
  ['prices.json', 'prices.json'],
];

export async function readStdinJson() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function bootstrap() {
  const created = [];
  for (const [src, dest] of SEED_FILES) {
    const target = path.join(DATA, dest);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'seed', src), target);
    created.push(dest);
  }
  const stateFile = path.join(DATA, 'state.json');
  if (!fs.existsSync(stateFile)) {
    writeJson(stateFile, { installedAt: new Date().toISOString(), lastPull: null, lastPush: null, lastModelCheck: '2026-10-09' });
    created.push('state.json');
  }
  return created;
}

export function knowledgeRepo() {
  const valid = (v) => /^[\w.-]+\/[\w.-]+$/.test((v || '').trim());
  for (const v of [arg('repo'), process.env.CLAUDE_PLUGIN_OPTION_KNOWLEDGE_REPO]) if (valid(v)) return v.trim();
  const cfg = readJson(path.join(DATA, 'config.json'), {});
  return (cfg.knowledge_repo || '').trim();
}

export function tableRows(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l) && !/^\|\s*id\s*\|/i.test(l));
}

export const TIERS = ['scout', 'builder', 'engineer', 'senior', 'architect'];

// Plain copies of the skill and agents that Claude Code hot-loads, used until the plugin itself loads.
export const SHIM_MARKER = 'generated-by: model-router-live-shim';
export const SHIM_SKILL_DIR = 'model-router-live';

export function shimPaths(claudeDir) {
  return [
    path.join(claudeDir, 'skills', SHIM_SKILL_DIR, 'SKILL.md'),
    ...TIERS.map((t) => path.join(claudeDir, 'agents', `model-router-${t}.md`)),
    ...TIERS.map((t) => path.join(claudeDir, 'skills', `model-router-${t}`, 'SKILL.md')),
  ];
}

// Deletes only files carrying the marker, so a user's own files with similar names survive.
export function removeShims(claudeDirs) {
  const removed = [];
  for (const dir of claudeDirs) {
    for (const file of shimPaths(dir)) {
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (!text.includes(SHIM_MARKER)) continue;
      fs.rmSync(file);
      removed.push(file);
      const parent = path.dirname(file);
      if (path.basename(path.dirname(parent)) === 'skills' && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
    }
  }
  return removed;
}

export function daysSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 86_400_000;
}
